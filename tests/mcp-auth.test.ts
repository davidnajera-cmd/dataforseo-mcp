import assert from "node:assert/strict";
import test from "node:test";
import { isMcpApiKeyRequired, isMcpRateLimitExceeded } from "../api/mcp.js";

test("requires an API key for the default MCP endpoint", () => {
  assert.equal(isMcpApiKeyRequired(undefined), true);
});

test("requires an API key for every bundle", () => {
  assert.equal(isMcpApiKeyRequired("seo"), true);
  assert.equal(isMcpApiKeyRequired("research"), true);
});

test("rejects MCP requests that exceed the per-key minute quota", () => {
  assert.equal(isMcpRateLimitExceeded(60), true);
  assert.equal(isMcpRateLimitExceeded(59), false);
});
