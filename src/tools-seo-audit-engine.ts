import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { post } from "./dataforseo-client.js";
import {
  buildAuditScorecard,
  detectBusinessType,
  normalizeAuditFindings,
  validateAuditTarget,
  type AuditCategory,
  type AuditFinding,
  type BusinessType,
} from "./seo-audit-engine.js";

const categoryScoresSchema = z.object({
  technical: z.number().min(0).max(100),
  content: z.number().min(0).max(100),
  on_page: z.number().min(0).max(100),
  schema: z.number().min(0).max(100),
  performance: z.number().min(0).max(100),
  geo: z.number().min(0).max(100),
  images: z.number().min(0).max(100),
});

const findingSchema = z.object({
  category: z.enum(["technical", "content", "on_page", "schema", "performance", "geo", "images"]),
  severity: z.enum(["critical", "high", "medium", "low", "info"]),
  title: z.string().min(3).max(180),
  evidence: z.string().min(3).max(800).describe("Observation traceable to a crawl, GSC, GA4, PageSpeed, or manual review. Unsupported findings are excluded."),
  recommendation: z.string().min(3).max(800),
  effort: z.enum(["low", "medium", "high"]),
});

const businessSignalsSchema = z.object({
  has_address: z.boolean().default(false),
  has_phone: z.boolean().default(false),
  has_product_schema: z.boolean().default(false),
  has_cart: z.boolean().default(false),
  has_pricing: z.boolean().default(false),
  has_docs: z.boolean().default(false),
  has_articles: z.boolean().default(false),
  has_case_studies: z.boolean().default(false),
});

function result(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}

function consultantSummary(scorecard: ReturnType<typeof buildAuditScorecard>) {
  const critical = scorecard.findings.filter((finding) => finding.severity === "critical");
  const high = scorecard.findings.filter((finding) => finding.severity === "high");
  return {
    assessment: scorecard.health_score >= 85 ? "healthy_with_optimization_opportunities" : scorecard.health_score >= 65 ? "needs_prioritized_improvement" : "material_seo_risk",
    decision: critical.length > 0
      ? "Resolve indexability and other critical blockers before investing in new content or authority work."
      : high.length > 0
        ? "Resolve high-priority issues in the first week, then validate their measured effect."
        : "Use the scorecard for controlled optimization and monitor leading indicators.",
    critical_count: critical.length,
    high_count: high.length,
    limitations: "This is a review of supplied evidence. Re-run live provider tools before treating time-sensitive observations as current.",
  };
}

/**
 * Central audit contract: one crawl launcher and two evidence-only synthesis
 * tools. Agents can use specialized skills, but must converge on this format.
 */
export function registerSeoAuditEngineTools(server: McpServer) {
  server.tool(
    "seo_audit_start",
    "Start a bounded DataForSEO OnPage crawl for a professional SEO audit. Cap is 500 pages; this call incurs provider cost, so call mcp_tool_preflight and send x-mcp-idempotency-key. After completion, collect live evidence with onpage_summary/onpage_pages and synthesize it through seo_audit_scorecard or seo_consultant_review.",
    {
      target: z.string().url().describe("Public http(s) site URL. Local/private hosts are rejected."),
      max_pages: z.number().int().min(1).max(500).optional().describe("Maximum pages to crawl. Default 100; maximum 500."),
      enable_javascript: z.boolean().optional().describe("Enable when site content depends on client-side rendering. Default false."),
    },
    async ({ target, max_pages, enable_javascript }) => {
      const url = validateAuditTarget(target);
      const raw = await post("/on_page/task_post", {
        target: url.toString(),
        max_crawl_pages: max_pages ?? 100,
        enable_javascript: enable_javascript ?? false,
      }) as { tasks?: Array<{ id?: string; status_code?: number; status_message?: string }> };
      const task = raw.tasks?.[0];
      if (!task?.id) throw new Error("seo_audit_task_not_created");
      return result({
        audit_task_id: task.id,
        target: url.toString(),
        max_pages: max_pages ?? 100,
        status_code: task.status_code ?? null,
        status_message: task.status_message ?? null,
        next_steps: [
          "Wait until onpage_summary reports crawl_progress=finished.",
          "Collect summary, pages, duplicate tags/content, redirects, PageSpeed, GSC, and schema evidence.",
          "Submit only evidence-backed category scores and findings to seo_consultant_review.",
        ],
      });
    }
  );

  server.tool(
    "seo_audit_scorecard",
    "Normalize evidence from specialist SEO tools into a consistent 0-100 health score, sector classification, prioritized action plan, and verification criteria. Findings without concrete evidence are discarded; this tool does not crawl, publish, or call a paid provider.",
    {
      business_signals: businessSignalsSchema,
      category_scores: categoryScoresSchema,
      findings: z.array(findingSchema).max(100),
    },
    async ({ business_signals, category_scores, findings }) => {
      const normalized = normalizeAuditFindings(findings) as AuditFinding[];
      const scorecard = buildAuditScorecard({
        business_type: detectBusinessType(business_signals),
        category_scores: category_scores as Record<AuditCategory, number>,
        findings: normalized,
      });
      return result(scorecard);
    }
  );

  server.tool(
    "seo_consultant_review",
    "Senior SEO consultant review of a structured audit. Produces an evidence-first scorecard plus the immediate decision, priority sequencing, explicit verification, and freshness limitations. Use after seo_audit_start and specialist evidence collection, or to critique an attached audit converted to the documented finding format.",
    {
      business_type: z.enum(["local_service", "ecommerce", "saas", "media", "agency", "unknown"]).optional().describe("Use only when the sector was established outside the MCP; otherwise omit and send business_signals."),
      business_signals: businessSignalsSchema.optional(),
      category_scores: categoryScoresSchema,
      findings: z.array(findingSchema).max(100),
    },
    async ({ business_type, business_signals, category_scores, findings }) => {
      const resolvedBusinessType: BusinessType = business_type ?? detectBusinessType(business_signals ?? {
        has_address: false, has_phone: false, has_product_schema: false, has_cart: false,
      });
      const scorecard = buildAuditScorecard({
        business_type: resolvedBusinessType,
        category_scores: category_scores as Record<AuditCategory, number>,
        findings: normalizeAuditFindings(findings),
      });
      return result({ consultant_review: consultantSummary(scorecard), scorecard });
    }
  );
}
