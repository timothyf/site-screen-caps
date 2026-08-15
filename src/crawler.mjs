import fs from "fs/promises";
import path from "path";
import { chromium } from "playwright";
import {
  COMPARISONS,
  COMPARE_DIR,
  GAME_DIR,
  GAME_TABS,
  MAIN_ROUTES,
  MAX_PAGES,
  OUTPUT_DIR,
  PLAYER_DIR,
  PLAYER_PAGE_TABS,
  PLAYER_PROFILE_TABS,
  SELECTED_PLAYER_NAMES,
  TEAM_DIR,
  TEAM_TABS,
  VIEWPORT,
} from "./config.mjs";
import { canonicalizeCrawlUrl } from "./url-utils.mjs";
import { classifyUrl, normalizeUrl, screenshotRelativePath, shouldSkipAsset } from "./url-utils.mjs";
import { autoScroll, getInternalLinks, waitForContent, waitForPage } from "./browser-utils.mjs";
import {
  captureComparisons,
  captureAccountMenuPages,
  captureGameTabs,
  capturePlayerTabs,
  captureTeamTabs,
  createCaptureState,
  findMostRecentSelectedTeamGame,
  loadSelectedTeamPlayerUrls,
  shouldCaptureUrl,
} from "./capture-workflows.mjs";
import { generateIndex } from "./index-generator.mjs";

function addToQueue(queue, rawUrl, baseUrl, state) {
  const normalized = normalizeUrl(rawUrl, baseUrl);

  if (!normalized) {
    return;
  }

  const crawlUrl = canonicalizeCrawlUrl(normalized);
  if (!crawlUrl) {
    return;
  }

  if (state.visited.has(crawlUrl) || state.queued.has(crawlUrl)) {
    return;
  }

  queue.push(crawlUrl);
  state.queued.add(crawlUrl);
}

function countByType(items, type) {
  return items.filter((item) => item.type === type).length;
}

function expectedPlayerShotsPerPlayer() {
  return PLAYER_PROFILE_TABS.length + PLAYER_PAGE_TABS.length - 1;
}

export async function crawl(startUrl) {
  const start = normalizeUrl(startUrl, startUrl);

  if (!start) {
    throw new Error(`Invalid URL: ${startUrl}`);
  }

  const origin = new URL(start).origin;
  const state = createCaptureState();

  await Promise.all([
    fs.mkdir(OUTPUT_DIR, { recursive: true }),
    fs.mkdir(path.join(OUTPUT_DIR, GAME_DIR), { recursive: true }),
    fs.mkdir(path.join(OUTPUT_DIR, PLAYER_DIR), { recursive: true }),
    fs.mkdir(path.join(OUTPUT_DIR, TEAM_DIR), { recursive: true }),
    fs.mkdir(path.join(OUTPUT_DIR, COMPARE_DIR), { recursive: true }),
  ]);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    storageState: process.env.PLAYWRIGHT_STORAGE_STATE || undefined,
  });

  const discoveryPage = await context.newPage();
  await loadSelectedTeamPlayerUrls(discoveryPage, origin, state);
  await findMostRecentSelectedTeamGame(discoveryPage, origin, state);
  await discoveryPage.close();

  const page = await context.newPage();
  const queue = [];

  addToQueue(queue, start, start, state);

  for (const route of MAIN_ROUTES) {
    addToQueue(queue, `${origin}${route}`, start, state);
  }

  for (const url of state.allowedPlayerUrls) {
    addToQueue(queue, url, start, state);
  }

  if (state.selectedTeamUrl) {
    addToQueue(queue, state.selectedTeamUrl, start, state);
  }

  if (state.mostRecentSelectedTeamGameUrl) {
    addToQueue(queue, state.mostRecentSelectedTeamGameUrl, start, state);
  }

  while (queue.length > 0 && state.visited.size < MAX_PAGES) {
    const currentUrl = queue.shift();
    state.queued.delete(currentUrl);

    if (state.visited.has(currentUrl)) {
      continue;
    }

    if (shouldSkipAsset(currentUrl)) {
      continue;
    }

    if (!shouldCaptureUrl(currentUrl, state)) {
      continue;
    }

    const pageInfo = classifyUrl(currentUrl);

    state.visited.add(currentUrl);

    console.log(`\n[${state.visited.size}] [${pageInfo.type}] ${currentUrl}`);

    try {
      if (pageInfo.type === "game") {
        const links = await captureGameTabs(page, currentUrl, origin, state);

        for (const link of links) {
          if (shouldCaptureUrl(link, state)) {
            addToQueue(queue, link, start, state);
          }
        }

        continue;
      }

      if (pageInfo.type === "team") {
        const links = await captureTeamTabs(page, currentUrl, origin, state);

        for (const link of links) {
          if (shouldCaptureUrl(link, state)) {
            addToQueue(queue, link, start, state);
          }
        }

        continue;
      }

      if (pageInfo.type === "player") {
        const links = await capturePlayerTabs(page, currentUrl, origin, state);

        for (const link of links) {
          if (shouldCaptureUrl(link, state)) {
            addToQueue(queue, link, start, state);
          }
        }

        continue;
      }

      const response = await page.goto(currentUrl, {
        waitUntil: "networkidle",
        timeout: 30000,
      });

      if (!response || !response.ok()) {
        console.warn(`Unable to load ${currentUrl}`);
        continue;
      }

      await waitForPage(page);
      await autoScroll(page);
      await waitForContent(page);

      const title = (await page.title()).trim() || currentUrl;
      const relativePath = screenshotRelativePath(currentUrl);

      await page.screenshot({
        path: path.join(OUTPUT_DIR, relativePath),
        fullPage: true,
      });

      state.capturedPages.push({
        url: currentUrl,
        screenshotPath: relativePath,
        title,
        type: pageInfo.type,
        id: pageInfo.id,
      });

      console.log(`Captured: ${relativePath}`);

      const links = await getInternalLinks(page, origin);

      for (const link of links) {
        if (shouldCaptureUrl(link, state)) {
          addToQueue(queue, link, start, state);
        }
      }
    } catch (error) {
      console.error(`ERROR: ${currentUrl}\n${error.message}`);
    }
  }

  await captureComparisons(page, origin, state);
  await captureAccountMenuPages(page, origin, state);
  await browser.close();

  await generateIndex(state.capturedPages, state.mostRecentSelectedTeamGameDate);

  const gameCount = countByType(state.capturedPages, "game");
  const playerCount = countByType(state.capturedPages, "player");
  const teamCount = countByType(state.capturedPages, "team");
  const compareCount = countByType(state.capturedPages, "compare");

  console.log("\n================================");
  console.log("DiamondIQ capture complete");
  console.log("================================");
  console.log(`Most recent selected team game: ${state.mostRecentSelectedTeamGameUrl ?? "not found"}`);
  console.log(`Game tab screenshots: ${gameCount}/${GAME_TABS.length}`);
  console.log(
    `Requested player profiles captured: ${playerCount}/${SELECTED_PLAYER_NAMES.length * expectedPlayerShotsPerPlayer()}`
  );
  console.log(`Selected team screenshots: ${teamCount}/${TEAM_TABS.length}`);
  console.log(`Comparison screenshots: ${compareCount}/${COMPARISONS.length}`);
  console.log(`Total screenshots: ${state.capturedPages.length}`);
  console.log(`Index: ${OUTPUT_DIR}/index.html`);
}
