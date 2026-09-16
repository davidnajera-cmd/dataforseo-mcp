import assert from "node:assert/strict";
import test from "node:test";
import { isMcpApiKeyRequired } from "../api/mcp.js";

test("requires an API key for the default MCP endpoint", () => {
  assert.equal(isMcpApiKeyRequired(undefined), true);
});

test("requires an API key for every bundle", () => {
  assert.equal(isMcpApiKeyRequired("seo"), true);
  assert.equal(isMcpApiKeyRequired("research"), true);
});
