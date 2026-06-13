// Persistence layer for the Market Research Agent.
//
// Three tables:
//   - seo_research_briefs:       one row per research brief (the strategic output)
//   - seo_research_observations: one row per tool call (atomic evidence)
//   - seo_research_entities:     registry of distinct entities tracked over time
//
// IMPORTANT: This is a HISTORICAL MEMORY layer, NOT a cache. The agent always
// calls tools live; observations are persisted to enable delta computation,
// time-series, and entity tracking — never to skip live calls.

import { neon } from "@neondatabase/serverless";
import { createHash } from "node:crypto";

let client: ReturnType<typeof neon> | null = null;
let initialized = false;

function getSql() {
  if (!process.env.DATABASE_URL) return null;
  if (!client) client = neon(process.env.DATABASE_URL);
  return client;
}

// ============================================================================
// TYPES
// ============================================================================

export type ResearchBriefStatus =
  | "planning"
  | "awaiting_approval"
  | "running"
  | "completed"
  | "failed";

export type ResearchQuestionType =
  | "competitive_landscape"
  | "market_opportunity"
  | "customer_voice"
  | "category_trend"
  | "pauta_intelligence"
  | "brand_audit"
  | "topic_research";

export type ResearchPlanStep = {
  step_number: number;
  tool: string;
  args: Record<string, unknown>;
  why: string;
  expected_cost_usd: number;
  depends_on?: number[];      // step numbers that must complete first
};

export type ResearchPlan = {
  steps: ResearchPlanStep[];
  total_expected_cost_usd: number;
  parallel_groups?: number[][];   // optional grouping of step numbers that can run in parallel
};

export type ResearchClassification = {
  type: ResearchQuestionType;
  entities: string[];
  depth: "quick" | "standard" | "deep";
  language: string;
  geo_scope: string[];
  rationale: string;             // why classify this way
};

export type ResearchBrief = {
  id: number;
  question: string;
  question_classification: ResearchClassification;
  domain_scope: string[] | null;
  geo_scope: string[] | null;
  parent_brief_id: number | null;
  plan: ResearchPlan;
  plan_approved: boolean;
  plan_approved_at: string | null;
  plan_approved_by: string | null;
  observation_ids: number[] | null;
  brief: ResearchBriefBody | null;
  brief_markdown: string | null;
  quality_gate: ResearchQualityGate | null;
  status: ResearchBriefStatus;
  cost_usd: number | null;
  llm_input_tokens: number | null;
  llm_output_tokens: number | null;
  apify_runs: number | null;
  errors: unknown[] | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  requested_by: string | null;
};

export type ResearchBriefBody = {
  demanda: ResearchSection;
  oferta: ResearchSection;
  voz_del_cliente: ResearchSection;
  pauta_competitiva: ResearchSection;
  pr_y_backlinks: ResearchSection;
  ai_visibility: ResearchSection;
  gaps_y_oportunidades: ResearchSection;
};

export type ResearchSection = {
  summary: string;                 // 1-3 sentences
  findings: ResearchFinding[];
  evidence_observation_ids: number[];   // FKs into seo_research_observations
};

export type ResearchFinding = {
  claim: string;                   // the assertion
  evidence: string;                // literal numbers/quotes/URLs
  observation_ids: number[];       // which observations support this
  delta?: string;                  // change vs prior reading if any
};

export type ResearchQualityGate = {
  passed: boolean;
  refinement_count: number;
  checklist: {
    has_literal_numbers: boolean;
    acknowledges_data_gaps: boolean;
    avoids_generic_language: boolean;
    seo_pauta_connected: boolean;
    customer_voice_quotes_literal: boolean;
  };
  notes: string;
};

export type ResearchObservation = {
  id: number;
  tool_name: string;
  args_hash: string;
  args: Record<string, unknown>;
  result: unknown;
  result_summary: string | null;
  cost_usd: number | null;
  delta_vs_prior: ResearchDelta | null;
  prior_observation_id: number | null;
  captured_at: string;
  brief_id: number;
};

