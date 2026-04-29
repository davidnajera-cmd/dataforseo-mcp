import { neon } from "@neondatabase/serverless";
import type { DashboardFilters, SeoDashboardData } from "./dashboard-data.js";

let client: ReturnType<typeof neon> | null = null;
let initialized = false;

function getSql() {
  if (!process.env.DATABASE_URL) return null;
  if (!client) client = neon(process.env.DATABASE_URL);
  return client;
}

export async function saveDashboardSnapshot(data: SeoDashboardData): Promise<boolean> {
  const sql = getSql();
  if (!sql) return false;

  await ensureSchema();
  await sql`
    insert into seo_dashboard_snapshots (
      country,
      timeframe,
      channel,
      start_date,
      end_date,
      generated_at,
      payload
    ) values (
      ${data.filters.country},
      ${data.filters.timeframe},
      ${data.filters.channel},
      ${data.filters.startDate},
      ${data.filters.endDate},
      ${data.generatedAt},
      ${JSON.stringify(data)}::jsonb
    )
  `;
  return true;
}

export async function listDashboardSnapshots(filters: Partial<DashboardFilters>, limit = 20) {
  const sql = getSql();
  if (!sql) return [];

  await ensureSchema();
  const rows = await sql`
    select
      id,
      country,
      timeframe,
      channel,
      start_date,
      end_date,
      generated_at,
      created_at,
      payload
    from seo_dashboard_snapshots
    where (${filters.country ?? null}::text is null or country = ${filters.country ?? null})
      and (${filters.timeframe ?? null}::text is null or timeframe = ${filters.timeframe ?? null})
      and (${filters.channel ?? null}::text is null or channel = ${filters.channel ?? null})
    order by created_at desc
    limit ${limit}
  `;

  return rows;
}

async function ensureSchema() {
  const sql = getSql();
  if (!sql || initialized) return;

  await sql`
    create table if not exists seo_dashboard_snapshots (
      id bigserial primary key,
      country text not null,
      timeframe text not null,
      channel text not null,
      start_date date not null,
      end_date date not null,
      generated_at timestamptz not null,
      payload jsonb not null,
      created_at timestamptz not null default now()
    )
  `;

  await sql`
    create index if not exists seo_dashboard_snapshots_lookup_idx
    on seo_dashboard_snapshots (country, timeframe, channel, created_at desc)
  `;

  initialized = true;
}
