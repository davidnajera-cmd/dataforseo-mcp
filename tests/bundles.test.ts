import assert from "node:assert/strict";
import test from "node:test";
import { isToolInBundle } from "../src/bundles.js";

test("exposes safe MCP discovery tools in every constrained bundle", () => {
  assert.equal(isToolInBundle("mcp_capabilities_list", "seo"), true);
  assert.equal(isToolInBundle("mcp_capabilities_search", "research"), true);
  assert.equal(isToolInBundle("mcp_tool_preflight", "agent"), true);
  assert.equal(isToolInBundle("mcp_execution_status", "pauta"), true);
});
