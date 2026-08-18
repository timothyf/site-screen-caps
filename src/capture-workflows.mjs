import path from "path";
import {
  ACCOUNT_MENU_PAGES,
  COMPARE_DIR,
  COMPARE_PAGE_ROUTE,
  COMPARE_ROUTE,
  COMPARISONS,
  GAME_DIR,
  GAME_TABS,
  MAX_GAME_LOOKBACK_DAYS,
  OUTPUT_DIR,
  PLAYER_DIR,
  PLAYER_PAGE_TABS,
  PLAYER_PROFILE_TABS,
  SCHEDULE_ROUTE,
  SELECTED_PLAYER_NAMES,
  SELECTED_TEAM_NAME,
  TEAM_DIR,
  TEAM_TABS,
  TEAMS_ROUTE,
  TIME_ZONE,
} from "./config.mjs";
import { getTodayDate, subtractDays } from "./date-utils.mjs";
import { classifyUrl, normalizeUrl } from "./url-utils.mjs";
import {
  autoScroll,
  getInternalLinks,
  waitForContent,
  waitForLoaders,
  waitForPage,
} from "./browser-utils.mjs";

export function createCaptureState() {
  return {
    visited: new Set(),
    queued: new Set(),
    capturedPages: [],
    allowedGameUrls: new Set(),
    allowedPlayerUrls: new Set(),
    selectedTeamUrl: null,
    mostRecentSelectedTeamGameUrl: null,
    mostRecentSelectedTeamGameDate: null,
  };
}

export function shouldCaptureUrl(urlString, state) {
  const page = classifyUrl(urlString);

  if (page.type === "game") {
    return state.allowedGameUrls.has(urlString);
  }

  if (page.type === "player") {
    return state.allowedPlayerUrls.has(urlString);
  }

  if (page.type === "team") {
    return state.selectedTeamUrl !== null && urlString === state.selectedTeamUrl;
  }

  if (page.type === "compare") {
    return false;
  }

  return true;
}

export async function findSelectedTeamUrl(page, origin) {
  const teamsUrl = `${origin}${TEAMS_ROUTE}`;

  console.log("\nFinding selected team page...");

  await page.goto(teamsUrl, {
    waitUntil: "networkidle",
    timeout: 30000,
  });

  await waitForPage(page);

  const teamLinks = await page
    .locator('a[href*="/teams/"]')
    .evaluateAll((elements) =>
      elements.map((element) => ({
        href: element.getAttribute("href"),
        text: element.textContent?.trim() ?? "",
        title: element.getAttribute("title") ?? "",
        ariaLabel: element.getAttribute("aria-label") ?? "",
      }))
    );

  let match = teamLinks.find((link) => {
    const text = [link.text, link.title, link.ariaLabel].join(" ").toLowerCase();
    return text.includes(SELECTED_TEAM_NAME.toLowerCase());
  });

  if (!match) {
    const teamName = SELECTED_TEAM_NAME.split(" ")[1]?.toLowerCase() ?? "";

    match = teamLinks.find((link) => {
      const text = [link.text, link.title, link.ariaLabel].join(" ").toLowerCase();
      return new RegExp(`\\b${teamName}\\b`).test(text);
    });
  }

  if (match?.href) {
    const url = normalizeUrl(match.href, teamsUrl);

    if (url) {
      console.log(`${SELECTED_TEAM_NAME} page: ${url}`);
      return url;
    }
  }

  throw new Error(`Could not determine the ${SELECTED_TEAM_NAME} team URL.`);
}

