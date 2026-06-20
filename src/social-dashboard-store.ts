import { neon } from "@neondatabase/serverless";
import type { DashboardFilters } from "./dashboard-data.js";
import type { SocialDashboardData } from "./social-dashboard-data.js";

let client: ReturnType<typeof neon> | null = null;
let initialized = false;

function getSql() {
  if (!process.env.DATABASE_URL) return null;
  if (!client) client = neon(process.env.DATABASE_URL);
  return client;
}

export async function saveSocialDashboardSnapshot(data: SocialDashboardData): Promise<boolean> {
  const sql = getSql();
  if (!sql) return false;

  await ensureSchema();
  await sql`
    insert into social_dashboard_snapshots (
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

export async function getLatestSocialDashboardSnapshot(filters: DashboardFilters, maxAgeMinutes = 720): Promise<SocialDashboardData | null> {
  const sql = getSql();
  if (!sql) return null;

  await ensureSchema();
  const rows = await sql`
    select payload, generated_at
    from social_dashboard_snapshots
    where country = ${filters.country}
      and timeframe = ${filters.timeframe}
      and channel = ${filters.channel}
      and start_date = ${filters.startDate}
      and end_date = ${filters.endDate}
    order by generated_at desc, created_at desc
    limit 1
  ` as Array<{ payload: SocialDashboardData; generated_at: string }>;

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
    create table if not exists social_dashboard_snapshots (
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
    create index if not exists social_dashboard_snapshots_lookup_idx
    on social_dashboard_snapshots (country, timeframe, channel, created_at desc)
  `;

  initialized = true;
}
