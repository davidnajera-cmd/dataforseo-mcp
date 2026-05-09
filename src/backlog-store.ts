import { neon } from "@neondatabase/serverless";
import { createHash } from "node:crypto";

let client: ReturnType<typeof neon> | null = null;
let initialized = false;

function getSql() {
  if (!process.env.DATABASE_URL) return null;
  if (!client) client = neon(process.env.DATABASE_URL);
  return client;
}

export type BacklogStatus = "pendiente" | "en_progreso" | "ejecutada" | "descartada" | "blocked";
export type BacklogPhase = "recovery" | "growth" | "config" | "neutral";
export type BacklogPriority = "alta" | "media" | "baja";
export type BacklogCategory =
  | "technical" | "tecnico"
  | "migracion"
  | "on-page" | "content" | "social"
  | "link-building" | "ai-optimization" | "schema" | "sitemap"
  | "ctr" | "indexacion" | "seo-local" | "performance" | "ecommerce" | "llm-visibility";
export type BacklogSourceType = "agent" | "heuristic" | "manual";
export type BacklogIntencion = "branded" | "navegacional" | "informacional" | "comercial" | "local" | "ambiguous";
export type BacklogActionType =
  | "audit"               // sólo investigar, no ejecutar nada todavía
  | "execution"           // acción directa segura (reescribir meta, agregar schema)
  | "audit_backlinks"     // específico para enlaces
  | "reclaim_lost_links"
  | "build_local_links"
  | "disavow_candidate"   // candidatos a disavow, requiere revisión humana
  | "outreach_opportunity"
  | "config";             // setup técnico (GA4 events, sitemap)
export type BacklogRiskLevel = "low" | "medium" | "high";
export type BacklogAudience = "estudiantes_actuales" | "leads_nuevos" | "mixto" | "publico_general" | "ecommerce_buyers";
export type BacklogFunnelStage = "descubrimiento" | "consideracion" | "decision" | "soporte_acceso" | "retencion";
export type BacklogConversionExpected = "matricula" | "lead" | "compra" | "no_aplica" | "navegacional";
export type BacklogEffortSize = "S" | "M" | "L";
export type BacklogRootCause =
  | "noindex"
  | "redirect_chain"
  | "404"
  | "canonical_mismatch"
  | "thin_content"
  | "missing_url"
  | "soft_404"
  | "blocked_robots"
  | null;
export type BacklogKpiSpec = {
  metric: string;
  value: number | string | null;
  source?: string;
  captured_at?: string;
  deadline?: string;
};

export type BacklogTask = {
  id: number;
  task_signature: string;
  title: string;
  description: string;
  domain: string;
  category: BacklogCategory;
  priority: BacklogPriority;
  impact_score: number | null;
  difficulty_score: number | null;
  confidence_score: number | null;
  opportunity_score: number | null;
  impact_expected: string | null;
  impact_conversion: string | null;
  rationale: string;
  data_sources: unknown;
  status: BacklogStatus;
  proposed_by: string;
  source_type: BacklogSourceType;
  proposed_at: string;
  updated_at: string;
  closed_at: string | null;
  assignee: string | null;
  assignee_suggested: string | null;
  programa_relacionado: string | null;
  materia_relacionada: string | null;
  sede_relacionada: string | null;
  modalidad_jornada: string | null;
  intencion: BacklogIntencion | null;
  action_type: BacklogActionType | null;
  risk_level: BacklogRiskLevel | null;
  requires_human_review: boolean | null;
  audience: BacklogAudience | null;
  funnel_stage: BacklogFunnelStage | null;
  conversion_expected: BacklogConversionExpected | null;
  business_goal: string | null;
  phase: BacklogPhase | null;
  owner: string | null;
  due_date: string | null;
  team_area: string | null;
  blocked_by: number[] | null;       // task IDs this task depends on
  blocked_reason: string | null;
  stale_at: string | null;
  notes: string | null;
  slack_list_item_id: string | null;
  slack_synced_at: string | null;
  acceptance_criteria: string | null;
  kpi_baseline: BacklogKpiSpec | null;
  kpi_target: BacklogKpiSpec | null;
  effort_size: BacklogEffortSize | null;
  root_cause: BacklogRootCause;
  cluster_id: string | null;
};

