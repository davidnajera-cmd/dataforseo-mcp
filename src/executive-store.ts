import { neon } from "@neondatabase/serverless";
import type { DashboardFilters } from "./dashboard-data.js";

let client: ReturnType<typeof neon> | null = null;
let initialized = false;

function getSql() {
  if (!process.env.DATABASE_URL) return null;
  if (!client) client = neon(process.env.DATABASE_URL);
  return client;
}

export type ExecutiveSnapshotPayload = {
  generatedAt: string;
  baselines: Array<{
    label: string;
    current: string;
    baseline: string;
    delta: string;
    tone: string;
  }>;
  anomalies: Array<{
    scope: string;
    severity: string;
    title: string;
    reason: string;
    action: string;
  }>;
};

export async function saveExecutiveSnapshot(filters: DashboardFilters, payload: ExecutiveSnapshotPayload): Promise<boolean> {
  const sql = getSql();
  if (!sql) return false;
  await ensureSchema();
  const snapshotDate = payload.generatedAt.slice(0, 10);
  await sql`
    insert into executive_overview_snapshots (
      country, timeframe, channel, start_date, end_date, snapshot_date, generated_at, payload
    ) values (
      ${filters.country},
      ${filters.timeframe},
      ${filters.channel},
      ${filters.startDate},
      ${filters.endDate},
      ${snapshotDate},
      ${payload.generatedAt},
      ${JSON.stringify(payload)}::jsonb
    )
    on conflict (country, timeframe, channel, start_date, end_date, snapshot_date)
    do update set
      generated_at = excluded.generated_at,
      payload = excluded.payload,
      created_at = now()
  `;
  return true;
}

export async function listExecutiveSnapshots(filters: Partial<DashboardFilters>, limit = 12) {
  const sql = getSql();
  if (!sql) return [];
  await ensureSchema();
  return sql`
    select
      id,
      country,
      timeframe,
      channel,
      start_date,
      end_date,
      snapshot_date::text,
      generated_at,
      created_at,
      payload
    from executive_overview_snapshots
    where (${filters.country ?? null}::text is null or country = ${filters.country ?? null})
      and (${filters.timeframe ?? null}::text is null or timeframe = ${filters.timeframe ?? null})
      and (${filters.channel ?? null}::text is null or channel = ${filters.channel ?? null})
    order by snapshot_date desc, created_at desc
    limit ${limit}
  `;
}

async function ensureSchema() {
  const sql = getSql();
  if (!sql || initialized) return;
  await sql`
    create table if not exists executive_overview_snapshots (
      id bigserial primary key,
      country text not null,
      timeframe text not null,
      channel text not null,
      start_date date not null,
      end_date date not null,
      snapshot_date date not null,
      generated_at timestamptz not null,
      payload jsonb not null,
      created_at timestamptz not null default now(),
      unique (country, timeframe, channel, start_date, end_date, snapshot_date)
    )
  `;
  await sql`
    create index if not exists executive_overview_snapshots_lookup_idx
    on executive_overview_snapshots (country, timeframe, channel, snapshot_date desc)
  `;
  initialized = true;
}
