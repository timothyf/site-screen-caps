import fs from "fs/promises";
import path from "path";
import {
  GAME_TABS,
  OUTPUT_DIR,
  SELECTED_TEAM_NAME,
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
    case "game":
      return `Most Recent ${SELECTED_TEAM_NAME} Game`;
    case "player":
      return "Players";
    case "team":
      return SELECTED_TEAM_NAME;
    case "compare":
      return "Comparisons";
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

export async function generateIndex(capturedPages, mostRecentSelectedTeamGameDate) {
  const types = ["game", "player", "team", "compare", "general"];

  const sections = types
    .map((type) => {
      const pages = capturedPages
        .filter((page) => page.type === type)
        .sort((a, b) => {
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

  const gameCount = capturedPages.filter((page) => page.type === "game").length;
  const playerCount = capturedPages.filter((page) => page.type === "player").length;
  const teamCount = capturedPages.filter((page) => page.type === "team").length;
  const compareCount = capturedPages.filter((page) => page.type === "compare").length;
  const otherCount = capturedPages.filter((page) => page.type === "general").length;

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
