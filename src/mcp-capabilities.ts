import { isMutatingMcpTool } from "./mcp-permissions.js";

export type McpOperation = "read" | "write" | "paid_dispatch" | "workflow_run";
export type McpFreshness = "live" | "historical" | "static";
export type McpCostTier = "included" | "variable" | "paid";

export type McpToolCapability = {
  tool: string;
  operation: McpOperation;
  capability: string;
  approval_required: boolean;
  idempotent: boolean;
  freshness: McpFreshness;
  cost_tier: McpCostTier;
};

type CapabilityOverride = Omit<McpToolCapability, "tool">;

const READ_GSC: CapabilityOverride = {
  operation: "read", capability: "gsc:read", approval_required: false,
  idempotent: true, freshness: "live", cost_tier: "included",
};

const OVERRIDES: Record<string, CapabilityOverride> = {
  mcp_execution_status: {
    operation: "read", capability: "history:read", approval_required: false,
    idempotent: true, freshness: "live", cost_tier: "included",
  },
  gsc_sitemaps_submit: {
    operation: "write", capability: "gsc:sitemap:write", approval_required: true,
    idempotent: true, freshness: "live", cost_tier: "included",
  },
  gsc_sitemaps_delete: {
    operation: "write", capability: "gsc:sitemap:write", approval_required: true,
    idempotent: true, freshness: "live", cost_tier: "included",
  },
  gsc_sites_add: {
    operation: "write", capability: "gsc:property:write", approval_required: true,
    idempotent: true, freshness: "live", cost_tier: "included",
  },
  gsc_sites_delete: {
    operation: "write", capability: "gsc:property:write", approval_required: true,
    idempotent: true, freshness: "live", cost_tier: "included",
  },
  gsc_url_request_indexing: {
    operation: "write", capability: "gsc:indexing:write", approval_required: true,
    idempotent: true, freshness: "live", cost_tier: "included",
  },
  gsc_bulk_request_indexing: {
    operation: "write", capability: "gsc:indexing:write", approval_required: true,
    idempotent: true, freshness: "live", cost_tier: "included",
  },
  apify_run_actor: {
    operation: "paid_dispatch", capability: "research:paid_dispatch", approval_required: true,
    idempotent: false, freshness: "live", cost_tier: "variable",
  },
  agent_run_now: {
    operation: "workflow_run", capability: "agent:run", approval_required: true,
    idempotent: false, freshness: "live", cost_tier: "paid",
  },
  backlog_slack_sync_now: {
    operation: "write", capability: "backlog:sync", approval_required: true,
    idempotent: false, freshness: "live", cost_tier: "included",
  },
};

const KNOWN_READ_TOOLS = [
  "gsc_search_analytics_query",
  "gsc_keyword_opportunities",
  "gsc_search_analytics_compare",
  "gsc_site_health_report",
  "gsc_url_inspection",
  "gsc_sites_list",
  "gsc_sitemaps_list",
  "gsc_sitemaps_get",
  "gsc_indexing_coverage_report",
];

const VALID_CAPABILITY_SCOPES = new Set([
  "*", "gsc:read", "gsc:sitemap:write", "gsc:property:write", "gsc:indexing:write",
  "research:paid_dispatch", "agent:run", "backlog:sync", "history:read", "seo:read", "growth:read",
  "social:publish", "backlog:write", "local:write", "mutation:generic",
]);

export function isValidMcpCapabilityScope(value: unknown): value is string {
  return typeof value === "string" && VALID_CAPABILITY_SCOPES.has(value);
}

/**
 * Describes the operational contract of a tool before an agent invokes it.
 * Unknown tools fail closed as a generic write: new provider integrations
 * cannot silently inherit read-only authorization.
 */
