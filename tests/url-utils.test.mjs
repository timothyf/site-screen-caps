import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalizeCrawlUrl,
  classifyUrl,
  isLoginPageUrl,
  normalizeUrl,
  pageDirectory,
  screenshotFilename,
  screenshotRelativePath,
  shouldSkipAsset,
} from "../src/url-utils.mjs";

test("normalizeUrl strips hash and trailing slash", () => {
  const result = normalizeUrl("/teams/12/#section", "https://example.com");
  assert.equal(result, "https://example.com/teams/12");
});

test("normalizeUrl rejects unsupported protocols", () => {
  const result = normalizeUrl("mailto:test@example.com", "https://example.com");
  assert.equal(result, null);
});

test("normalizeUrl keeps query params and trims only trailing slashes", () => {
  const result = normalizeUrl("https://example.com//teams///12///?view=full", "https://example.com");
  assert.equal(result, "https://example.com//teams///12?view=full");
});

test("normalizeUrl returns null for malformed input", () => {
  const result = normalizeUrl("http://", "https://example.com");
  assert.equal(result, null);
});

test("classifyUrl returns typed route metadata", () => {
  assert.deepEqual(classifyUrl("https://example.com/games/123"), { type: "game", id: "123" });
  assert.deepEqual(classifyUrl("https://example.com/players/456"), { type: "player", id: "456" });
  assert.deepEqual(classifyUrl("https://example.com/teams/789"), { type: "team", id: "789" });
  assert.deepEqual(classifyUrl("https://example.com/compare"), { type: "compare", id: null });
  assert.deepEqual(classifyUrl("https://example.com/compare/player-a-vs-player-b"), { type: "compare", id: null });
  assert.deepEqual(classifyUrl("https://example.com/explore"), { type: "general", id: null });
});

test("shouldSkipAsset detects static asset links", () => {
  assert.equal(shouldSkipAsset("https://example.com/images/photo.jpg"), true);
  assert.equal(shouldSkipAsset("https://example.com/images/photo.PNG"), true);
  assert.equal(shouldSkipAsset("https://example.com/assets/app.css"), true);
  assert.equal(shouldSkipAsset("https://example.com/teams/42"), false);
});

test("pageDirectory maps page type to output directory", () => {
  assert.equal(pageDirectory("https://example.com/games/1"), "games");
  assert.equal(pageDirectory("https://example.com/players/1"), "players");
  assert.equal(pageDirectory("https://example.com/teams/1"), "teams");
  assert.equal(pageDirectory("https://example.com/lineup-scenarios/3"), "teams");
  assert.equal(pageDirectory("https://example.com/opponent-reports/3"), "teams");
  assert.equal(pageDirectory("https://example.com/compare"), "compare");
  assert.equal(pageDirectory("https://example.com/explore"), "");
});

test("screenshotFilename handles typed and general pages", () => {
  assert.equal(screenshotFilename("https://example.com/games/77"), "game-77.png");
  assert.equal(screenshotFilename("https://example.com/players/88"), "player-88.png");
  assert.equal(screenshotFilename("https://example.com/teams/99"), "team-99.png");
  assert.equal(screenshotFilename("https://example.com/"), "home.png");
  assert.equal(
    screenshotFilename("https://example.com/schedule/day?date=2026-08-14"),
    "schedule__day__date_2026-08-14.png"
  );
  assert.equal(screenshotFilename("https://example.com/?date=2026-08-14"), "home__date_2026-08-14.png");
  assert.equal(screenshotFilename("https://example.com/players/Jos%C3%A9"), "players__Jos_C3_A9.png");
});

test("screenshotRelativePath joins directory and filename", () => {
  assert.equal(screenshotRelativePath("https://example.com/games/77"), "games/game-77.png");
  assert.equal(screenshotRelativePath("https://example.com/compare"), "compare/compare.png");
  assert.equal(
    screenshotRelativePath("https://example.com/lineup-scenarios/3"),
    "teams/lineup-scenarios__3.png"
  );
  assert.equal(
    screenshotRelativePath("https://example.com/opponent-reports/3"),
    "teams/opponent-reports__3.png"
  );
  assert.equal(screenshotRelativePath("https://example.com/explore"), "explore.png");
});

test("isLoginPageUrl matches known login-style paths", () => {
  assert.equal(isLoginPageUrl("https://example.com/login"), true);
  assert.equal(isLoginPageUrl("https://example.com/signin"), true);
  assert.equal(isLoginPageUrl("https://example.com/auth/login"), true);
  assert.equal(isLoginPageUrl("https://example.com/teams/5"), false);
});

test("canonicalizeCrawlUrl strips query/hash for login pages only", () => {
  assert.equal(
    canonicalizeCrawlUrl("https://example.com/login?redirect=%2Fteams%2F15#top"),
    "https://example.com/login"
  );
  assert.equal(
    canonicalizeCrawlUrl("https://example.com/schedule?date=2026-08-14#section"),
    "https://example.com/schedule?date=2026-08-14#section"
  );
});