export async function ensureBacklogSchema(): Promise<void> {
  const sql = getSql();
  if (!sql || initialized) return;

  await sql`
    create table if not exists seo_backlog_tasks (
      id bigserial primary key,
      task_signature text unique not null,
      title text not null,
      description text not null,
      domain text not null,
      category text not null,
      priority text not null,
      impact_expected text,
      rationale text not null,
      data_sources jsonb not null,
      status text not null default 'pendiente',
      proposed_by text not null default 'agent',
      proposed_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      closed_at timestamptz,
      assignee text,
      notes text
    )
  `;
  // Idempotent migration: add new scoring + source columns if missing.
  await sql`alter table seo_backlog_tasks add column if not exists impact_score numeric`;
  await sql`alter table seo_backlog_tasks add column if not exists difficulty_score numeric`;
  await sql`alter table seo_backlog_tasks add column if not exists confidence_score numeric`;
  await sql`alter table seo_backlog_tasks add column if not exists opportunity_score numeric`;
  await sql`alter table seo_backlog_tasks add column if not exists source_type text not null default 'agent'`;
  await sql`alter table seo_backlog_tasks add column if not exists assignee_suggested text`;
  await sql`alter table seo_backlog_tasks add column if not exists impact_conversion text`;
  await sql`alter table seo_backlog_tasks add column if not exists programa_relacionado text`;
  await sql`alter table seo_backlog_tasks add column if not exists materia_relacionada text`;
  await sql`alter table seo_backlog_tasks add column if not exists sede_relacionada text`;
  await sql`alter table seo_backlog_tasks add column if not exists modalidad_jornada text`;
  await sql`alter table seo_backlog_tasks add column if not exists intencion text`;
  await sql`alter table seo_backlog_tasks add column if not exists action_type text`;
  await sql`alter table seo_backlog_tasks add column if not exists risk_level text`;
  await sql`alter table seo_backlog_tasks add column if not exists requires_human_review boolean default false`;
  await sql`alter table seo_backlog_tasks add column if not exists audience text`;
  await sql`alter table seo_backlog_tasks add column if not exists funnel_stage text`;
  await sql`alter table seo_backlog_tasks add column if not exists conversion_expected text`;
  await sql`alter table seo_backlog_tasks add column if not exists business_goal text`;
  await sql`alter table seo_backlog_tasks add column if not exists phase text`;
  await sql`alter table seo_backlog_tasks add column if not exists owner text`;
  await sql`alter table seo_backlog_tasks add column if not exists due_date date`;
  await sql`alter table seo_backlog_tasks add column if not exists team_area text`;
  await sql`alter table seo_backlog_tasks add column if not exists blocked_by jsonb`;
  await sql`alter table seo_backlog_tasks add column if not exists blocked_reason text`;
  await sql`alter table seo_backlog_tasks add column if not exists stale_at timestamptz`;
  await sql`alter table seo_backlog_tasks add column if not exists slack_list_item_id text`;
  await sql`alter table seo_backlog_tasks add column if not exists slack_synced_at timestamptz`;
  await sql`alter table seo_backlog_tasks add column if not exists slack_last_pushed_status text`;
  // V2 agent: structured acceptance + KPI + effort + root cause + cluster.
  await sql`alter table seo_backlog_tasks add column if not exists acceptance_criteria text`;
  await sql`alter table seo_backlog_tasks add column if not exists kpi_baseline jsonb`;
  await sql`alter table seo_backlog_tasks add column if not exists kpi_target jsonb`;
  await sql`alter table seo_backlog_tasks add column if not exists effort_size text`;
  await sql`alter table seo_backlog_tasks add column if not exists root_cause text`;
  await sql`alter table seo_backlog_tasks add column if not exists cluster_id text`;
  await sql`create index if not exists seo_backlog_cluster on seo_backlog_tasks (cluster_id) where cluster_id is not null`;
  await sql`create index if not exists seo_backlog_root_cause on seo_backlog_tasks (root_cause) where root_cause is not null`;
  await sql`create index if not exists seo_backlog_slack on seo_backlog_tasks (slack_list_item_id) where slack_list_item_id is not null`;
  await sql`create index if not exists seo_backlog_lookup on seo_backlog_tasks (domain, status, priority)`;
  await sql`create index if not exists seo_backlog_proposed on seo_backlog_tasks (proposed_at desc)`;
  await sql`create index if not exists seo_backlog_score on seo_backlog_tasks (opportunity_score desc nulls last)`;
  await sql`create index if not exists seo_backlog_taxonomy on seo_backlog_tasks (programa_relacionado, sede_relacionada, intencion)`;

  await sql`
    create table if not exists seo_agent_runs (
      id bigserial primary key,
      started_at timestamptz not null default now(),
      ended_at timestamptz,
      status text not null default 'running',
      tasks_proposed integer,
      tasks_inserted integer,
      tasks_updated integer,
      tasks_skipped integer,
      cost_usd numeric,
      stats jsonb,
      errors jsonb
    )
  `;
  initialized = true;
}