export type ResearchDelta = {
  prior_captured_at: string;
  days_since_prior: number;
  numeric_changes: Record<string, { prior: number; current: number; delta: number; pct_change: number | null }>;
  categorical_changes: Record<string, { prior: string; current: string }>;
  textual_diff_summary: string | null;
};

export type ResearchEntity = {
  id: number;
  entity_type: "brand" | "competitor" | "keyword" | "url" | "sede" | "program" | "hashtag" | "media_outlet";
  canonical_name: string;
  display_name: string | null;
  aliases: string[] | null;
  mention_count: number;
  first_seen_at: string;
  last_seen_at: string;
  metadata: Record<string, unknown> | null;
};

// ============================================================================
// LOOKBACK WINDOWS — for delta computation, NOT for reuse
// ============================================================================

const LOOKBACK_DEFAULTS_DAYS: Array<{ pattern: RegExp; days: number }> = [
  { pattern: /^gsc_search_analytics_query|^gsc_keyword_opportunities/, days: 7 },
  { pattern: /^gsc_url_inspection|^gsc_sites_/, days: 14 },
  { pattern: /^pagespeed_|^onpage_lighthouse_live/, days: 7 },
  { pattern: /^schema_/, days: 30 },
  { pattern: /^http_headers_inspect|^redirect_chain_check/, days: 7 },
  { pattern: /^serp_|^serpapi_/, days: 7 },
  { pattern: /^labs_google_/, days: 30 },
  { pattern: /^backlinks_/, days: 30 },
  { pattern: /^ai_optimization_/, days: 14 },
  { pattern: /^local_google_maps_scraper|^web_content_crawler/, days: 30 },
  { pattern: /^social_/, days: 7 },
  { pattern: /^market_news_monitor/, days: 14 },
  { pattern: /^market_reddit_intelligence/, days: 30 },
  { pattern: /^keyword_universe_|^brand_/, days: 90 },
  { pattern: /^adlib_|^apify_run_actor/, days: 14 },
  { pattern: /^apify_google_search_multi_engine|^apify_link_prospecting_tool|^apify_meta_brand_collaboration|^apify_tripadvisor_lead_enrichment/, days: 14 },
];

export function lookbackDaysForTool(toolName: string): number {
  for (const entry of LOOKBACK_DEFAULTS_DAYS) {
    if (entry.pattern.test(toolName)) return entry.days;
  }
  return 14;  // default
}

// ============================================================================
// SCHEMA
// ============================================================================

export async function ensureResearchSchema(): Promise<void> {
  const sql = getSql();
  if (!sql || initialized) return;

  await sql`
    create table if not exists seo_research_briefs (
      id bigserial primary key,
      question text not null,
      question_classification jsonb,
      domain_scope text[],
      geo_scope text[],
      parent_brief_id bigint references seo_research_briefs(id),
      plan jsonb,
      plan_approved boolean not null default false,
      plan_approved_at timestamptz,
      plan_approved_by text,
      observation_ids bigint[],
      brief jsonb,
      brief_markdown text,
      quality_gate jsonb,
      status text not null default 'planning',
      cost_usd numeric,
      llm_input_tokens integer,
      llm_output_tokens integer,
      apify_runs integer,
      errors jsonb,
      created_at timestamptz not null default now(),
      started_at timestamptz,
      completed_at timestamptz,
      requested_by text
    )
  `;
  await sql`create index if not exists seo_research_briefs_status on seo_research_briefs (status)`;
  await sql`create index if not exists seo_research_briefs_created on seo_research_briefs (created_at desc)`;
  await sql`create index if not exists seo_research_briefs_geo on seo_research_briefs using gin (geo_scope)`;
  await sql`create index if not exists seo_research_briefs_domain on seo_research_briefs using gin (domain_scope)`;
  await sql`create index if not exists seo_research_briefs_parent on seo_research_briefs (parent_brief_id) where parent_brief_id is not null`;

  await sql`
    create table if not exists seo_research_observations (
      id bigserial primary key,
      tool_name text not null,
      args_hash text not null,
      args jsonb not null,
      result jsonb not null,
      result_summary text,
      cost_usd numeric,
      delta_vs_prior jsonb,
      prior_observation_id bigint references seo_research_observations(id),
      captured_at timestamptz not null default now(),
      brief_id bigint references seo_research_briefs(id) on delete set null
    )
  `;
  await sql`create index if not exists seo_research_obs_lookup on seo_research_observations (tool_name, args_hash, captured_at desc)`;
  await sql`create index if not exists seo_research_obs_brief on seo_research_observations (brief_id) where brief_id is not null`;
  await sql`create index if not exists seo_research_obs_recency on seo_research_observations (captured_at desc)`;

  await sql`
    create table if not exists seo_research_entities (
      id bigserial primary key,
      entity_type text not null,
      canonical_name text not null,
      display_name text,
      aliases text[],
      mention_count integer not null default 1,
      first_seen_at timestamptz not null default now(),
      last_seen_at timestamptz not null default now(),
      metadata jsonb,
      unique (entity_type, canonical_name)
    )
  `;
  await sql`create index if not exists seo_research_entities_type on seo_research_entities (entity_type)`;
  await sql`create index if not exists seo_research_entities_name on seo_research_entities (canonical_name)`;
  await sql`create index if not exists seo_research_entities_mention on seo_research_entities (mention_count desc)`;

  initialized = true;
}

