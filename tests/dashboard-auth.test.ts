import assert from "node:assert/strict";
import test from "node:test";
import { createDashboardSession, verifyDashboardSession } from "../src/dashboard-auth.js";

const secret = "test-session-secret";

test("accepts a current dashboard session signed with the configured secret", () => {
  const now = 1_700_000_000_000;
  const session = createDashboardSession(secret, now, 60_000);
  assert.equal(verifyDashboardSession(secret, session, now + 1), true);
});

test("rejects expired, tampered, and differently-signed dashboard sessions", () => {
  const now = 1_700_000_000_000;
  const session = createDashboardSession(secret, now, 1_000);
  assert.equal(verifyDashboardSession(secret, session, now + 1_001), false);
  assert.equal(verifyDashboardSession(secret, `${session}tampered`, now + 1), false);
  assert.equal(verifyDashboardSession("other-secret", session, now + 1), false);
});