export function makeTaskSignature(domain: string, category: string, key: string): string {
  return createHash("sha1").update(`${domain}::${category}::${key}`).digest("hex");
}

export type ProposedTask = {
  signature_key: string;
  title: string;
  description: string;
  domain: string;
  category: BacklogCategory;
  priority: BacklogPriority;
  impact_expected?: string | null;
  impact_conversion?: string | null;
  rationale: string;
  data_sources: unknown;
  // Scoring (0..100). If omitted, opportunity_score stays null and the UI
  // falls back to priority for sorting.
  impact_score?: number;
  difficulty_score?: number;
  confidence_score?: number;
  source_type?: BacklogSourceType;
  assignee_suggested?: string;
  programa_relacionado?: string | null;
  materia_relacionada?: string | null;
  sede_relacionada?: string | null;
  modalidad_jornada?: string | null;
  intencion?: BacklogIntencion | null;
  action_type?: BacklogActionType | null;
  risk_level?: BacklogRiskLevel | null;
  requires_human_review?: boolean | null;
  audience?: BacklogAudience | null;
  funnel_stage?: BacklogFunnelStage | null;
  conversion_expected?: BacklogConversionExpected | null;
  business_goal?: string | null;
  phase?: BacklogPhase | null;
  owner?: string | null;
  due_date?: string | null;
  team_area?: string | null;
  blocked_by_signature_keys?: string[] | null;  // signature keys to resolve to ids
  blocked_reason?: string | null;
  acceptance_criteria?: string | null;
  kpi_baseline?: BacklogKpiSpec | null;
  kpi_target?: BacklogKpiSpec | null;
  effort_size?: BacklogEffortSize | null;
  root_cause?: BacklogRootCause;
  cluster_id?: string | null;
};

// Cheap word-overlap similarity used to detect semantic duplicates between
// heuristic-generated and Opus-generated tasks. Tokenizes lowercase and
// counts common token ratio over the union (Jaccard).
function titleSimilarity(a: string, b: string): number {
  const tok = (s: string) => new Set(
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^\w\s]/g, " ").split(/\s+/).filter((t) => t.length > 2)
  );
  const A = tok(a), B = tok(b);
  if (A.size === 0 || B.size === 0) return 0;
  let intersect = 0;
  for (const t of A) if (B.has(t)) intersect++;
  return intersect / new Set([...A, ...B]).size;
}

function clampScore(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, n));
}

function computeOpportunityScore(impact: number | null, difficulty: number | null, confidence: number | null, phase: BacklogPhase | null): number | null {
  if (impact === null && difficulty === null && confidence === null) return null;
  const i = impact ?? 50;
  const d = difficulty ?? 50;
  const c = confidence ?? 70;
  // Score 0..100. Prefer high impact + high confidence + low difficulty.
  let score = (i * c) / Math.max(d, 1);
  // Phase boost: while we are in post-migration recovery focus, recovery and
  // config tasks get a 15% multiplier so they outrank growth tasks at equal
  // raw score. Easy to retire later by setting RECOVERY_FOCUS_ACTIVE=false.
  if (phase === "recovery") score *= 1.15;
  if (phase === "config") score *= 1.20;
  return Math.round(Math.min(score, 999));
}