// ============================================================================
// HASHING (canonical args hash for delta lookup)
// ============================================================================

export function canonicalArgsHash(args: Record<string, unknown>): string {
  const canonical = JSON.stringify(args, Object.keys(args).sort());
  return createHash("sha256").update(canonical).digest("hex");
}

// ============================================================================
// BRIEFS API
// ============================================================================

export async function createBrief(input: {
  question: string;
  classification: ResearchClassification;
  parent_brief_id?: number;
  requested_by?: string;
}): Promise<number> {
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL not configured");
  await ensureResearchSchema();
  const rows = await sql`
    insert into seo_research_briefs
      (question, question_classification, domain_scope, geo_scope, parent_brief_id, requested_by, status)
    values
      (${input.question},
       ${JSON.stringify(input.classification)}::jsonb,
       ${input.classification.entities.length > 0 ? input.classification.entities : null},
       ${input.classification.geo_scope.length > 0 ? input.classification.geo_scope : null},
       ${input.parent_brief_id ?? null},
       ${input.requested_by ?? "system"},
       'planning')
    returning id
  ` as Array<{ id: number }>;
  return rows[0].id;
}

export async function setBriefPlan(briefId: number, plan: ResearchPlan): Promise<void> {
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL not configured");
  await sql`
    update seo_research_briefs
    set plan = ${JSON.stringify(plan)}::jsonb,
        status = 'awaiting_approval'
    where id = ${briefId}
  `;
}

export async function approveBriefPlan(briefId: number, approvedBy: string, planEdits?: ResearchPlan): Promise<void> {
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL not configured");
  if (planEdits) {
    await sql`
      update seo_research_briefs
      set plan = ${JSON.stringify(planEdits)}::jsonb,
          plan_approved = true,
          plan_approved_at = now(),
          plan_approved_by = ${approvedBy},
          status = 'running',
          started_at = now()
      where id = ${briefId}
    `;
  } else {
    await sql`
      update seo_research_briefs
      set plan_approved = true,
          plan_approved_at = now(),
          plan_approved_by = ${approvedBy},
          status = 'running',
          started_at = now()
      where id = ${briefId}
    `;
  }
}

