import fs from "fs/promises";
import path from "path";
import {
  GAME_TABS,
  OUTPUT_DIR,
  SELECTED_TEAM_NAME,
  TEAM_PAGE_ROUTE_PREFIXES,
  TEAM_TABS,
  TIME_ZONE,
} from "./config.mjs";
import { getTodayDate } from "./date-utils.mjs";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function categoryLabel(type) {
  switch (type) {
    case "top-level":
      return "Top Level";
    case "game":
      return `Most Recent ${SELECTED_TEAM_NAME} Game`;
    case "player":
      return "Players";
    case "team":
      return SELECTED_TEAM_NAME;
    case "compare":
      return "Comparisons";
    case "admin":
      return "Admin";
    case "watchlists":
      return "Watchlists";
    default:
      return "Other Pages";
  }
}

function tabSortIndex(type, label) {
  if (type === "game") {
    return GAME_TABS.findIndex((tab) => tab.label === label);
  }

  if (type === "team") {
    return TEAM_TABS.findIndex((tab) => tab.label === label);
  }

  return -1;
}

function pagePathname(url) {
  try {
    return new URL(url).pathname.replace(/\/+$/, "") || "/";
  } catch {
    return "/";
  }
}

function sectionType(page) {
  const pathname = pagePathname(page.url);

  if (pathname === "/" || ["/schedule", "/standings", "/explore", "/teams"].includes(pathname)) {
    return "top-level";
  }

  if (pathname === "/admin") {
    return "admin";
  }

  if (pathname === "/watchlists") {
    return "watchlists";
  }

  if (page.type === "general") {

    if (TEAM_PAGE_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
      return "team";
    }
  }

  return page.type;
}

function routeDisplayName(url) {
  const pathname = pagePathname(url);

  if (pathname === "/") {
    return "Home";
  }

  const names = {
    "/admin": "Admin",
    "/explore": "Stat Explorer",
    "/login": "Login",
    "/schedule": "Schedule",
    "/standings": "Standings",
    "/watchlists": "Watchlists",
  };

  if (names[pathname]) {
    return names[pathname];
  }

  const segments = pathname.split("/").filter(Boolean);
  const lastSegment = segments.at(-1) ?? "page";
  const identifier = /^\d+$/.test(lastSegment) ? ` ${lastSegment}` : "";
  const nameSegment = identifier ? segments.at(-2) : lastSegment;
  const label = nameSegment
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

  if (label.toLowerCase() === "lineup scenarios") {
    return `Lineup Scenario${identifier}`;
  }

  if (label.toLowerCase() === "opponent reports") {
    return `Opponent Report${identifier}`;
  }

  return `${label}${identifier}`.trim();
}

function displayTitle(page) {
  const title = String(page.title ?? "")
    .replace(/^Vite App\s*-\s*/i, "")
    .trim();

  return title && !/^Vite App$/i.test(title) ? title : routeDisplayName(page.url);
}

function topLevelSortIndex(url) {
  return ["/", "/schedule", "/standings", "/explore", "/teams"].indexOf(pagePathname(url));
}