const PHASE_BY_CATEGORY: Record<string, BacklogPhase> = {
  migracion: "recovery",
  technical: "recovery",
  tecnico: "recovery",
  indexacion: "recovery",
  schema: "recovery",
  sitemap: "recovery",
  performance: "recovery",
  ctr: "growth",
  "on-page": "growth",
  content: "growth",
  social: "growth",
  "seo-local": "growth",
  "llm-visibility": "growth",
  "ai-optimization": "growth",
  ecommerce: "growth",
  "link-building": "neutral", // depends on action — audit vs build
};

function derivePhase(category: BacklogCategory, declared?: BacklogPhase | null): BacklogPhase {
  if (declared) return declared;
  return PHASE_BY_CATEGORY[category] ?? "neutral";
}

export async function upsertProposedTasks(tasks: ProposedTask[], options: { maxNewInserts?: number } = {}): Promise<{ inserted: number; updated: number; skipped: number; capped: number }> {
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL not configured");
  await ensureBacklogSchema();
  let inserted = 0, updated = 0, skipped = 0, capped = 0;

  // Resolve blocked_by_signature_keys → integer task IDs by looking up
  // existing rows with matching signatures (could be from same batch or earlier).
  const sqlRef = sql; // capture non-null for inner closure
  async function resolveBlockedBy(keys: string[] | null | undefined, currentDomain: string): Promise<number[] | null> {
    if (!keys || keys.length === 0) return null;
    const ids: number[] = [];
    for (const key of keys) {
      const rows = await sqlRef`
        select id from seo_backlog_tasks
        where domain = ${currentDomain}
          and (task_signature like ${"%" + key + "%"} or title ilike ${"%" + key + "%"})
        order by id desc limit 1
      ` as Array<{ id: number }>;
      if (rows.length > 0) ids.push(rows[0].id);
    }
    return ids.length > 0 ? ids : null;
  }

  for (const task of tasks) {
    const signature = makeTaskSignature(task.domain, task.category, task.signature_key);
    const impact = clampScore(task.impact_score);
    const difficulty = clampScore(task.difficulty_score);
    const confidence = clampScore(task.confidence_score);
    const phase = derivePhase(task.category, task.phase);
    const opportunity = computeOpportunityScore(impact, difficulty, confidence, phase);
    const sourceType = task.source_type ?? "agent";
    const blockedByIds = await resolveBlockedBy(task.blocked_by_signature_keys, task.domain);

    // Semantic dedup: also look for a recent open task with same domain + category
    // and >= 75% title overlap. Treat as the same task and update it instead of
    // inserting a duplicate.
    let existing: Array<{ id: number; status: string }> = await sql`
      select id, status from seo_backlog_tasks where task_signature = ${signature} limit 1
    ` as Array<{ id: number; status: string }>;
    if (existing.length === 0) {
      const candidates = await sql`
        select id, status, title from seo_backlog_tasks
        where domain = ${task.domain} and category = ${task.category}
          and status in ('pendiente','en_progreso','blocked')
        order by proposed_at desc limit 25
      ` as Array<{ id: number; status: string; title: string }>;
      const matchedSemantic = candidates.find((c) => titleSimilarity(c.title, task.title) >= 0.75);
      if (matchedSemantic) {
        existing = [{ id: matchedSemantic.id, status: matchedSemantic.status }];
      }
    }
    if (existing.length === 0) {
      // Cap on new inserts per call. Once exceeded we mark as 'capped' (skipped).
      if (options.maxNewInserts !== undefined && inserted >= options.maxNewInserts) {
        capped++;
        continue;
      }
      await sql`
        insert into seo_backlog_tasks
          (task_signature, title, description, domain, category, priority, impact_expected, impact_conversion,
           rationale, data_sources, status, proposed_by, source_type,
           impact_score, difficulty_score, confidence_score, opportunity_score, assignee_suggested,
           programa_relacionado, materia_relacionada, sede_relacionada, modalidad_jornada, intencion,
           action_type, risk_level, requires_human_review)
        values
          (${signature}, ${task.title}, ${task.description}, ${task.domain}, ${task.category}, ${task.priority},
           ${task.impact_expected ?? null}, ${task.impact_conversion ?? null},
           ${task.rationale}, ${JSON.stringify(task.data_sources)}::jsonb,
           'pendiente', ${sourceType}, ${sourceType},
           ${impact}, ${difficulty}, ${confidence}, ${opportunity}, ${task.assignee_suggested ?? null},
           ${task.programa_relacionado ?? null}, ${task.materia_relacionada ?? null}, ${task.sede_relacionada ?? null},
           ${task.modalidad_jornada ?? null}, ${task.intencion ?? null},
           ${task.action_type ?? null}, ${task.risk_level ?? null}, ${task.requires_human_review ?? false})
      `;
      // Set the new business + operational columns separately to keep the main
      // insert backwards-compatible if any of them are missing in the row.
      await sql`
        update seo_backlog_tasks
        set audience = ${task.audience ?? null},
            funnel_stage = ${task.funnel_stage ?? null},
            conversion_expected = ${task.conversion_expected ?? null},
            business_goal = ${task.business_goal ?? null},
            phase = ${phase},
            owner = ${task.owner ?? null},
            due_date = ${task.due_date ?? null}::date,
            team_area = ${task.team_area ?? null},
            blocked_by = ${blockedByIds ? JSON.stringify(blockedByIds) : null}::jsonb,
            blocked_reason = ${task.blocked_reason ?? null},
            acceptance_criteria = ${task.acceptance_criteria ?? null},
            kpi_baseline = ${task.kpi_baseline ? JSON.stringify(task.kpi_baseline) : null}::jsonb,
            kpi_target = ${task.kpi_target ? JSON.stringify(task.kpi_target) : null}::jsonb,
            effort_size = ${task.effort_size ?? null},
            root_cause = ${task.root_cause ?? null},
            cluster_id = ${task.cluster_id ?? null}
        where task_signature = ${signature}
      `;
      inserted++;
      continue;
    }
    const row = existing[0];
    if (row.status === "ejecutada" || row.status === "descartada") {
      skipped++;
      continue;
    }
    await sql`
      update seo_backlog_tasks
      set title = ${task.title},
          description = ${task.description},
          priority = ${task.priority},
          impact_expected = ${task.impact_expected ?? null},
          impact_conversion = ${task.impact_conversion ?? null},
          rationale = ${task.rationale},
          data_sources = ${JSON.stringify(task.data_sources)}::jsonb,
          source_type = ${sourceType},
          impact_score = ${impact},
          difficulty_score = ${difficulty},
          confidence_score = ${confidence},
          opportunity_score = ${opportunity},
          assignee_suggested = coalesce(${task.assignee_suggested ?? null}, assignee_suggested),
          programa_relacionado = coalesce(${task.programa_relacionado ?? null}, programa_relacionado),
          materia_relacionada = coalesce(${task.materia_relacionada ?? null}, materia_relacionada),
          sede_relacionada = coalesce(${task.sede_relacionada ?? null}, sede_relacionada),
          modalidad_jornada = coalesce(${task.modalidad_jornada ?? null}, modalidad_jornada),
          intencion = coalesce(${task.intencion ?? null}, intencion),
          action_type = coalesce(${task.action_type ?? null}, action_type),
          risk_level = coalesce(${task.risk_level ?? null}, risk_level),
          requires_human_review = coalesce(${task.requires_human_review ?? null}, requires_human_review),
          audience = coalesce(${task.audience ?? null}, audience),
          funnel_stage = coalesce(${task.funnel_stage ?? null}, funnel_stage),
          conversion_expected = coalesce(${task.conversion_expected ?? null}, conversion_expected),
          business_goal = coalesce(${task.business_goal ?? null}, business_goal),
          phase = ${phase},
          owner = coalesce(${task.owner ?? null}, owner),
          due_date = coalesce(${task.due_date ?? null}::date, due_date),
          team_area = coalesce(${task.team_area ?? null}, team_area),
          blocked_by = coalesce(${blockedByIds ? JSON.stringify(blockedByIds) : null}::jsonb, blocked_by),
          blocked_reason = coalesce(${task.blocked_reason ?? null}, blocked_reason),
          acceptance_criteria = coalesce(${task.acceptance_criteria ?? null}, acceptance_criteria),
          kpi_baseline = coalesce(${task.kpi_baseline ? JSON.stringify(task.kpi_baseline) : null}::jsonb, kpi_baseline),
          kpi_target = coalesce(${task.kpi_target ? JSON.stringify(task.kpi_target) : null}::jsonb, kpi_target),
          effort_size = coalesce(${task.effort_size ?? null}, effort_size),
          root_cause = coalesce(${task.root_cause ?? null}, root_cause),
          cluster_id = coalesce(${task.cluster_id ?? null}, cluster_id),
          updated_at = now()
      where id = ${row.id}
    `;
    updated++;
  }
  return { inserted, updated, skipped, capped };
}

