import test from "node:test";
import assert from "node:assert/strict";
import { createCaptureState, getPlayerPageTabs, shouldCaptureUrl } from "../src/capture-workflows.mjs";

test("createCaptureState returns empty default state", () => {
  const state = createCaptureState();

  assert.ok(state.visited instanceof Set);
  assert.ok(state.queued instanceof Set);
  assert.ok(state.allowedGameUrls instanceof Set);
  assert.ok(state.allowedPlayerUrls instanceof Set);
  assert.ok(Array.isArray(state.capturedPages));

  assert.equal(state.visited.size, 0);
  assert.equal(state.queued.size, 0);
  assert.equal(state.allowedGameUrls.size, 0);
  assert.equal(state.allowedPlayerUrls.size, 0);
  assert.equal(state.capturedPages.length, 0);
  assert.equal(state.selectedTeamUrl, null);
  assert.equal(state.mostRecentSelectedTeamGameUrl, null);
  assert.equal(state.mostRecentSelectedTeamGameDate, null);
});

test("createCaptureState returns independent objects", () => {
  const a = createCaptureState();
  const b = createCaptureState();

  a.visited.add("https://example.com/x");
  a.capturedPages.push({ title: "x" });

  assert.equal(b.visited.size, 0);
  assert.equal(b.capturedPages.length, 0);
});

test("shouldCaptureUrl allows only approved game URLs", () => {
  const state = createCaptureState();
  const allowed = "https://example.com/games/123";
  const denied = "https://example.com/games/999";

  state.allowedGameUrls.add(allowed);

  assert.equal(shouldCaptureUrl(allowed, state), true);
  assert.equal(shouldCaptureUrl(denied, state), false);
});

test("shouldCaptureUrl allows only approved player URLs", () => {
  const state = createCaptureState();
  const allowed = "https://example.com/players/42";
  const denied = "https://example.com/players/43";

  state.allowedPlayerUrls.add(allowed);

  assert.equal(shouldCaptureUrl(allowed, state), true);
  assert.equal(shouldCaptureUrl(denied, state), false);
});

test("shouldCaptureUrl allows only selected team URL", () => {
  const state = createCaptureState();
  const selected = "https://example.com/teams/7";

  assert.equal(shouldCaptureUrl(selected, state), false);

  state.selectedTeamUrl = selected;

  assert.equal(shouldCaptureUrl(selected, state), true);
  assert.equal(shouldCaptureUrl("https://example.com/teams/8", state), false);
});

test("shouldCaptureUrl always denies compare URLs", () => {
  const state = createCaptureState();

  assert.equal(shouldCaptureUrl("https://example.com/compare", state), false);
  assert.equal(shouldCaptureUrl("https://example.com/compare/player-a-vs-b", state), false);
});

test("shouldCaptureUrl allows general routes", () => {
  const state = createCaptureState();

  assert.equal(shouldCaptureUrl("https://example.com/", state), true);
  assert.equal(shouldCaptureUrl("https://example.com/explore", state), true);
  assert.equal(shouldCaptureUrl("https://example.com/schedule", state), true);
});

test("getPlayerPageTabs includes Pitch Arsenal only for pitchers", () => {
  const hitterTabs = getPlayerPageTabs(false);
  const pitcherTabs = getPlayerPageTabs(true);

  assert.equal(hitterTabs.some((tab) => tab.label === "Pitch Arsenal"), false);
  assert.equal(pitcherTabs.some((tab) => tab.label === "Pitch Arsenal"), true);
  assert.equal(pitcherTabs.at(-1)?.label, "Pitch Arsenal");
});
