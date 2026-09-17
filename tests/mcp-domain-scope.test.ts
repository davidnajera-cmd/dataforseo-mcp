import assert from "node:assert/strict";
import test from "node:test";
import { findOutOfScopeOwnedHosts, normalizeDomainScope } from "../src/mcp-domain-scope.js";

test("normalizes an owned-domain scope without accepting paths or malformed hosts", () => {
  assert.deepEqual(normalizeDomainScope(["https://www.palosecoskool.com/", "palosecoskool.com"]), {
    valid: true,
    domains: ["palosecoskool.com"],
  });
  assert.deepEqual(normalizeDomainScope(["not a domain"]), { valid: false, domains: [] });
});

test("blocks GSC owned resources outside the API key domain scope", () => {
  assert.deepEqual(
    findOutOfScopeOwnedHosts("gsc_sitemaps_submit", {
      params: { arguments: { site_url: "sc-domain:other-school.com", feedpath: "https://other-school.com/sitemap.xml" } },
    }, ["palosecoskool.com"]),
    ["other-school.com"]
  );
});

test("allows public competitor research while containing historical data by domain", () => {
  assert.deepEqual(
    findOutOfScopeOwnedHosts("labs_google_ranked_keywords", { params: { arguments: { target: "competitor.com" } } }, ["palosecoskool.com"]),
    []
  );
  assert.deepEqual(
    findOutOfScopeOwnedHosts("history_traffic", { params: { arguments: { domain: "competitor.com" } } }, ["palosecoskool.com"]),
    ["competitor.com"]
  );
});