export type BacklogFilters = {
  domain?: string;
  status?: BacklogStatus;
  priority?: BacklogPriority;
  category?: BacklogCategory;
  source_type?: BacklogSourceType;
  sort?: "score" | "priority" | "recent";
  limit?: number;
};

export async function listBacklog(filters: BacklogFilters = {}): Promise<BacklogTask[]> {
  const sql = getSql();
  if (!sql) return [];
  await ensureBacklogSchema();
  const sortClause = filters.sort === "recent"
    ? sql`proposed_at desc`
    : filters.sort === "priority"
      ? sql`case priority when 'alta' then 1 when 'media' then 2 else 3 end, proposed_at desc`
      : sql`opportunity_score desc nulls last, case priority when 'alta' then 1 when 'media' then 2 else 3 end, proposed_at desc`;

  return await sql`
    select id, task_signature, title, description, domain, category, priority,
      impact_score, difficulty_score, confidence_score, opportunity_score,
      impact_expected, impact_conversion, rationale, data_sources, status, proposed_by, source_type,
      proposed_at::text, updated_at::text, closed_at::text, assignee, assignee_suggested,
      programa_relacionado, materia_relacionada, sede_relacionada, modalidad_jornada, intencion,
      action_type, risk_level, requires_human_review,
      audience, funnel_stage, conversion_expected, business_goal,
      phase, owner, due_date::text, team_area, blocked_by, blocked_reason, stale_at::text,
      notes, slack_list_item_id, slack_synced_at::text,
      acceptance_criteria, kpi_baseline, kpi_target, effort_size, root_cause, cluster_id
    from seo_backlog_tasks
    where (${filters.domain ?? null}::text is null or domain = ${filters.domain ?? null})
      and (${filters.status ?? null}::text is null or status = ${filters.status ?? null})
      and (${filters.priority ?? null}::text is null or priority = ${filters.priority ?? null})
      and (${filters.category ?? null}::text is null or category = ${filters.category ?? null})
      and (${filters.source_type ?? null}::text is null or source_type = ${filters.source_type ?? null})
    order by ${sortClause}
    limit ${filters.limit ?? 200}
  ` as BacklogTask[];
}

