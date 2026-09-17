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

export async function getLatestDashboardSnapshot(filters: DashboardFilters, maxAgeMinutes = 720): Promise<SeoDashboardData | null> {
  const sql = getSql();
  if (!sql) return null;

  await ensureSchema();
  const rows = await sql`
    select payload, generated_at
    from seo_dashboard_snapshots
    where country = ${filters.country}
      and timeframe = ${filters.timeframe}
      and channel = ${filters.channel}
      and start_date = ${filters.startDate}
      and end_date = ${filters.endDate}
    order by generated_at desc, created_at desc
    limit 1
  ` as Array<{ payload: SeoDashboardData; generated_at: string }>;

  const row = rows[0];
  if (!row) return null;
  const ageMs = Date.now() - new Date(row.generated_at).getTime();
  if (!Number.isFinite(ageMs) || ageMs > maxAgeMinutes * 60_000) return null;
  return row.payload;
}

// The default date range rolls forward every day. A strict date lookup would
// discard a healthy snapshot from yesterday and force the dashboard to wait on
// every live provider before it can render. Keep the cadence, site and channel
// fixed, but permit a recent prior range as a safe operational fallback.
export async function getLatestCompatibleDashboardSnapshot(filters: DashboardFilters, maxAgeMinutes = 7 * 24 * 60): Promise<SeoDashboardData | null> {
  const sql = getSql();
  if (!sql) return null;

  await ensureSchema();
  const rows = await sql`
    select payload, generated_at
    from seo_dashboard_snapshots
    where country = ${filters.country}
      and timeframe = ${filters.timeframe}
      and channel = ${filters.channel}
    order by generated_at desc, created_at desc
    limit 1
  ` as Array<{ payload: SeoDashboardData; generated_at: string }>;

  const row = rows[0];
  if (!row) return null;
  const ageMs = Date.now() - new Date(row.generated_at).getTime();
  if (!Number.isFinite(ageMs) || ageMs > maxAgeMinutes * 60_000) return null;
  return row.payload;
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