async function findPlayerUrl(page, origin, playerName) {
  const search = page.getByPlaceholder("Find a player or team…").first();

  if (!(await search.count())) {
    throw new Error("Could not find the global player search input.");
  }

  await search.click();
  await search.fill("");
  await search.type(playerName, { delay: 40 });

  const result = page
    .getByRole("option")
    .filter({ hasText: playerName })
    .first();

  let optionVisible = false;

  try {
    await result.waitFor({ state: "visible", timeout: 10000 });
    optionVisible = true;
  } catch {
    optionVisible = false;
  }

  if (optionVisible) {
    const optionLink = result.locator("a[href]").first();

    if (await optionLink.count()) {
      const href = await optionLink.getAttribute("href");

      if (href) {
        return normalizeUrl(href, origin);
      }
    }
  }

  if (optionVisible) {
    try {
      await Promise.all([
        page.waitForURL(/\/players\/\d+\/?$/, { timeout: 10000 }),
        result.click(),
      ]);
    } catch {
      // Fall through to keyboard fallback.
    }
  }

  if (!/\/players\/\d+\/?$/.test(new URL(page.url()).pathname)) {
    await search.focus();

    try {
      await search.press("ArrowDown");
    } catch {
      // Ignore when widget does not support keyboard navigation.
    }

    await Promise.all([
      page.waitForURL(/\/players\/\d+\/?$/, { timeout: 10000 }),
      search.press("Enter"),
    ]);
  }

  const playerUrl = normalizeUrl(page.url(), origin);

  if (!playerUrl) {
    throw new Error(`Could not resolve URL for player ${playerName}.`);
  }

  await page.goto(origin, { waitUntil: "networkidle", timeout: 30000 });
  await waitForPage(page);

  return playerUrl;
}

export async function loadSelectedTeamPlayerUrls(page, origin, state) {
  state.selectedTeamUrl = await findSelectedTeamUrl(page, origin);

  console.log("\nFinding requested player profiles...");

  await page.goto(origin, { waitUntil: "networkidle", timeout: 30000 });
  await waitForPage(page);

  for (const playerName of SELECTED_PLAYER_NAMES) {
    const playerUrl = await findPlayerUrl(page, origin, playerName);

    if (playerUrl) {
      state.allowedPlayerUrls.add(playerUrl);
      console.log(`  ${playerName}: ${playerUrl}`);
    } else {
      console.warn(`  Could not find player profile for ${playerName}.`);
    }
  }

  console.log(`Found ${state.allowedPlayerUrls.size} selected team player page(s).`);
}

async function getScheduleGameCandidates(page, origin) {
  const candidates = await page
    .locator('a[href*="/games/"]')
    .evaluateAll((elements) =>
      elements.map((element) => {
        let container = element.closest([
          "tr",
          "article",
          "li",
          '[role="row"]',
          ".card",
          ".game",
          ".game-card",
          ".schedule-game",
        ].join(","));

        if (!container) {
          container = element.parentElement?.parentElement ?? element.parentElement ?? element;
        }

        return {
          href: element.getAttribute("href"),
          text: [
            element.textContent ?? "",
            container?.textContent ?? "",
            element.getAttribute("title") ?? "",
            element.getAttribute("aria-label") ?? "",
          ]
            .join(" ")
            .replace(/\s+/g, " "),
        };
      })
    );

  return candidates
    .map((candidate) => {
      const url = normalizeUrl(candidate.href, page.url());

      if (!url) {
        return null;
      }

      if (new URL(url).origin !== origin) {
        return null;
      }

      return { ...candidate, url };
    })
    .filter(Boolean);
}

