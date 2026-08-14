import test from "node:test";
import assert from "node:assert/strict";
import { formatDate, getTodayDate, subtractDays } from "../src/date-utils.mjs";

test("formatDate returns YYYY-MM-DD in UTC", () => {
  const date = new Date("2026-01-02T23:45:00Z");
  assert.equal(formatDate(date), "2026-01-02");
});

test("subtractDays handles month boundaries", () => {
  assert.equal(subtractDays("2026-03-01", 1), "2026-02-28");
  assert.equal(subtractDays("2024-03-01", 1), "2024-02-29");
});

test("subtractDays handles year boundaries", () => {
  assert.equal(subtractDays("2026-01-01", 1), "2025-12-31");
});

test("getTodayDate returns YYYY-MM-DD shape", () => {
  const today = getTodayDate("America/Detroit");
  assert.match(today, /^\d{4}-\d{2}-\d{2}$/);
});
