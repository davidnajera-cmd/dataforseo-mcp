import { neon } from "@neondatabase/serverless";
import { createHash } from "node:crypto";

let client: ReturnType<typeof neon> | null = null;
let initialized = false;

function getSql() {
  if (!process.env.DATABASE_URL) return null;
  if (!client) client = neon(process.env.DATABASE_URL);
  return client;
}

export type BacklogStatus = "pendiente" | "en_progreso" | "ejecutada" | "descartada";
export type BacklogPriority = "alta" | "media" | "baja";
export type BacklogCategory =
  | "technical" | "on-page" | "content" | "social"
  | "link-building" | "ai-optimization" | "schema" | "sitemap"
  | "ctr" | "indexacion" | "performance" | "ecommerce" | "llm-visibility";
export type BacklogSourceType = "agent" | "heuristic" | "manual";

export type BacklogTask = {
  id: number;
  task_signature: string;
  title: string;
  description: string;
  domain: string;
  category: BacklogCategory;
  priority: BacklogPriority;
  impact_score: number | null;       // 0..100
  difficulty_score: number | null;   // 0..100
  confidence_score: number | null;   // 0..100
  opportunity_score: number | null;  // computed: impact * confidence / max(difficulty, 1)
  impact_expected: string | null;
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
  notes: string | null;
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
  await sql`create index if not exists seo_backlog_lookup on seo_backlog_tasks (domain, status, priority)`;
  await sql`create index if not exists seo_backlog_proposed on seo_backlog_tasks (proposed_at desc)`;
  await sql`create index if not exists seo_backlog_score on seo_backlog_tasks (opportunity_score desc nulls last)`;

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
  rationale: string;
  data_sources: unknown;
  // Scoring (0..100). If omitted, opportunity_score stays null and the UI
  // falls back to priority for sorting.
  impact_score?: number;
  difficulty_score?: number;
  confidence_score?: number;
  source_type?: BacklogSourceType;
  assignee_suggested?: string;
};

function clampScore(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, n));
}

function computeOpportunityScore(impact: number | null, difficulty: number | null, confidence: number | null): number | null {
  if (impact === null && difficulty === null && confidence === null) return null;
  const i = impact ?? 50;
  const d = difficulty ?? 50;
  const c = confidence ?? 70;
  // Score 0..100. Prefer high impact + high confidence + low difficulty.
  return Math.round((i * c) / Math.max(d, 1));
}

export async function upsertProposedTasks(tasks: ProposedTask[]): Promise<{ inserted: number; updated: number; skipped: number }> {
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL not configured");
  await ensureBacklogSchema();
  let inserted = 0, updated = 0, skipped = 0;
  for (const task of tasks) {
    const signature = makeTaskSignature(task.domain, task.category, task.signature_key);
    const impact = clampScore(task.impact_score);
    const difficulty = clampScore(task.difficulty_score);
    const confidence = clampScore(task.confidence_score);
    const opportunity = computeOpportunityScore(impact, difficulty, confidence);
    const sourceType = task.source_type ?? "agent";

    const existing = await sql`
      select id, status from seo_backlog_tasks where task_signature = ${signature} limit 1
    ` as Array<{ id: number; status: string }>;
    if (existing.length === 0) {
      await sql`
        insert into seo_backlog_tasks
          (task_signature, title, description, domain, category, priority, impact_expected,
           rationale, data_sources, status, proposed_by, source_type,
           impact_score, difficulty_score, confidence_score, opportunity_score, assignee_suggested)
        values
          (${signature}, ${task.title}, ${task.description}, ${task.domain}, ${task.category}, ${task.priority},
           ${task.impact_expected ?? null}, ${task.rationale}, ${JSON.stringify(task.data_sources)}::jsonb,
           'pendiente', ${sourceType}, ${sourceType},
           ${impact}, ${difficulty}, ${confidence}, ${opportunity}, ${task.assignee_suggested ?? null})
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
          rationale = ${task.rationale},
          data_sources = ${JSON.stringify(task.data_sources)}::jsonb,
          source_type = ${sourceType},
          impact_score = ${impact},
          difficulty_score = ${difficulty},
          confidence_score = ${confidence},
          opportunity_score = ${opportunity},
          assignee_suggested = coalesce(${task.assignee_suggested ?? null}, assignee_suggested),
          updated_at = now()
      where id = ${row.id}
    `;
    updated++;
  }
  return { inserted, updated, skipped };
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
      impact_expected, rationale, data_sources, status, proposed_by, source_type,
      proposed_at::text, updated_at::text, closed_at::text, assignee, assignee_suggested, notes
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
      impact_expected, rationale, data_sources, status, proposed_by, source_type,
      proposed_at::text, updated_at::text, closed_at::text, assignee, assignee_suggested, notes
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

export async function listAgentRuns(limit: number = 20) {
  const sql = getSql();
  if (!sql) return [];
  await ensureBacklogSchema();
  return await sql`
    select id, started_at::text, ended_at::text, status, tasks_proposed, tasks_inserted, tasks_updated, tasks_skipped, cost_usd, stats, errors
    from seo_agent_runs order by started_at desc limit ${limit}
  `;
}