export async function getBacklogTask(id: number): Promise<BacklogTask | null> {
  const sql = getSql();
  if (!sql) return null;
  await ensureBacklogSchema();
  const rows = await sql`
    select id, task_signature, title, description, domain, category, priority,
      impact_score, difficulty_score, confidence_score, opportunity_score,
      impact_expected, impact_conversion, rationale, data_sources, status, proposed_by, source_type,
      proposed_at::text, updated_at::text, closed_at::text, assignee, assignee_suggested,
      programa_relacionado, materia_relacionada, sede_relacionada, modalidad_jornada, intencion,
      action_type, risk_level, requires_human_review,
      audience, funnel_stage, conversion_expected, business_goal,
      phase, owner, due_date::text, team_area, blocked_by, blocked_reason, stale_at::text,
      notes, slack_list_item_id, slack_synced_at::text,
      acceptance_criteria, kpi_baseline, kpi_target, effort_size, root_cause, cluster_id
    from seo_backlog_tasks where id = ${id} limit 1
  ` as BacklogTask[];
  return rows[0] ?? null;
}

export async function updateTaskStatus(id: number, status: BacklogStatus, notes?: string, assignee?: string): Promise<BacklogTask | null> {
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL not configured");
  await ensureBacklogSchema();
  const closed = (status === "ejecutada" || status === "descartada") ? new Date().toISOString() : null;
  await sql`
    update seo_backlog_tasks
    set status = ${status},
        updated_at = now(),
        closed_at = ${closed}::timestamptz,
        notes = coalesce(${notes ?? null}, notes),
        assignee = coalesce(${assignee ?? null}, assignee)
    where id = ${id}
  `;
  return getBacklogTask(id);
}

