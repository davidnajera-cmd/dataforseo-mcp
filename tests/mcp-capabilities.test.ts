import assert from "node:assert/strict";
import test from "node:test";
import {
  authorizeMcpToolCall,
  getMcpToolCapability,
  listMcpCapabilities,
  preflightMcpToolCall,
  requiresMcpIdempotency,
  searchMcpCapabilities,
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

test("always permits authenticated access to safe MCP discovery and recovery tools", () => {
  assert.deepEqual(authorizeMcpToolCall("mcp_tool_preflight", ["gsc:read"], false), { allowed: true });
  assert.deepEqual(authorizeMcpToolCall("mcp_execution_status", ["gsc:read"], false), { allowed: true });
});

test("treats paid dispatch as a separately scoped operation", () => {
  const capability = getMcpToolCapability("apify_run_actor");
  assert.equal(capability.operation, "paid_dispatch");
  assert.equal(capability.capability, "research:paid_dispatch");
  assert.equal(capability.approval_required, true);
});

test("never classifies social publication as a read-only capability", () => {
  const capability = getMcpToolCapability("zernio_posts_create");
  assert.equal(capability.operation, "write");
  assert.equal(capability.capability, "social:publish");
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
      idempotency_required: true,
      freshness: "live",
      cost_tier: "variable",
    }
  );
});

test("requires idempotency for non-idempotent side effects but not idempotent writes", () => {
  assert.equal(requiresMcpIdempotency(getMcpToolCapability("apify_run_actor")), true);
  assert.equal(requiresMcpIdempotency(getMcpToolCapability("zernio_posts_create")), true);
  assert.equal(requiresMcpIdempotency(getMcpToolCapability("gsc_sitemaps_submit")), false);
});

test("lists capabilities without exposing write tools in a read-only filter", () => {
  const tools = listMcpCapabilities({ operation: "read" });
  assert.ok(tools.some((tool) => tool.tool === "gsc_search_analytics_query"));
  assert.ok(!tools.some((tool) => tool.tool === "gsc_sitemaps_submit"));
});

test("searches capabilities for agent tool discovery", () => {
  const results = searchMcpCapabilities("sitemap write");
  assert.deepEqual(results.map((tool) => tool.tool), ["gsc_sitemaps_delete", "gsc_sitemaps_submit"]);
});
