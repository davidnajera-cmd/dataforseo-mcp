import assert from "node:assert/strict";
import test from "node:test";
import { isMutatingMcpTool } from "../src/mcp-permissions.js";

test("classifies read-only discovery and reporting tools as non-mutating", () => {
  assert.equal(isMutatingMcpTool("gsc_sites_list"), false);
  assert.equal(isMutatingMcpTool("gsc_search_analytics_query"), false);
  assert.equal(isMutatingMcpTool("backlinks_summary"), false);
});

test("requires explicit write permission for provider changes and paid dispatches", () => {
  assert.equal(isMutatingMcpTool("gsc_sitemaps_submit"), true);
  assert.equal(isMutatingMcpTool("gsc_sites_delete"), true);
  assert.equal(isMutatingMcpTool("zernio_posts_create"), true);
  assert.equal(isMutatingMcpTool("apify_run_actor"), true);
  assert.equal(isMutatingMcpTool("agent_run_now"), true);
  assert.equal(isMutatingMcpTool("video_evidence_analyze"), true);
});