export async function addTaskNote(id: number, note: string): Promise<BacklogTask | null> {
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL not configured");
  await ensureBacklogSchema();
  await sql`
    update seo_backlog_tasks
    set notes = coalesce(notes || E'\n---\n', '') || ${note}, updated_at = now()
    where id = ${id}
  `;
  return getBacklogTask(id);
}

export async function startAgentRun(): Promise<number> {
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL not configured");
  await ensureBacklogSchema();
  const rows = await sql`insert into seo_agent_runs default values returning id` as Array<{ id: number }>;
  return rows[0].id;
}

export async function finishAgentRun(runId: number, status: string, summary: { proposed: number; inserted: number; updated: number; skipped: number; cost_usd: number; stats: unknown; errors: unknown }): Promise<void> {
  const sql = getSql();
  if (!sql) return;
  await sql`
    update seo_agent_runs
    set ended_at = now(), status = ${status},
        tasks_proposed = ${summary.proposed},
        tasks_inserted = ${summary.inserted},
        tasks_updated = ${summary.updated},
        tasks_skipped = ${summary.skipped},
        cost_usd = ${summary.cost_usd},
        stats = ${JSON.stringify(summary.stats)}::jsonb,
        errors = ${summary.errors === null || summary.errors === undefined ? null : JSON.stringify(summary.errors)}::jsonb
    where id = ${runId}
  `;
}

// Auto-block tasks that depend on others which are not yet ejecutada.
// Idempotent — runs after every upsert and via cron.
export async function applyAutoBlock(): Promise<{ blocked: number; unblocked: number }> {
  const sql = getSql();
  if (!sql) return { blocked: 0, unblocked: 0 };
  await ensureBacklogSchema();
  // Block: tasks whose blocked_by contains any id NOT in ejecutada.
  const blocked = await sql`
    update seo_backlog_tasks t
    set status = 'blocked', updated_at = now()
    where status in ('pendiente','en_progreso')
      and blocked_by is not null
      and exists (
        select 1 from jsonb_array_elements_text(blocked_by) dep_id
        join seo_backlog_tasks dep on dep.id = dep_id::int
        where dep.status <> 'ejecutada'
      )
    returning id
  ` as Array<{ id: number }>;
  // Unblock: tasks currently blocked whose ALL dependencies are now ejecutada.
  const unblocked = await sql`
    update seo_backlog_tasks t
    set status = 'pendiente', updated_at = now(),
        notes = coalesce(notes || E'\n---\n','') || '[auto-unblock] dependencias completadas, tarea reabierta a pendiente.'
    where status = 'blocked'
      and (blocked_by is null
        or not exists (
          select 1 from jsonb_array_elements_text(blocked_by) dep_id
          join seo_backlog_tasks dep on dep.id = dep_id::int
          where dep.status <> 'ejecutada'
        )
      )
    returning id
  ` as Array<{ id: number }>;
  return { blocked: blocked.length, unblocked: unblocked.length };
}

