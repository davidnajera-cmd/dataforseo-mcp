import assert from "node:assert/strict";
import test from "node:test";
import {
  authorizeMcpToolCall,
  getMcpToolCapability,
  listMcpCapabilities,
  preflightMcpToolCall,
} from "../src/mcp-capabilities.js";

test("describes read-only tools with freshness and no approval requirement", () => {
  const capability = getMcpToolCapability("gsc_search_analytics_query");

  assert.deepEqual(capability, {
    tool: "gsc_search_analytics_query",
    operation: "read",
    capability: "gsc:read",
    approval_required: false,
    idempotent: true,
    freshness: "live",
    cost_tier: "included",
  });
});

test("requires an explicit granular capability for sensitive tool calls", () => {
  assert.deepEqual(
    authorizeMcpToolCall("gsc_sitemaps_submit", ["gsc:read"], false),
    { allowed: false, reason: "capability_scope_required", required_capability: "gsc:sitemap:write" }
  );
  assert.deepEqual(
    authorizeMcpToolCall("gsc_sitemaps_submit", ["gsc:sitemap:write"], false),
    { allowed: true }
  );
});

test("treats paid dispatch as a separately scoped operation", () => {
  const capability = getMcpToolCapability("apify_run_actor");
  assert.equal(capability.operation, "paid_dispatch");
  assert.equal(capability.capability, "research:paid_dispatch");
  assert.equal(capability.approval_required, true);
});

test("preflight reports cost, approval and scope before an agent calls a tool", () => {
  assert.deepEqual(
    preflightMcpToolCall("apify_run_actor", ["research:paid_dispatch"]),
    {
      allowed: true,
      tool: "apify_run_actor",
      operation: "paid_dispatch",
      required_capability: "research:paid_dispatch",
      approval_required: true,
      idempotent: false,
      freshness: "live",
      cost_tier: "variable",
    }
  );
});

test("lists capabilities without exposing write tools in a read-only filter", () => {
  const tools = listMcpCapabilities({ operation: "read" });
  assert.ok(tools.some((tool) => tool.tool === "gsc_search_analytics_query"));
  assert.ok(!tools.some((tool) => tool.tool === "gsc_sitemaps_submit"));
});