export async function completeBrief(briefId: number, input: {
  brief: ResearchBriefBody;
  brief_markdown: string;
  quality_gate: ResearchQualityGate;
  observation_ids: number[];
  cost_usd: number;
  llm_input_tokens: number;
  llm_output_tokens: number;
  apify_runs: number;
  errors?: unknown[];
}): Promise<void> {
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL not configured");
  await sql`
    update seo_research_briefs
    set brief = ${JSON.stringify(input.brief)}::jsonb,
        brief_markdown = ${input.brief_markdown},
        quality_gate = ${JSON.stringify(input.quality_gate)}::jsonb,
        observation_ids = ${input.observation_ids.length > 0 ? input.observation_ids : null},
        cost_usd = ${input.cost_usd},
        llm_input_tokens = ${input.llm_input_tokens},
        llm_output_tokens = ${input.llm_output_tokens},
        apify_runs = ${input.apify_runs},
        errors = ${input.errors ? JSON.stringify(input.errors) : null}::jsonb,
        status = 'completed',
        completed_at = now()
    where id = ${briefId}
  `;
}

export async function failBrief(briefId: number, errors: unknown[]): Promise<void> {
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL not configured");
  await sql`
    update seo_research_briefs
    set status = 'failed',
        errors = ${JSON.stringify(errors)}::jsonb,
        completed_at = now()
    where id = ${briefId}
  `;
}

export async function getBrief(briefId: number): Promise<ResearchBrief | null> {
  const sql = getSql();
  if (!sql) return null;
  await ensureResearchSchema();
  const rows = await sql`select * from seo_research_briefs where id = ${briefId} limit 1` as ResearchBrief[];
  return rows[0] ?? null;
}

export async function listBriefs(filters: {
  status?: ResearchBriefStatus;
  geo_contains?: string;
  domain_contains?: string;
  limit?: number;
} = {}): Promise<ResearchBrief[]> {
  const sql = getSql();
  if (!sql) return [];
  await ensureResearchSchema();
  return await sql`
    select id, question, question_classification, domain_scope, geo_scope, parent_brief_id,
      plan_approved, status, cost_usd, created_at::text, completed_at::text, requested_by
    from seo_research_briefs
    where (${filters.status ?? null}::text is null or status = ${filters.status ?? null})
      and (${filters.geo_contains ?? null}::text is null or ${filters.geo_contains ?? null} = any(geo_scope))
      and (${filters.domain_contains ?? null}::text is null or ${filters.domain_contains ?? null} = any(domain_scope))
    order by created_at desc
    limit ${filters.limit ?? 50}
  ` as ResearchBrief[];
}

// ============================================================================
// OBSERVATIONS API
// ============================================================================

export async function findPriorObservation(toolName: string, argsHash: string, lookbackDays: number): Promise<ResearchObservation | null> {
  const sql = getSql();
  if (!sql) return null;
  const rows = await sql`
    select id, tool_name, args_hash, args, result, result_summary, cost_usd,
      delta_vs_prior, prior_observation_id, captured_at::text, brief_id
    from seo_research_observations
    where tool_name = ${toolName}
      and args_hash = ${argsHash}
      and captured_at > now() - (${lookbackDays} || ' days')::interval
    order by captured_at desc
    limit 1
  ` as ResearchObservation[];
  return rows[0] ?? null;
}

export async function persistObservation(input: {
  tool_name: string;
  args: Record<string, unknown>;
  result: unknown;
  cost_usd?: number;
  brief_id: number;
  delta_vs_prior?: ResearchDelta | null;
  prior_observation_id?: number | null;
}): Promise<number> {
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL not configured");
  const argsHash = canonicalArgsHash(input.args);
  const rows = await sql`
    insert into seo_research_observations
      (tool_name, args_hash, args, result, cost_usd, delta_vs_prior, prior_observation_id, brief_id)
    values
      (${input.tool_name}, ${argsHash},
       ${JSON.stringify(input.args)}::jsonb,
       ${JSON.stringify(input.result)}::jsonb,
       ${input.cost_usd ?? null},
       ${input.delta_vs_prior ? JSON.stringify(input.delta_vs_prior) : null}::jsonb,
       ${input.prior_observation_id ?? null},
       ${input.brief_id})
    returning id
  ` as Array<{ id: number }>;
  return rows[0].id;
}

