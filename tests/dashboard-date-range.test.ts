import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeDashboardDateRange,
  shouldUseCompatibleDashboardSnapshot,
} from "../src/dashboard-data.js";

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
