import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeDashboardDateRange,
  selectGa4RowsForDashboardRange,
  shouldUseCompatibleDashboardSnapshot,
} from "../src/dashboard-data.js";
import {
  SEO_DASHBOARD_CACHE_VERSION,
  isCurrentDashboardSnapshot,
} from "../src/dashboard-store.js";

test("keeps an explicitly selected historical range and orders inverted endpoints", () => {
  assert.deepEqual(
    normalizeDashboardDateRange("2026-09-07", "2026-09-01", {
      startDate: "2026-09-22",
      endDate: "2026-09-28",
    }),
    { startDate: "2026-09-01", endDate: "2026-09-07" },
  );
});

test("uses a compatible snapshot only when the request did not select dates", () => {
  assert.equal(shouldUseCompatibleDashboardSnapshot({}), true);
  assert.equal(shouldUseCompatibleDashboardSnapshot({ startDate: "2026-09-01" }), false);
  assert.equal(shouldUseCompatibleDashboardSnapshot({ endDate: "2026-09-07" }), false);
  assert.equal(
    shouldUseCompatibleDashboardSnapshot({ startDate: "2026-09-01", endDate: "2026-09-07" }),
    false,
  );
});

test("keeps GA4 series inside the explicitly selected historical interval", () => {
  const selected = selectGa4RowsForDashboardRange([
    { date: "2026-08-31", sessions: 9, organic_sessions: 4, conversions: 1 },
    { date: "2026-09-01", sessions: 10, organic_sessions: 5, conversions: 2 },
    { date: "2026-09-06", sessions: 20, organic_sessions: 8, conversions: 3 },
    { date: "2026-09-07", sessions: 30, organic_sessions: 10, conversions: 4 },
  ], "2026-09-01", "2026-09-06");

  assert.deepEqual(selected, [
    { date: "2026-09-01", sessions: 10, organic_sessions: 5, conversions: 2 },
    { date: "2026-09-06", sessions: 20, organic_sessions: 8, conversions: 3 },
  ]);
});

test("does not reuse dashboard snapshots generated before the GA4 range fix", () => {
  assert.equal(isCurrentDashboardSnapshot({}), false);
  assert.equal(isCurrentDashboardSnapshot({ cacheVersion: SEO_DASHBOARD_CACHE_VERSION }), true);
});