export async function annotateObservationSummary(observationId: number, summary: string): Promise<void> {
  const sql = getSql();
  if (!sql) return;
  await sql`update seo_research_observations set result_summary = ${summary} where id = ${observationId}`;
}

// ============================================================================
// ENTITIES API
// ============================================================================

function normalizeEntity(name: string): string {
  return name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

export async function recordEntity(input: {
  entity_type: ResearchEntity["entity_type"];
  display_name: string;
  aliases?: string[];
  metadata?: Record<string, unknown>;
}): Promise<number> {
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL not configured");
  const canonical = normalizeEntity(input.display_name);
  const rows = await sql`
    insert into seo_research_entities
      (entity_type, canonical_name, display_name, aliases, metadata, mention_count)
    values
      (${input.entity_type}, ${canonical}, ${input.display_name},
       ${input.aliases && input.aliases.length > 0 ? input.aliases : null},
       ${input.metadata ? JSON.stringify(input.metadata) : null}::jsonb,
       1)
    on conflict (entity_type, canonical_name) do update
      set mention_count = seo_research_entities.mention_count + 1,
          last_seen_at = now(),
          aliases = case
            when excluded.aliases is not null then
              array(select distinct unnest(coalesce(seo_research_entities.aliases, array[]::text[]) || excluded.aliases))
            else seo_research_entities.aliases
          end,
          metadata = coalesce(excluded.metadata, seo_research_entities.metadata)
    returning id
  ` as Array<{ id: number }>;
  return rows[0].id;
}

export async function listEntities(filters: { entity_type?: ResearchEntity["entity_type"]; limit?: number } = {}): Promise<ResearchEntity[]> {
  const sql = getSql();
  if (!sql) return [];
  await ensureResearchSchema();
  return await sql`
    select id, entity_type, canonical_name, display_name, aliases, mention_count,
      first_seen_at::text, last_seen_at::text, metadata
    from seo_research_entities
    where (${filters.entity_type ?? null}::text is null or entity_type = ${filters.entity_type ?? null})
    order by mention_count desc, last_seen_at desc
    limit ${filters.limit ?? 100}
  ` as ResearchEntity[];
}

// ============================================================================
// DELTA COMPUTATION
// ============================================================================

export function computeDelta(prior: ResearchObservation, currentResult: unknown): ResearchDelta {
  const priorResult = prior.result;
  const days = Math.round((Date.now() - new Date(prior.captured_at).getTime()) / (1000 * 60 * 60 * 24));
  const numericChanges: ResearchDelta["numeric_changes"] = {};
  const categoricalChanges: ResearchDelta["categorical_changes"] = {};
  let textualDiffSummary: string | null = null;

  // Best-effort: if both are objects with numeric leaves, compute per-key deltas.
  if (typeof priorResult === "object" && priorResult !== null && typeof currentResult === "object" && currentResult !== null) {
    const priorObj = priorResult as Record<string, unknown>;
    const currentObj = currentResult as Record<string, unknown>;
    for (const key of Object.keys(currentObj)) {
      const p = priorObj[key];
      const c = currentObj[key];
      if (typeof p === "number" && typeof c === "number") {
        const delta = c - p;
        const pct = p !== 0 ? (delta / p) * 100 : null;
        if (delta !== 0) numericChanges[key] = { prior: p, current: c, delta, pct_change: pct };
      } else if (typeof p === "string" && typeof c === "string" && p !== c && p.length < 200 && c.length < 200) {
        categoricalChanges[key] = { prior: p, current: c };
      }
    }
  }

  // Top-level result-level diff for text (e.g. tool returned a string blob)
  if (typeof priorResult === "string" && typeof currentResult === "string" && priorResult !== currentResult) {
    textualDiffSummary = `text changed (prior length: ${priorResult.length}, current: ${currentResult.length})`;
  }

  return {
    prior_captured_at: prior.captured_at,
    days_since_prior: days,
    numeric_changes: numericChanges,
    categorical_changes: categoricalChanges,
    textual_diff_summary: textualDiffSummary,
  };
}
