import assert from "node:assert/strict";
import test from "node:test";
import { isMcpApiKeyRequired, isMcpRateLimitExceeded, isUnauthenticatedConnectorDiscovery } from "../api/mcp.js";

test("requires an API key for the default MCP endpoint", () => {
  assert.equal(isMcpApiKeyRequired(undefined), true);
});

test("requires an API key for every bundle", () => {
  assert.equal(isMcpApiKeyRequired("seo"), true);
  assert.equal(isMcpApiKeyRequired("research"), true);
});

test("rejects MCP requests that exceed the per-key minute quota", () => {
  assert.equal(isMcpRateLimitExceeded(61), true);
  assert.equal(isMcpRateLimitExceeded(60), false);
});

test("only permits unauthenticated connector discovery", () => {
  assert.equal(isUnauthenticatedConnectorDiscovery({ method: "initialize" }), true);
  assert.equal(isUnauthenticatedConnectorDiscovery({ method: "tools/list" }), true);
  assert.equal(isUnauthenticatedConnectorDiscovery({ method: "tools/call" }), false);
  assert.equal(isUnauthenticatedConnectorDiscovery(undefined), false);
});