// Mark tasks as stale (annotation only, doesn't change status) when they have
// been pendiente or en_progreso for >30 days without an update. Adds a note;
// does NOT auto-discard — important tasks must keep human review.
export async function markStaleTasks(daysThreshold: number = 30): Promise<{ marked: number }> {
  const sql = getSql();
  if (!sql) return { marked: 0 };
  await ensureBacklogSchema();
  const result = await sql`
    update seo_backlog_tasks
    set stale_at = now(),
        notes = coalesce(notes || E'\n---\n','') || ${'[stale-' + daysThreshold + 'd] sin updates >' + daysThreshold + ' dias. Revisar si sigue siendo relevante.'}
    where status in ('pendiente','en_progreso','blocked')
      and stale_at is null
      and updated_at < now() - (interval '1 day' * ${daysThreshold})
    returning id
  ` as Array<{ id: number }>;
  return { marked: result.length };
}

export type BacklogStats = {
  total_pendiente: number;
  total_en_progreso: number;
  total_blocked: number;
  total_ejecutada: number;
  total_descartada: number;
  recovery_pendiente: number;
  growth_pendiente: number;
  overdue: number;
  no_owner: number;
  no_due_date: number;
  stale: number;
  health_alert: string | null;
};

export async function getBacklogStats(): Promise<BacklogStats> {
  const sql = getSql();
  const empty: BacklogStats = { total_pendiente: 0, total_en_progreso: 0, total_blocked: 0, total_ejecutada: 0, total_descartada: 0, recovery_pendiente: 0, growth_pendiente: 0, overdue: 0, no_owner: 0, no_due_date: 0, stale: 0, health_alert: null };
  if (!sql) return empty;
  await ensureBacklogSchema();
  const rows = await sql`
    select
      count(*) filter (where status = 'pendiente')::int as total_pendiente,
      count(*) filter (where status = 'en_progreso')::int as total_en_progreso,
      count(*) filter (where status = 'blocked')::int as total_blocked,
      count(*) filter (where status = 'ejecutada')::int as total_ejecutada,
      count(*) filter (where status = 'descartada')::int as total_descartada,
      count(*) filter (where status = 'pendiente' and phase = 'recovery')::int as recovery_pendiente,
      count(*) filter (where status = 'pendiente' and phase = 'growth')::int as growth_pendiente,
      count(*) filter (where status in ('pendiente','en_progreso') and due_date is not null and due_date < current_date)::int as overdue,
      count(*) filter (where status in ('pendiente','en_progreso') and (owner is null or owner = ''))::int as no_owner,
      count(*) filter (where status in ('pendiente','en_progreso') and due_date is null)::int as no_due_date,
      count(*) filter (where stale_at is not null and status in ('pendiente','en_progreso','blocked'))::int as stale
    from seo_backlog_tasks
  ` as Array<BacklogStats>;
  const stats = rows[0] ?? empty;
  if (stats.total_pendiente > 200) stats.health_alert = "El backlog supera 200 tareas pendientes. Cap de inserts reducido a 5/run automaticamente. Priorizar asignacion, ejecucion o descarte antes de crear nuevas tareas.";
  else if (stats.total_pendiente > 100) stats.health_alert = "El backlog supera 100 tareas pendientes. Priorizar asignacion, ejecucion o descarte antes de crear nuevas tareas.";
  return stats;
}

export async function countPendingTasks(): Promise<number> {
  const sql = getSql();
  if (!sql) return 0;
  await ensureBacklogSchema();
  const rows = await sql`select count(*)::int as c from seo_backlog_tasks where status = 'pendiente'` as Array<{ c: number }>;
  return rows[0]?.c ?? 0;
}

export async function listAgentRuns(limit: number = 20) {
  const sql = getSql();
  if (!sql) return [];
  await ensureBacklogSchema();
  return await sql`
    select id, started_at::text, ended_at::text, status, tasks_proposed, tasks_inserted, tasks_updated, tasks_skipped, cost_usd, stats, errors
    from seo_agent_runs order by started_at desc limit ${limit}
  `;
}