export function getMcpToolCapability(tool: string): McpToolCapability {
  const override = OVERRIDES[tool];
  if (override) return { tool, ...override };
  if (KNOWN_READ_TOOLS.includes(tool) || tool.startsWith("gsc_")) return { tool, ...READ_GSC };
  if (isMutatingMcpTool(tool)) {
    if (tool.startsWith("zernio_")) {
      return { tool, operation: "write", capability: "social:publish", approval_required: true, idempotent: false, freshness: "live", cost_tier: "variable" };
    }
    if (tool.startsWith("backlog_")) {
      return { tool, operation: "write", capability: "backlog:write", approval_required: true, idempotent: false, freshness: "live", cost_tier: "included" };
    }
    if (tool.startsWith("gbp_")) {
      return { tool, operation: "write", capability: "local:write", approval_required: true, idempotent: false, freshness: "live", cost_tier: "included" };
    }
    if (tool.startsWith("apify_") || tool.startsWith("scrapegraph_")) {
      return { tool, operation: "paid_dispatch", capability: "research:paid_dispatch", approval_required: true, idempotent: false, freshness: "live", cost_tier: "variable" };
    }
    return { tool, operation: "write", capability: "mutation:generic", approval_required: true, idempotent: false, freshness: "live", cost_tier: "variable" };
  }
  if (tool.startsWith("history_")) {
    return { tool, operation: "read", capability: "history:read", approval_required: false, idempotent: true, freshness: "historical", cost_tier: "included" };
  }
  if (/^(?:backlinks|labs_google|serp|pagespeed|clarity|ga4|schema|http|bing|wayback)_/.test(tool)) {
    return { tool, operation: "read", capability: "seo:read", approval_required: false, idempotent: true, freshness: "live", cost_tier: "variable" };
  }
  if (/^(?:zernio_|gbp_|backlog_|snapshot_|brand_|social_)/.test(tool)) {
    return { tool, operation: "read", capability: "growth:read", approval_required: false, idempotent: true, freshness: "live", cost_tier: "included" };
  }
  return { tool, operation: "write", capability: "mutation:generic", approval_required: true, idempotent: false, freshness: "live", cost_tier: "variable" };
}

/**
 * Paid dispatches and non-idempotent writes must carry a caller-generated
 * idempotency key. This prevents a retrying agent from creating duplicate
 * provider jobs, publications, or workflow runs.
 */
export function requiresMcpIdempotency(capability: McpToolCapability): boolean {
  return capability.operation !== "read" && !capability.idempotent;
}

export function listMcpCapabilities(filter: { operation?: McpOperation } = {}): McpToolCapability[] {
  const names = [...KNOWN_READ_TOOLS, ...Object.keys(OVERRIDES)];
  return names
    .map(getMcpToolCapability)
    .filter((capability) => !filter.operation || capability.operation === filter.operation)
    .sort((a, b) => a.tool.localeCompare(b.tool));
}

export function searchMcpCapabilities(query: string): McpToolCapability[] {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return listMcpCapabilities();
  return listMcpCapabilities().filter((capability) => {
    const haystack = `${capability.tool} ${capability.operation} ${capability.capability}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

export function authorizeMcpToolCall(
  tool: string,
  capabilityScopes: readonly string[],
  allowLegacyMutations: boolean
): { allowed: true } | { allowed: false; reason: "capability_scope_required"; required_capability: string } {
  const capability = getMcpToolCapability(tool);
  if (capabilityScopes.includes("*") || capabilityScopes.includes(capability.capability)) return { allowed: true };
  if (capabilityScopes.length === 0 && capability.operation === "read") return { allowed: true };
  if (capabilityScopes.length === 0 && allowLegacyMutations) return { allowed: true };
  return { allowed: false, reason: "capability_scope_required", required_capability: capability.capability };
}

export function preflightMcpToolCall(tool: string, capabilityScopes: readonly string[]) {
  const capability = getMcpToolCapability(tool);
  const authorization = authorizeMcpToolCall(tool, capabilityScopes, false);
  return {
    allowed: authorization.allowed,
    tool: capability.tool,
    operation: capability.operation,
    required_capability: capability.capability,
    approval_required: capability.approval_required,
    idempotent: capability.idempotent,
    idempotency_required: requiresMcpIdempotency(capability),
    freshness: capability.freshness,
    cost_tier: capability.cost_tier,
    ...(authorization.allowed ? {} : { reason: authorization.reason }),
  };
}
