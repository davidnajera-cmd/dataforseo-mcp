export type AuditCategory = "technical" | "content" | "on_page" | "schema" | "performance" | "geo" | "images";
export type AuditSeverity = "critical" | "high" | "medium" | "low" | "info";
export type BusinessType = "local_service" | "ecommerce" | "saas" | "media" | "agency" | "unknown";

export type AuditFinding = {
  category: AuditCategory;
  severity: AuditSeverity;
  title: string;
  evidence: string;
  recommendation: string;
  effort: "low" | "medium" | "high";
};

const WEIGHTS: Record<AuditCategory, number> = {
  technical: 0.22,
  content: 0.23,
  on_page: 0.20,
  schema: 0.10,
  performance: 0.10,
  geo: 0.10,
  images: 0.05,
};

const SEVERITY_ORDER: Record<AuditSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
const MAX_FINDINGS = 100;

function text(value: unknown, max = 800): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, max) : null;
}

function isCategory(value: unknown): value is AuditCategory {
  return typeof value === "string" && value in WEIGHTS;
}

function isSeverity(value: unknown): value is AuditSeverity {
  return typeof value === "string" && value in SEVERITY_ORDER;
}

export function validateAuditTarget(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("audit_target_invalid");
  }
  const hostname = url.hostname.toLowerCase();
  const privateIpv4 = /^(?:127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[0-1])\.)/;
  if ((url.protocol !== "https:" && url.protocol !== "http:") || !hostname || hostname === "localhost" || hostname.endsWith(".local") || privateIpv4.test(hostname) || hostname === "::1") {
    throw new Error("audit_target_invalid");
  }
  return url;
}

export function detectBusinessType(signals: { has_address: boolean; has_phone: boolean; has_product_schema: boolean; has_cart: boolean; has_pricing?: boolean; has_docs?: boolean; has_articles?: boolean; has_case_studies?: boolean }): BusinessType {
  if (signals.has_product_schema || signals.has_cart) return "ecommerce";
  if (signals.has_address || signals.has_phone) return "local_service";
  if (signals.has_pricing || signals.has_docs) return "saas";
  if (signals.has_articles) return "media";
  if (signals.has_case_studies) return "agency";
  return "unknown";
}

/** Drops assertions that cannot be traced to a concrete observation. */
export function normalizeAuditFindings(value: unknown): AuditFinding[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Record<string, unknown>;
    const category = candidate.category;
    const severity = candidate.severity;
    const title = text(candidate.title, 180);
    const evidence = text(candidate.evidence);
    const recommendation = text(candidate.recommendation);
    const effort = candidate.effort;
    if (!isCategory(category) || !isSeverity(severity) || !title || !evidence || !recommendation || !["low", "medium", "high"].includes(String(effort))) return [];
    return [{ category, severity, title, evidence, recommendation, effort: effort as AuditFinding["effort"] }];
  }).slice(0, MAX_FINDINGS);
}

function verificationFor(finding: AuditFinding) {
  const source = finding.category === "technical" || finding.category === "schema"
    ? "GSC, crawl y comprobación HTTP"
    : finding.category === "performance"
      ? "PageSpeed/CrUX"
      : "revisión de contenido y rendimiento GSC";
  return {
    required: true,
    method: source,
    success_signal: `${source}: la métrica o estado asociado mejora tras aplicar: ${finding.recommendation}`,
    failure_signal: "La métrica o el estado no cambia tras el periodo de comprobación acordado.",
  };
}

export function buildAuditScorecard(input: { business_type: BusinessType; category_scores: Record<AuditCategory, number>; findings: AuditFinding[] }) {
  const scores = Object.fromEntries((Object.keys(WEIGHTS) as AuditCategory[]).map((category) => [category, Math.max(0, Math.min(100, Number(input.category_scores[category] ?? 0)))])) as Record<AuditCategory, number>;
  const weighted = (Object.keys(WEIGHTS) as AuditCategory[]).reduce((total, category) => total + scores[category] * WEIGHTS[category], 0);
  const criticalPenalty = input.findings.filter((finding) => finding.severity === "critical").length;
  const healthScore = Math.max(0, Math.min(100, Math.round(weighted) - criticalPenalty));
  const findings = [...input.findings]
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.effort.localeCompare(b.effort) || a.title.localeCompare(b.title))
    .map((finding) => ({
      ...finding,
      priority: finding.severity,
      verification: verificationFor(finding),
    }));
  const phases = [
    { timeframe: "immediate", severities: ["critical"] },
    { timeframe: "week_1", severities: ["high"] },
    { timeframe: "month_1", severities: ["medium"] },
    { timeframe: "backlog", severities: ["low", "info"] },
  ];
  return {
    health_score: healthScore,
    business_type: input.business_type,
    category_scores: scores,
    methodology: "Puntuación ponderada de siete categorías; los hallazgos sin evidencia se excluyen y cada recomendación exige verificación.",
    findings,
    action_plan: phases.map(({ timeframe, severities }) => ({ timeframe, items: findings.filter((finding) => severities.includes(finding.severity)) })),
  };
}
