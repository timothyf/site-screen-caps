# Site Screen Caps

A Playwright-based crawler and screenshot capture tool for DiamondIQ pages.

## What This Project Does

- Discovers and captures a focused subset of pages.
- Captures tab-level screenshots for selected game, team, and player pages.
- Optionally captures compare-page screenshots from explicit comparisons.
- Generates an index gallery at docs/screenshots/index.html.

## Project Structure

- capture-site.mjs: CLI entrypoint.
- src/config.mjs: Constants, routes, tabs, and high-level settings.
- src/crawler.mjs: Main crawl and orchestration logic.
- src/capture-workflows.mjs: Discovery and per-page capture workflows.
- src/browser-utils.mjs: Playwright wait/scroll/link helper functions.
- src/url-utils.mjs: URL normalization/classification and naming helpers.
- src/date-utils.mjs: Date formatting and lookback helpers.
- src/index-generator.mjs: HTML gallery generation.
- tests/date-utils.test.mjs: Unit tests for date helpers.
- tests/url-utils.test.mjs: Unit tests for URL and filename helpers.

## Requirements

- Node.js 20+
- npm

## Install

```bash
npm install
```

## Run Captures

```bash
npm run capture -- http://localhost:5173
```

This creates screenshots under docs/screenshots and updates docs/screenshots/index.html.

For Admin-only tabs, create a saved browser session once:

```bash
npm run auth:admin -- http://localhost:5173
```

Complete the Admin login in the browser window, then press Enter in the terminal. Run captures with that session using:

```bash
PLAYWRIGHT_STORAGE_STATE=auth/admin.json npm run capture -- http://localhost:5173
```

## Run Tests

```bash
npm test
```

Tests use Node's built-in test runner (node:test), so no extra test framework is required.

## Configuration Notes

Edit values in src/config.mjs to customize behavior:

- SELECTED_TEAM_NAME
- SELECTED_PLAYER_NAMES
- COMPARISONS
- MAX_PAGES
- MAX_GAME_LOOKBACK_DAYS
- MAIN_ROUTES
- GAME_TABS, TEAM_TABS, PLAYER_PAGE_TABS, PLAYER_PROFILE_TABS
- ACCOUNT_MENU_PAGES

## Typical Workflow

1. Update src/config.mjs for your target team/players.
2. Start your app locally.
3. Run npm run capture -- <url>.
4. Open docs/screenshots/index.html.
5. Run npm test after changes to helpers.