function classifyScheduleGameStatus(rawText) {
  const text = (rawText ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  if (!text) {
    return "unknown";
  }

  if (/\b(final|final\/\d+|completed|game over)\b/i.test(text)) {
    return "completed";
  }

  if (/\b(live|in progress|top\s+\d+|bot\s+\d+|mid\s+\d+|end\s+\d+)\b/i.test(text)) {
    return "in-progress";
  }

  if (/\b(preview|scheduled|pregame|first pitch|probable pitchers)\b/i.test(text)) {
    return "upcoming";
  }

  if (/\b(postponed|suspended|cancelled|canceled|delayed)\b/i.test(text)) {
    return "not-completed";
  }

  return "unknown";
}

async function isCompletedGamePage(page, gameUrl) {
  await page.goto(gameUrl, {
    waitUntil: "networkidle",
    timeout: 30000,
  });

  await waitForPage(page);
  await waitForLoaders(page);

  let text = "";

  try {
    text = await page.locator("main").innerText();
  } catch {
    text = await page.locator("body").innerText();
  }

  const normalized = text.toLowerCase().replace(/\s+/g, " ");

  const hasCompleteSignal = /\b(final|completed|game over)\b/i.test(normalized);
  const hasIncompleteSignal = /\b(live|in progress|top\s+\d+|bot\s+\d+|mid\s+\d+|end\s+\d+|pregame|preview|scheduled|first pitch|probable pitchers|postponed|suspended|cancelled|canceled|delayed)\b/i.test(normalized);

  return hasCompleteSignal && !hasIncompleteSignal;
}

export async function findMostRecentSelectedTeamGame(page, origin, state) {
  const today = getTodayDate(TIME_ZONE);

  console.log("\nFinding most recent selected team game...");

  for (let daysAgo = 0; daysAgo <= MAX_GAME_LOOKBACK_DAYS; daysAgo++) {
    const date = subtractDays(today, daysAgo);
    const scheduleUrl = `${origin}${SCHEDULE_ROUTE}?date=${date}`;

    console.log(`Checking ${date}`);

    try {
      await page.goto(scheduleUrl, {
        waitUntil: "networkidle",
        timeout: 30000,
      });

      await waitForPage(page);

      const candidates = await getScheduleGameCandidates(page, origin);

      const selectedTeamGames = candidates.filter((candidate) => {
        const text = candidate.text.toLowerCase();

        return (
          text.includes(SELECTED_TEAM_NAME.toLowerCase()) ||
          new RegExp(`\\b${SELECTED_TEAM_NAME.split(" ")[1]?.toLowerCase() ?? ""}\\b`).test(text)
        );
      });

      if (selectedTeamGames.length === 0) {
        continue;
      }

      const uniqueGames = [];
      const seenGameUrls = new Set();

      for (const game of selectedTeamGames) {
        if (seenGameUrls.has(game.url)) {
          continue;
        }

        seenGameUrls.add(game.url);
        uniqueGames.push(game);
      }

      let gameUrl = null;

      for (let i = uniqueGames.length - 1; i >= 0; i--) {
        const game = uniqueGames[i];
        const status = classifyScheduleGameStatus(game.text);

        if (status === "in-progress" || status === "upcoming" || status === "not-completed") {
          continue;
        }

        if (status === "completed") {
          gameUrl = game.url;
          break;
        }

        if (await isCompletedGamePage(page, game.url)) {
          gameUrl = game.url;
          break;
        }
      }

      if (!gameUrl) {
        continue;
      }

      state.mostRecentSelectedTeamGameUrl = gameUrl;
      state.mostRecentSelectedTeamGameDate = date;
      state.allowedGameUrls.clear();
      state.allowedGameUrls.add(gameUrl);

      console.log(`Most recent ${SELECTED_TEAM_NAME} game: ${gameUrl}`);
      return gameUrl;
    } catch (error) {
      console.warn(`Could not inspect ${date}: ${error.message}`);
    }
  }

  throw new Error(`Could not locate a recent ${SELECTED_TEAM_NAME} game.`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tabNamePattern(label) {
  const escapedLabel = escapeRegExp(label.trim());

  // Tabs such as "Roster 26" and "Roster (26)" include a live count badge
  // in their accessible name even though the configured tab label is "Roster".
  return new RegExp(`^\\s*${escapedLabel}(?:\\s*[([]?\\s*\\d+\\s*[)\\]]?)?\\s*$`, "i");
}

function tabLabelVariants(label) {
  if (label === "Player Notes") {
    return [label, "Notes"];
  }

  return [label];
}

async function findTab(page, label) {
  const strategies = [];

  for (const variant of tabLabelVariants(label)) {
    const name = tabNamePattern(variant);

    strategies.push(
      page.getByRole("tab", { name, exact: false }).first(),
      page.getByRole("link", { name, exact: false }).first(),
      page.getByRole("button", { name, exact: false }).first(),
      page.getByText(name).first(),
    );
  }

  for (const locator of strategies) {
    if (await locator.count() && (await locator.isVisible().catch(() => false))) {
      return locator;
    }
  }

  return null;
}

async function activateTab(page, label) {
  const tab = await findTab(page, label);

  if (!tab) {
    throw new Error(`Could not find tab "${label}".`);
  }

  await tab.scrollIntoViewIfNeeded();
  await tab.click();
  await waitForContent(page);
  await waitForLoaders(page);
  await page.waitForTimeout(300);
}

export async function captureGameTabs(page, gameUrl, origin, state) {
  const gameInfo = classifyUrl(gameUrl);
  const gameId = gameInfo.id;

  console.log(`\nCapturing game ${gameId} tabs...`);

  await page.goto(gameUrl, {
    waitUntil: "networkidle",
    timeout: 30000,
  });

  await waitForPage(page);

  const title = (await page.title()).trim() || `Game ${gameId}`;

  for (const tab of GAME_TABS) {
    try {
      console.log(`  Tab: ${tab.label}`);

      await activateTab(page, tab.label);
      await autoScroll(page);
      await waitForContent(page);

      const relativePath = path.join(GAME_DIR, `game-${gameId}-${tab.filename}.png`);

      await page.screenshot({
        path: path.join(OUTPUT_DIR, relativePath),
        fullPage: true,
      });

      state.capturedPages.push({
        url: page.url(),
        canonicalUrl: gameUrl,
        screenshotPath: relativePath,
        title: `${title} - ${tab.label}`,
        type: "game",
        id: gameId,
        tab: tab.label,
      });

      console.log(`    Captured: ${relativePath}`);
    } catch (error) {
      console.error(`ERROR capturing game tab "${tab.label}": ${error.message}`);
    }
  }

  return getInternalLinks(page, origin);
}

export async function captureTeamTabs(page, teamUrl, origin, state) {
  const teamInfo = classifyUrl(teamUrl);
  const teamId = teamInfo.id;

  console.log(`\nCapturing ${SELECTED_TEAM_NAME} team tabs...`);

  await page.goto(teamUrl, {
    waitUntil: "networkidle",
    timeout: 30000,
  });

  await waitForPage(page);

  const title = (await page.title()).trim() || SELECTED_TEAM_NAME;
  const internalLinks = new Set();

  for (const tab of TEAM_TABS) {
    try {
      console.log(`  Tab: ${tab.label}`);

      await activateTab(page, tab.label);
      await autoScroll(page);
      await waitForContent(page);

      const relativePath = path.join(TEAM_DIR, `team-${teamId}-${tab.filename}.png`);

      await page.screenshot({
        path: path.join(OUTPUT_DIR, relativePath),
        fullPage: true,
      });

      state.capturedPages.push({
        url: page.url(),
        canonicalUrl: teamUrl,
        screenshotPath: relativePath,
        title: `${title} - ${tab.label}`,
        type: "team",
        id: teamId,
        tab: tab.label,
      });

      console.log(`    Captured: ${relativePath}`);

      for (const link of await getInternalLinks(page, origin)) {
        internalLinks.add(link);
      }
    } catch (error) {
      console.error(`ERROR capturing team tab "${tab.label}": ${error.message}`);
    }
  }

  return [...internalLinks];
}

export function getPlayerPageTabs(isPitcher = false) {
  const tabs = [...PLAYER_PAGE_TABS];

  if (isPitcher && !tabs.some((tab) => tab.label === "Pitch Arsenal")) {
    tabs.push({ label: "Pitch Arsenal", filename: "pitch-arsenal" });
  }

  return tabs;
}

async function isPitcherPlayer(page) {
  const pageText = await page.locator("main").innerText().catch(() => "");
  const upper = pageText.toLowerCase();

  if (/\bpitcher\b/i.test(upper) || /position\s*[:\-]?\s*P\b/i.test(upper)) {
    return true;
  }

  const roleLabel = page.getByText(/Pitcher|P\b/i).first();

  try {
    return (await roleLabel.count()) > 0 && (await roleLabel.isVisible().catch(() => false));
  } catch {
    return false;
  }
}

export async function capturePlayerTabs(page, playerUrl, origin, state) {
  const playerId = classifyUrl(playerUrl).id;
  const playerName = `Player ${playerId}`;

  console.log(`\nCapturing player ${playerId} tabs...`);

  await page.goto(playerUrl, {
    waitUntil: "networkidle",
    timeout: 30000,
  });

  await waitForPage(page);

  const title = (await page.title()).trim() || playerName;
  const playerTabs = getPlayerPageTabs(await isPitcherPlayer(page));

  for (const pageTab of playerTabs) {
    try {
      await activateTab(page, pageTab.label);
    } catch (error) {
      console.warn(`  Skipping unavailable player tab "${pageTab.label}": ${error.message}`);
      continue;
    }

    if (pageTab.filename === "overview") {
      for (const profileTab of PLAYER_PROFILE_TABS) {
        await activateTab(page, profileTab.label);
        await autoScroll(page);
        await waitForContent(page);

        const relativePath = path.join(PLAYER_DIR, `player-${playerId}-overview-${profileTab.filename}.png`);

        await page.screenshot({
          path: path.join(OUTPUT_DIR, relativePath),
          fullPage: true,
        });

        state.capturedPages.push({
          url: page.url(),
          canonicalUrl: playerUrl,
          screenshotPath: relativePath,
          title: `${title} - Overview - ${profileTab.label}`,
          type: "player",
          id: playerId,
          tab: `Overview - ${profileTab.label}`,
        });

        console.log(`  Captured: ${relativePath}`);
      }

      continue;
    }

    await autoScroll(page);
    await waitForContent(page);

    const relativePath = path.join(PLAYER_DIR, `player-${playerId}-${pageTab.filename}.png`);

    await page.screenshot({
      path: path.join(OUTPUT_DIR, relativePath),
      fullPage: true,
    });

    state.capturedPages.push({
      url: page.url(),
      canonicalUrl: playerUrl,
      screenshotPath: relativePath,
      title: `${title} - ${pageTab.label}`,
      type: "player",
      id: playerId,
      tab: pageTab.label,
    });

    console.log(`  Captured: ${relativePath}`);
  }

  return getInternalLinks(page, origin);
}

async function getComparisonInput(page, side) {
  const placeholder = side === "A" ? /search player a/i : /search player b/i;

  const byPlaceholder = page.getByPlaceholder(placeholder).first();

  if (await byPlaceholder.count()) {
    const insideHeader = await byPlaceholder.evaluate((element) => Boolean(element.closest("header, nav")));

    if (!insideHeader && (await byPlaceholder.isVisible())) {
      return byPlaceholder;
    }
  }

  const selector = side === "A"
    ? 'main input[placeholder*="player a" i]'
    : 'main input[placeholder*="player b" i]';

  const fallback = page.locator(selector).first();

  if (await fallback.count() && (await fallback.isVisible())) {
    return fallback;
  }

  throw new Error(`Could not find Player ${side} comparison input.`);
}

async function findComparisonOption(page, playerName) {
  const target = playerName.trim().toLowerCase();
  const selectors = [
    ".p-autocomplete-option",
    ".p-autocomplete-item",
    ".p-select-option",
    ".p-dropdown-item",
    ".p-listbox-option",
    "[role='option']",
  ];

  const deadline = Date.now() + 10000;

  while (Date.now() < deadline) {
    for (const selector of selectors) {
      const candidates = page.locator(selector);
      const count = await candidates.count();

      for (let i = 0; i < count; i++) {
        const candidate = candidates.nth(i);

        try {
          if (!(await candidate.isVisible())) {
            continue;
          }

          const text = (await candidate.innerText())
            .trim()
            .replace(/\s+/g, " ")
            .toLowerCase();

          if (text === target || text.startsWith(target) || text.includes(target)) {
            return candidate;
          }
        } catch {
          // Ignore transient results.
        }
      }
    }

    const matches = page.getByText(playerName, { exact: true });
    const count = await matches.count();

    for (let i = count - 1; i >= 0; i--) {
      const candidate = matches.nth(i);

      try {
        if (!(await candidate.isVisible())) {
          continue;
        }

        const inHeader = await candidate.evaluate((element) => Boolean(element.closest("header, nav")));

        if (!inHeader) {
          return candidate;
        }
      } catch {
        // Ignore.
      }
    }

    await page.waitForTimeout(250);
  }

  return null;
}

async function waitForComparisonPlayerCard(page, side, playerName) {
  console.log(`  Verifying Player ${side}: ${playerName}`);

  const playerText = page
    .locator("main")
    .getByText(playerName, { exact: true });

  try {
    await playerText.first().waitFor({
      state: "visible",
      timeout: 10000,
    });
  } catch {
    throw new Error(`Player ${side} did not update to "${playerName}" after selection.`);
  }

  const placeholder = side === "A" ? /search player a/i : /search player b/i;
  const oldInput = page.getByPlaceholder(placeholder);

  try {
    if (await oldInput.count()) {
      await oldInput.first().waitFor({
        state: "hidden",
        timeout: 3000,
      });
    }
  } catch {
    // Some versions may leave the input mounted.
  }

  console.log(`  Verified Player ${side}: ${playerName}`);
}

async function selectComparisonPlayer(page, side, playerName) {
  console.log(`  Selecting Player ${side}: ${playerName}`);

  if (!COMPARE_ROUTE.test(new URL(page.url()).pathname)) {
    throw new Error(`Not on Compare page before selecting ${playerName}. Current URL: ${page.url()}`);
  }

  const input = await getComparisonInput(page, side);

  await input.scrollIntoViewIfNeeded();
  await input.click();

  try {
    await input.fill("");
  } catch {
    // Ignore if already empty.
  }

  await input.type(playerName, { delay: 75 });

  const option = await findComparisonOption(page, playerName);

  if (!option) {
    throw new Error(`Could not find autocomplete result for Player ${side}: "${playerName}".`);
  }

  await option.scrollIntoViewIfNeeded();
  await option.click();

  if (!COMPARE_ROUTE.test(new URL(page.url()).pathname)) {
    throw new Error(`Selecting "${playerName}" navigated away from the Compare page.`);
  }

  await waitForComparisonPlayerCard(page, side, playerName);

  console.log(`  Selected Player ${side}: ${playerName}`);
}

async function waitForComparisonResults(page, comparison) {
  console.log("  Waiting for comparison results...");

  for (const playerName of [comparison.player1, comparison.player2]) {
    const player = page
      .locator("main")
      .getByText(playerName, { exact: true })
      .first();

    await player.waitFor({
      state: "visible",
      timeout: 10000,
    });
  }

  const loadingText = page.getByText(/Loading player profiles/i);

  try {
    if (await loadingText.count()) {
      await loadingText.first().waitFor({
        state: "hidden",
        timeout: 30000,
      });
    }
  } catch {
    throw new Error("Comparison remained on 'Loading player profiles...' for more than 30 seconds.");
  }

  await waitForLoaders(page);
  await page.waitForTimeout(1500);

  console.log("  Comparison results loaded.");
}

async function captureComparison(page, origin, comparison, state) {
  const compareUrl = `${origin}${COMPARE_PAGE_ROUTE}`;

  console.log(`\nCapturing comparison: ${comparison.player1} vs ${comparison.player2}`);

  await page.goto(compareUrl, {
    waitUntil: "networkidle",
    timeout: 30000,
  });

  await waitForPage(page);

  await getComparisonInput(page, "A");
  await getComparisonInput(page, "B");

  await selectComparisonPlayer(page, "A", comparison.player1);
  await page.waitForTimeout(500);
  await selectComparisonPlayer(page, "B", comparison.player2);
  await waitForComparisonResults(page, comparison);

  await autoScroll(page);
  await page.waitForTimeout(500);

  for (const playerName of [comparison.player1, comparison.player2]) {
    const player = page
      .locator("main")
      .getByText(playerName, { exact: true })
      .first();

    if (!(await player.isVisible())) {
      throw new Error(`Comparison is incomplete: "${playerName}" is not visible.`);
    }
  }

  const relativePath = path.join(COMPARE_DIR, comparison.filename);
  const filepath = path.join(OUTPUT_DIR, relativePath);

  await page.screenshot({
    path: filepath,
    fullPage: true,
  });

  state.capturedPages.push({
    url: page.url(),
    screenshotPath: relativePath,
    title: `${comparison.player1} vs ${comparison.player2}`,
    type: "compare",
    id: null,
  });

  console.log(`Captured: ${filepath}`);
}

export async function captureComparisons(page, origin, state) {
  console.log(`\nCapturing ${COMPARISONS.length} requested comparisons...`);

  for (const comparison of COMPARISONS) {
    try {
      await captureComparison(page, origin, comparison, state);
    } catch (error) {
      console.error(`ERROR capturing ${comparison.player1} vs ${comparison.player2}: ${error.message}`);

      const debugName = comparison.filename.replace(".png", "-FAILED.png");
      const debugPath = path.join(OUTPUT_DIR, COMPARE_DIR, debugName);

      try {
        await page.screenshot({
          path: debugPath,
          fullPage: true,
        });

        console.error(`Debug screenshot: ${debugPath}`);
      } catch {
        // Ignore diagnostic screenshot failure.
      }

      try {
        const inputs = await page.locator("input").evaluateAll((elements) =>
          elements.map((element) => ({
            placeholder: element.getAttribute("placeholder"),
            value: element.value,
            role: element.getAttribute("role"),
            insideMain: Boolean(element.closest("main")),
            insideHeader: Boolean(element.closest("header")),
          }))
        );

        console.log("Inputs at failure:");
        console.dir(inputs, { depth: null });
      } catch {
        // Ignore.
      }
    }
  }
}

async function findVisibleLocator(locator) {
  const count = await locator.count();

  for (let i = 0; i < count; i++) {
    const candidate = locator.nth(i);

    if (await candidate.isVisible().catch(() => false)) {
      return candidate;
    }
  }

  return null;
}

async function findAccountMenuItem(page, label) {
  const byLink = await findVisibleLocator(
    page.getByRole("link", {
      name: new RegExp(`^${escapeRegExp(label)}$`, "i"),
    })
  );

  if (byLink) {
    return byLink;
  }

  return findVisibleLocator(
    page.getByText(new RegExp(`^${escapeRegExp(label)}$`, "i"))
  );
}

async function openAccountMenu(page) {
  const triggers = page.locator([
    'header [aria-haspopup="menu"]',
    'nav [aria-haspopup="menu"]',
    'header button',
    'nav button',
    'header [role="button"]',
    'nav [role="button"]',
    'body > * button',
    'body > * [role="button"]',
  ].join(","));

  for (let i = 0; i < await triggers.count(); i++) {
    const trigger = triggers.nth(i);

    if (!(await trigger.isVisible().catch(() => false))) {
      continue;
    }

    const isTopRightControl = await trigger.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth;

      return rect.top >= 0 && rect.top < 160 && rect.right > viewportWidth * 0.7;
    }).catch(() => false);

    if (!isTopRightControl) {
      continue;
    }

    const pageUrlBeforeClick = page.url();

    await trigger.click();
    await page.waitForTimeout(250);

    const links = new Map();

    for (const target of ACCOUNT_MENU_PAGES) {
      const link = await findAccountMenuItem(page, target.label);

      if (link) {
        links.set(target.label, link);
      }
    }

    if (links.size > 0) {
      return links;
    }

    await page.keyboard.press("Escape").catch(() => {});

    if (page.url() !== pageUrlBeforeClick) {
      await page.goto(pageUrlBeforeClick, {
        waitUntil: "networkidle",
        timeout: 30000,
      });
      await waitForPage(page);
    }
  }

  return null;
}

export async function captureAccountMenuPages(page, origin, state) {
  console.log("\nCapturing authenticated account pages...");

  await page.goto(origin, {
    waitUntil: "networkidle",
    timeout: 30000,
  });
  await waitForPage(page);

  const menu = await openAccountMenu(page);

  if (!menu) {
    console.log("  No Admin account menu found; skipping Admin and Watchlists.");
    return;
  }

  const targets = ACCOUNT_MENU_PAGES.map((target) => ({
    ...target,
    link: menu.get(target.label),
  })).map((target) => ({
    ...target,
    hrefPromise: target.link?.getAttribute("href"),
  }));

  for (const target of targets) {
    if (!target.hrefPromise) {
      console.log(`  ${target.label} link is unavailable; skipping.`);
      continue;
    }

    const href = await target.hrefPromise;
    const url = normalizeUrl(href, page.url());

    if (!url) {
      console.warn(`  Could not resolve the ${target.label} link.`);
      continue;
    }

    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    await waitForPage(page);
    await autoScroll(page);
    await waitForContent(page);

    const relativePath = target.filename;
    await page.screenshot({
      path: path.join(OUTPUT_DIR, relativePath),
      fullPage: true,
    });

    state.capturedPages.push({
      url: page.url(),
      screenshotPath: relativePath,
      title: (await page.title()).trim() || target.label,
      type: "general",
    });

    console.log(`  Captured: ${relativePath}`);
  }
}