export async function generateIndex(capturedPages, mostRecentSelectedTeamGameDate) {
  const types = ["top-level", "game", "player", "team", "compare", "admin", "watchlists", "general"];

  const sections = types
    .map((type) => {
      const pages = capturedPages
        .filter((page) => sectionType(page) === type)
        .map((page) => ({ ...page, title: displayTitle(page) }))
        .sort((a, b) => {
          if (type === "top-level") {
            return topLevelSortIndex(a.url) - topLevelSortIndex(b.url);
          }

          if (type === "team") {
            const aSpecial = !a.tab;
            const bSpecial = !b.tab;

            if (aSpecial !== bSpecial) {
              return aSpecial ? 1 : -1;
            }
          }

          if (a.tab && b.tab) {
            return tabSortIndex(type, a.tab) - tabSortIndex(type, b.tab);
          }

          return a.title.localeCompare(b.title);
        });

      if (pages.length === 0) {
        return "";
      }

      const cards = pages
        .map(
          ({ url, screenshotPath, title, tab }) => `
<article class="card">

  <a
    class="screenshot-link"
    href="${encodeURI(screenshotPath)}"
    target="_blank"
  >
    <img
      src="${encodeURI(screenshotPath)}"
      alt="${escapeHtml(title)}"
      loading="lazy"
    >
  </a>

  <div class="details">

    <h3>
      ${escapeHtml(title)}
    </h3>

    ${
      tab
        ? `
    <div class="tab-label">
      ${escapeHtml(tab)}
    </div>
`
        : ""
    }

    <a
      class="url"
      href="${escapeHtml(url)}"
      target="_blank"
      rel="noopener noreferrer"
    >
      ${escapeHtml(url)}
    </a>

    <a
      href="${encodeURI(screenshotPath)}"
      target="_blank"
    >
      View full screenshot
    </a>

  </div>

</article>
`
        )
        .join("\n");

      return `
<section>

  <h2>
    ${categoryLabel(type)}
    <span>
      ${pages.length}
    </span>
  </h2>

  <div class="gallery">
    ${cards}
  </div>

</section>
`;
    })
    .join("\n");

  const topLevelCount = capturedPages.filter((page) => sectionType(page) === "top-level").length;
  const gameCount = capturedPages.filter((page) => sectionType(page) === "game").length;
  const playerCount = capturedPages.filter((page) => sectionType(page) === "player").length;
  const teamCount = capturedPages.filter((page) => sectionType(page) === "team").length;
  const compareCount = capturedPages.filter((page) => sectionType(page) === "compare").length;
  const otherCount = capturedPages.filter((page) => sectionType(page) === "general").length;

  const html = `<!DOCTYPE html>
<html lang="en">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1"
>

<title>
  DiamondIQ Screenshot Index
</title>

<style>

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family:
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    Roboto,
    Helvetica,
    Arial,
    sans-serif;
  background: #f5f6f8;
  color: #202124;
}

header {
  padding: 24px 32px;
  background: white;
  border-bottom: 1px solid #ddd;
  position: sticky;
  top: 0;
  z-index: 10;
}

header h1 {
  margin: 0 0 8px;
}

header p {
  margin: 0;
  color: #666;
}

.summary {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 14px;
}

.summary span {
  background: #f0f1f3;
  border-radius: 20px;
  padding: 6px 12px;
  font-size: 13px;
}

main {
  padding: 30px;
}

section {
  margin-bottom: 50px;
}

section > h2 {
  display: flex;
  gap: 10px;
  align-items: center;
  border-bottom: 1px solid #ddd;
  padding-bottom: 10px;
}

section > h2 span {
  background: #ddd;
  border-radius: 20px;
  padding: 3px 9px;
  font-size: 13px;
}

.gallery {
  display: grid;
  grid-template-columns:
    repeat(
      auto-fill,
      minmax(320px, 1fr)
    );
  gap: 24px;
  align-items: start;
}

.card {
  background: white;
  border: 1px solid #ddd;
  border-radius: 10px;
  overflow: hidden;
}

.screenshot-link {
  display: block;
  height: 300px;
  overflow: hidden;
  background: #e9eaed;
  border-bottom: 1px solid #ddd;
}

.screenshot-link img {
  display: block;
  width: 100%;
  height: auto;
  object-position: top;
}

.details {
  padding: 16px;
}

.details h3 {
  margin: 0 0 10px;
  font-size: 17px;
}

.tab-label {
  display: inline-block;
  margin-bottom: 10px;
  padding: 4px 9px;
  border-radius: 14px;
  background: #f0f1f3;
  font-size: 12px;
  font-weight: 600;
}

.url {
  display: block;
  margin-bottom: 12px;
  color: #1769aa;
  font-size: 13px;
  overflow-wrap: anywhere;
}

@media (max-width: 600px) {

  header {
    padding: 18px;
  }

  main {
    padding: 18px;
  }

  .gallery {
    grid-template-columns: 1fr;
  }

}

</style>

</head>

<body>

<header>

<h1>
  DiamondIQ Screenshot Index
</h1>

<p>
  ${escapeHtml(getTodayDate(TIME_ZONE))}
  &mdash;
  ${capturedPages.length}
  screenshots
</p>

<div class="summary">

  <span>
    ${topLevelCount}
    top-level pages
  </span>

  <span>
    ${gameCount}
    game tab screenshots
  </span>

  <span>
    ${playerCount}
    Selected team players
  </span>

  <span>
    ${teamCount}
    Selected team tab screenshots
  </span>

  <span>
    ${compareCount}
    comparisons
  </span>

  <span>
    ${otherCount}
    other pages
  </span>

</div>

${
  mostRecentSelectedTeamGameDate
    ? `
<p style="margin-top: 12px;">
  Most recent Selected Team game:
  ${escapeHtml(mostRecentSelectedTeamGameDate)}
</p>
`
    : ""
}

</header>

<main>
${sections}
</main>

</body>

</html>`;

  await fs.writeFile(path.join(OUTPUT_DIR, "index.html"), html, "utf8");
}
