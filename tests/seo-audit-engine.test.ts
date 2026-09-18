import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAuditScorecard,
  detectBusinessType,
  normalizeAuditFindings,
  validateAuditTarget,
} from "../src/seo-audit-engine.js";

test("detects local and ecommerce business signals without guessing a sector", () => {
  assert.equal(detectBusinessType({ has_address: true, has_phone: true, has_product_schema: false, has_cart: false }), "local_service");
  assert.equal(detectBusinessType({ has_address: false, has_phone: false, has_product_schema: true, has_cart: true }), "ecommerce");
  assert.equal(detectBusinessType({ has_address: false, has_phone: false, has_product_schema: false, has_cart: false }), "unknown");
});

test("rejects non-public audit targets before dispatching a paid crawl", () => {
  assert.equal(validateAuditTarget("https://dnamusic.edu.co/").hostname, "dnamusic.edu.co");
  assert.throws(() => validateAuditTarget("http://localhost:3000"), /audit_target_invalid/);
  assert.throws(() => validateAuditTarget("https://127.0.0.1/"), /audit_target_invalid/);
  assert.throws(() => validateAuditTarget("ftp://example.com"), /audit_target_invalid/);
});

test("creates an evidence-first scorecard and prioritizes indexability blockers", () => {
  const findings = normalizeAuditFindings([
    { category: "technical", severity: "critical", title: "Pages blocked from indexing", evidence: "GSC URL Inspection: excluded by noindex", recommendation: "Remove unintended noindex", effort: "low" },
    { category: "content", severity: "high", title: "Thin program pages", evidence: "Crawl: 18 pages below content threshold", recommendation: "Add original curriculum details", effort: "medium" },
    { category: "schema", severity: "high", title: "Unsupported claim", recommendation: "Do something", effort: "low" },
  ]);
  const scorecard = buildAuditScorecard({
    business_type: "local_service",
    category_scores: { technical: 40, content: 70, on_page: 80, schema: 90, performance: 85, geo: 60, images: 90 },
    findings,
  });

  assert.equal(scorecard.health_score, 68);
  assert.equal(scorecard.findings[0].title, "Pages blocked from indexing");
  assert.equal(scorecard.findings[0].priority, "critical");
  assert.equal(scorecard.findings.some((finding) => finding.title === "Unsupported claim"), false);
  assert.equal(scorecard.action_plan[0].timeframe, "immediate");
});

test("consultant review exposes verification and failure criteria for each recommendation", () => {
  const findings = normalizeAuditFindings([
    { category: "geo", severity: "medium", title: "Weak first-answer coverage", evidence: "Content review of 8 key pages", recommendation: "Add concise answer sections", effort: "medium" },
  ]);
  const scorecard = buildAuditScorecard({
    business_type: "unknown",
    category_scores: { technical: 90, content: 90, on_page: 90, schema: 90, performance: 90, geo: 50, images: 90 },
    findings,
  });

  assert.equal(scorecard.findings[0].verification.required, true);
  assert.match(scorecard.findings[0].verification.success_signal, /GSC|rendimiento|revisión/i);
  assert.match(scorecard.findings[0].verification.failure_signal, /no cambia/i);
});
