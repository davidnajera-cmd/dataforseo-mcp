import assert from "node:assert/strict";
import test from "node:test";
import { parseRequestedCapabilityScopes } from "../api/api-keys.js";

test("rejects unknown capability scopes instead of silently downgrading them", () => {
  assert.deepEqual(parseRequestedCapabilityScopes(["gsc:read", "not:a:scope"]), {
    valid: false,
    scopes: [],
  });
});

test("deduplicates explicit capability scopes for newly issued keys", () => {
  assert.deepEqual(parseRequestedCapabilityScopes(["gsc:read", "gsc:read", "gsc:sitemap:write"]), {
    valid: true,
    scopes: ["gsc:read", "gsc:sitemap:write"],
  });
});
