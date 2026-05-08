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
  | "link-building" | "ai-optimization" | "schema" | "sitemap";

export type BacklogTask = {
  id: number;
  task_signature: string;
  title: string;
  description: string;
  domain: string;
  category: BacklogCategory;
  priority: BacklogPriority;
  impact_expected: string | null;
  rationale: string;
  data_sources: unknown;
  status: BacklogStatus;
  proposed_by: string;
  proposed_at: string;
  updated_at: string;
  closed_at: string | null;
  assignee: string | null;
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
  await sql`create index if not exists seo_backlog_lookup on seo_backlog_tasks (domain, status, priority)`;
  await sql`create index if not exists seo_backlog_proposed on seo_backlog_tasks (proposed_at desc)`;

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
};

export async function upsertProposedTasks(tasks: ProposedTask[]): Promise<{ inserted: number; updated: number; skipped: number }> {
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL not configured");
  await ensureBacklogSchema();
  let inserted = 0, updated = 0, skipped = 0;
  for (const task of tasks) {
    const signature = makeTaskSignature(task.domain, task.category, task.signature_key);
    // Check if task with this signature already exists and what status
    const existing = await sql`
      select id, status from seo_backlog_tasks where task_signature = ${signature} limit 1
    ` as Array<{ id: number; status: string }>;
    if (existing.length === 0) {
      await sql`
        insert into seo_backlog_tasks
          (task_signature, title, description, domain, category, priority, impact_expected, rationale, data_sources, status, proposed_by)
        values
          (${signature}, ${task.title}, ${task.description}, ${task.domain}, ${task.category}, ${task.priority},
           ${task.impact_expected ?? null}, ${task.rationale}, ${JSON.stringify(task.data_sources)}::jsonb,
           'pendiente', 'agent')
      `;
      inserted++;
      continue;
    }
    const row = existing[0];
    if (row.status === "ejecutada" || row.status === "descartada") {
      skipped++;
      continue;
    }
    // Update content (priority/rationale/evidence may change as data evolves)
    await sql`
      update seo_backlog_tasks
      set title = ${task.title},
          description = ${task.description},
          priority = ${task.priority},
          impact_expected = ${task.impact_expected ?? null},
          rationale = ${task.rationale},
          data_sources = ${JSON.stringify(task.data_sources)}::jsonb,
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
  limit?: number;
};

export async function listBacklog(filters: BacklogFilters = {}): Promise<BacklogTask[]> {
  const sql = getSql();
  if (!sql) return [];
  await ensureBacklogSchema();
  return await sql`
    select id, task_signature, title, description, domain, category, priority, impact_expected,
      rationale, data_sources, status, proposed_by,
      proposed_at::text, updated_at::text, closed_at::text, assignee, notes
    from seo_backlog_tasks
    where (${filters.domain ?? null}::text is null or domain = ${filters.domain ?? null})
      and (${filters.status ?? null}::text is null or status = ${filters.status ?? null})
      and (${filters.priority ?? null}::text is null or priority = ${filters.priority ?? null})
      and (${filters.category ?? null}::text is null or category = ${filters.category ?? null})
    order by
      case priority when 'alta' then 1 when 'media' then 2 else 3 end,
      proposed_at desc
    limit ${filters.limit ?? 200}
  ` as BacklogTask[];
}

export async function getBacklogTask(id: number): Promise<BacklogTask | null> {
  const sql = getSql();
  if (!sql) return null;
  await ensureBacklogSchema();
  const rows = await sql`
    select id, task_signature, title, description, domain, category, priority, impact_expected,
      rationale, data_sources, status, proposed_by,
      proposed_at::text, updated_at::text, closed_at::text, assignee, notes
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
