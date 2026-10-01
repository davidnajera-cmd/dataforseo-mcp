import assert from "node:assert/strict";
import test from "node:test";
import { isToolInBundle } from "../src/bundles.js";

test("exposes safe MCP discovery tools in every constrained bundle", () => {
  assert.equal(isToolInBundle("mcp_capabilities_list", "seo"), true);
  assert.equal(isToolInBundle("mcp_capabilities_search", "research"), true);
  assert.equal(isToolInBundle("mcp_tool_preflight", "agent"), true);
  assert.equal(isToolInBundle("mcp_execution_status", "pauta"), true);
});

test("keeps video evidence analysis in research and agent bundles", () => {
  assert.equal(isToolInBundle("video_evidence_analyze", "research"), true);
  assert.equal(isToolInBundle("video_geo_brief", "agent"), true);
  assert.equal(isToolInBundle("video_evidence_analyze", "pauta"), false);
});

test("exposes a compact, read-oriented ChatGPT bundle", () => {
  assert.equal(isToolInBundle("http_headers_inspect", "chatgpt"), true);
  assert.equal(isToolInBundle("gsc_site_health_report", "chatgpt"), true);
  assert.equal(isToolInBundle("seo_audit_start", "chatgpt"), false);
  assert.equal(isToolInBundle("gsc_request_indexing", "chatgpt"), false);
});

test("exposes the audit engine to SEO and agent workflows", () => {
  assert.equal(isToolInBundle("seo_audit_start", "seo"), true);
  assert.equal(isToolInBundle("seo_audit_scorecard", "agent"), true);
  assert.equal(isToolInBundle("seo_audit_start", "research"), false);
});

test("keeps the Claude SEO bundle within a focused workflow", () => {
  assert.equal(isToolInBundle("http_headers_inspect", "seo"), true);
  assert.equal(isToolInBundle("seo_audit_start", "seo"), true);
  assert.equal(isToolInBundle("apify_google_search_multi_engine", "seo"), false);
});

test("uses a separate OAuth bundle for Claude without widening its tools", () => {
  assert.equal(isToolInBundle("http_headers_inspect", "claude"), true);
  assert.equal(isToolInBundle("seo_audit_start", "claude"), true);
  assert.equal(isToolInBundle("gsc_request_indexing", "claude"), false);
});
