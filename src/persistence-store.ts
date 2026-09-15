import { neon } from "@neondatabase/serverless";

let client: ReturnType<typeof neon> | null = null;
let schemaReady = false;

export function getPersistenceSql() {
  if (!process.env.DATABASE_URL) return null;
  if (!client) client = neon(process.env.DATABASE_URL);
  return client;
}

export async function ensurePersistenceSchema(): Promise<void> {
  const sql = getPersistenceSql();
  if (!sql || schemaReady) return;

  await sql`
    create table if not exists seo_keyword_universe (
      id bigserial primary key,
      keyword text not null,
      domain text not null,
      country_code text not null,
      is_core boolean not null default false,
      intent text,
      source text not null default 'manual',
      added_at timestamptz not null default now(),
      last_checked_at timestamptz,
      active boolean not null default true,
      unique (keyword, domain, country_code)
    )
  `;
  await sql`create index if not exists seo_keyword_universe_lookup on seo_keyword_universe (domain, country_code, active, is_core)`;

  await sql`
    create table if not exists seo_keyword_rankings (
      id bigserial primary key,
      snapshot_date date not null,
      keyword_id bigint references seo_keyword_universe(id) on delete cascade,
      domain text not null,
      position numeric,
      url_ranking text,
      search_volume integer,
      serp_features jsonb,
      captured_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists seo_keyword_rankings_kw_date on seo_keyword_rankings (keyword_id, snapshot_date desc)`;
  await sql`create index if not exists seo_keyword_rankings_domain_date on seo_keyword_rankings (domain, snapshot_date desc)`;

  await sql`
    create table if not exists seo_backlink_snapshots (
      id bigserial primary key,
      snapshot_date date not null,
      domain text not null,
      total_backlinks integer,
      referring_domains integer,
      referring_main_domains integer,
      broken_backlinks integer,
      rank integer,
      spam_score integer,
      top_anchors jsonb,
      top_referring_domains jsonb,
      captured_at timestamptz not null default now(),
      unique (snapshot_date, domain)
    )
  `;
  await sql`create index if not exists seo_backlink_snapshots_domain_date on seo_backlink_snapshots (domain, snapshot_date desc)`;

  await sql`
    create table if not exists seo_llm_visibility (
      id bigserial primary key,
      snapshot_date date not null,
      target_type text not null,
      target_value text not null,
      platform text not null,
      mentions_count integer,
      ai_search_volume integer,
      top_sources jsonb,
      captured_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists seo_llm_visibility_target_date on seo_llm_visibility (target_value, snapshot_date desc)`;

  await sql`
    create table if not exists seo_traffic_daily (
      id bigserial primary key,
      date date not null,
      domain text not null,
      source text not null,
      clicks integer,
      impressions integer,
      ctr numeric,
      position numeric,
      sessions integer,
      organic_sessions integer,
      conversions integer,
      metrics_extra jsonb,
      captured_at timestamptz not null default now(),
      unique (date, domain, source)
    )
  `;
  await sql`create index if not exists seo_traffic_daily_domain_date on seo_traffic_daily (domain, date desc)`;

  await sql`
    create table if not exists seo_snapshot_runs (
      id bigserial primary key,
      run_kind text not null,
      started_at timestamptz not null default now(),
      ended_at timestamptz,
      status text not null default 'running',
      stats jsonb,
      errors jsonb
    )
  `;

  await sql`
    create table if not exists seo_web_leads (
      id bigserial primary key,
      external_id text,
      domain text,
      source_url text,
      utm_source text,
      utm_medium text,
      utm_campaign text,
      utm_content text,
      utm_term text,
      channel text,
      metadata jsonb,
      received_at timestamptz not null default now(),
      captured_at timestamptz not null default now()
    )
  `;
  await sql`create unique index if not exists seo_web_leads_external_id on seo_web_leads (external_id) where external_id is not null`;
  await sql`create index if not exists seo_web_leads_domain_date on seo_web_leads (domain, received_at desc)`;

  schemaReady = true;
}

export type KeywordUniverseRow = {
  id: number;
  keyword: string;
  domain: string;
  country_code: string;
  is_core: boolean;
  intent: string | null;
  source: string;
  added_at: string;
  last_checked_at: string | null;
  active: boolean;
};

export async function listKeywordUniverse(filters: {
  domain?: string;
  country_code?: string;
  is_core?: boolean;
  source?: string;
  active?: boolean;
} = {}): Promise<KeywordUniverseRow[]> {
  const sql = getPersistenceSql();
  if (!sql) throw new Error("DATABASE_URL not configured");
  await ensurePersistenceSchema();
  const rows = await sql`
    select id, keyword, domain, country_code, is_core, intent, source, added_at, last_checked_at, active
    from seo_keyword_universe
    where (${filters.domain ?? null}::text is null or domain = ${filters.domain ?? null})
      and (${filters.country_code ?? null}::text is null or country_code = ${filters.country_code ?? null})
      and (${filters.is_core ?? null}::boolean is null or is_core = ${filters.is_core ?? null})
      and (${filters.source ?? null}::text is null or source = ${filters.source ?? null})
      and (${filters.active ?? null}::boolean is null or active = ${filters.active ?? null})
    order by domain, country_code, is_core desc, keyword
  `;
  return rows as KeywordUniverseRow[];
}

export async function addKeywords(input: {
  keywords: string[];
  domain: string;
  country_code: string;
  is_core?: boolean;
  intent?: string;
  source?: string;
}): Promise<{ inserted: number; skipped: number }> {
  const sql = getPersistenceSql();
  if (!sql) throw new Error("DATABASE_URL not configured");
  await ensurePersistenceSchema();
  let inserted = 0;
  let skipped = 0;
  for (const keyword of input.keywords) {
    const trimmed = keyword.trim();
    if (!trimmed) continue;
    const result = await sql`
      insert into seo_keyword_universe (keyword, domain, country_code, is_core, intent, source)
      values (${trimmed}, ${input.domain}, ${input.country_code}, ${input.is_core ?? false}, ${input.intent ?? null}, ${input.source ?? "manual"})
      on conflict (keyword, domain, country_code) do nothing
      returning id
    ` as Array<{ id: number }>;
    if (result.length) inserted++;
    else skipped++;
  }
  return { inserted, skipped };
}

export async function removeKeyword(input: { id?: number; keyword?: string; domain?: string; country_code?: string }): Promise<number> {
  const sql = getPersistenceSql();
  if (!sql) throw new Error("DATABASE_URL not configured");
  await ensurePersistenceSchema();
  if (input.id) {
    const result = await sql`delete from seo_keyword_universe where id = ${input.id}` as { count?: number };
    return result.count ?? 0;
  }
  if (input.keyword && input.domain && input.country_code) {
    const result = await sql`
      delete from seo_keyword_universe
      where keyword = ${input.keyword} and domain = ${input.domain} and country_code = ${input.country_code}
    ` as { count?: number };
    return result.count ?? 0;
  }
  throw new Error("Provide either id, or keyword + domain + country_code");
}

export async function setKeywordCore(id: number, isCore: boolean): Promise<void> {
  const sql = getPersistenceSql();
  if (!sql) throw new Error("DATABASE_URL not configured");
  await ensurePersistenceSchema();
  await sql`update seo_keyword_universe set is_core = ${isCore} where id = ${id}`;
}

export async function setKeywordActive(id: number, active: boolean): Promise<void> {
  const sql = getPersistenceSql();
  if (!sql) throw new Error("DATABASE_URL not configured");
  await ensurePersistenceSchema();
  await sql`update seo_keyword_universe set active = ${active} where id = ${id}`;
}

export async function startSnapshotRun(runKind: string): Promise<number> {
  const sql = getPersistenceSql();
  if (!sql) throw new Error("DATABASE_URL not configured");
  await ensurePersistenceSchema();
  const rows = await sql`
    insert into seo_snapshot_runs (run_kind, status) values (${runKind}, 'running') returning id
  ` as Array<{ id: number }>;
  return rows[0].id;
}

export async function finishSnapshotRun(runId: number, status: string, stats: unknown, errors: unknown): Promise<void> {
  const sql = getPersistenceSql();
  if (!sql) return;
  await sql`
    update seo_snapshot_runs
    set ended_at = now(), status = ${status},
        stats = ${stats === undefined ? null : JSON.stringify(stats)}::jsonb,
        errors = ${errors === undefined || errors === null ? null : JSON.stringify(errors)}::jsonb
    where id = ${runId}
  `;
}

export type WebLeadInput = {
  external_id?: string | null;
  domain?: string | null;
  source_url?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  channel?: string | null;
  metadata?: unknown;
  received_at?: string | null;
};

// external_id is optional, but when Dream CRM sends one, retries (timeouts, at-least-once
// delivery) must not double-count the same lead — the partial unique index on external_id
// enforces that at the DB level; this just makes the insert idempotent against it.
export async function recordWebLead(lead: WebLeadInput): Promise<{ id: number; deduped: boolean }> {
  const sql = getPersistenceSql();
  if (!sql) throw new Error("DATABASE_URL not configured");
  await ensurePersistenceSchema();
  const receivedAt = lead.received_at ?? new Date().toISOString();
  const metadataJson = lead.metadata === undefined ? null : JSON.stringify(lead.metadata);
  const inserted = await sql`
    insert into seo_web_leads (
      external_id, domain, source_url, utm_source, utm_medium, utm_campaign, utm_content, utm_term, channel, metadata, received_at
    ) values (
      ${lead.external_id ?? null}, ${lead.domain ?? null}, ${lead.source_url ?? null},
      ${lead.utm_source ?? null}, ${lead.utm_medium ?? null}, ${lead.utm_campaign ?? null},
      ${lead.utm_content ?? null}, ${lead.utm_term ?? null}, ${lead.channel ?? null},
      ${metadataJson}::jsonb, ${receivedAt}
    )
    on conflict (external_id) where external_id is not null do nothing
    returning id
  ` as Array<{ id: number }>;
  if (inserted.length) return { id: inserted[0].id, deduped: false };
  if (lead.external_id) {
    const existing = await sql`select id from seo_web_leads where external_id = ${lead.external_id} limit 1` as Array<{ id: number }>;
    if (existing.length) return { id: existing[0].id, deduped: true };
  }
  throw new Error("Failed to insert web lead");
}

export type WebLeadStats = {
  total: number;
  byDomain: Array<{ domain: string; count: number }>;
  byUtmSource: Array<{ utmSource: string; count: number }>;
  byChannel: Array<{ channel: string; count: number }>;
  latestReceivedAt: string | null;
};

export async function getWebLeadStats(params: { domain?: string | null; startDate: string; endDate: string }): Promise<WebLeadStats> {
  const sql = getPersistenceSql();
  if (!sql) return { total: 0, byDomain: [], byUtmSource: [], byChannel: [], latestReceivedAt: null };
  await ensurePersistenceSchema();
  const domainFilter = params.domain ?? null;
  const rows = await sql`
    select domain, utm_source, channel, received_at::text as received_at
    from seo_web_leads
    where received_at::date >= ${params.startDate}::date and received_at::date <= ${params.endDate}::date
      and (${domainFilter}::text is null or domain = ${domainFilter})
    order by received_at desc
  ` as Array<{ domain: string | null; utm_source: string | null; channel: string | null; received_at: string }>;

  const byDomainMap = new Map<string, number>();
  const byUtmSourceMap = new Map<string, number>();
  const byChannelMap = new Map<string, number>();
  for (const row of rows) {
    const domainKey = row.domain ?? "Sin origen identificado";
    byDomainMap.set(domainKey, (byDomainMap.get(domainKey) ?? 0) + 1);
    const utmKey = row.utm_source ?? "Sin utm_source";
    byUtmSourceMap.set(utmKey, (byUtmSourceMap.get(utmKey) ?? 0) + 1);
    const channelKey = row.channel ?? "Sin canal especificado";
    byChannelMap.set(channelKey, (byChannelMap.get(channelKey) ?? 0) + 1);
  }

  return {
    total: rows.length,
    byDomain: [...byDomainMap.entries()].map(([domain, count]) => ({ domain, count })).sort((a, b) => b.count - a.count),
    byUtmSource: [...byUtmSourceMap.entries()].map(([utmSource, count]) => ({ utmSource, count })).sort((a, b) => b.count - a.count),
    byChannel: [...byChannelMap.entries()].map(([channel, count]) => ({ channel, count })).sort((a, b) => b.count - a.count),
    latestReceivedAt: rows[0]?.received_at ?? null,
  };
}

export async function hasAnyWebLeads(): Promise<boolean> {
  const sql = getPersistenceSql();
  if (!sql) return false;
  await ensurePersistenceSchema();
  const rows = await sql`select 1 from seo_web_leads limit 1` as Array<{ "?column?": number }>;
  return rows.length > 0;
}

export type SnapshotRunHealth = {
  lastRunAt: string | null;
  lastRunStatus: string | null;
  hoursSinceLastRun: number | null;
  healthy: boolean;
  note: string;
};

// Surfaces cron health for the dashboard UI so a stalled/misauthenticated pipeline
// (like the CRON_SECRET mismatch that silently broke every run for months) shows up
// on screen instead of only being visible to whoever thinks to query Postgres.
export async function getSnapshotRunHealth(): Promise<SnapshotRunHealth> {
  const sql = getPersistenceSql();
  if (!sql) return { lastRunAt: null, lastRunStatus: null, hoursSinceLastRun: null, healthy: false, note: "DATABASE_URL no configurado." };
  await ensurePersistenceSchema();
  const rows = await sql`
    select started_at, status from seo_snapshot_runs order by started_at desc limit 1
  ` as Array<{ started_at: Date; status: string }>;
  if (!rows.length) {
    return { lastRunAt: null, lastRunStatus: null, hoursSinceLastRun: null, healthy: false, note: "El cron de snapshots nunca ha corrido." };
  }
  const lastRunAt = rows[0].started_at;
  const hoursSince = (Date.now() - new Date(lastRunAt).getTime()) / 3_600_000;
  // The daily task runs once every ~24h; call it unhealthy past 48h so a missed
  // run doesn't false-positive, but a genuinely stalled cron still gets flagged.
  const healthy = hoursSince <= 48 && rows[0].status !== "failed";
  return {
    lastRunAt: new Date(lastRunAt).toISOString(),
    lastRunStatus: rows[0].status,
    hoursSinceLastRun: Math.round(hoursSince),
    healthy,
    note: healthy
      ? "El cron de snapshots corrio recientemente."
      : `El cron de snapshots no corre hace ${Math.round(hoursSince)}h (ultimo estado: ${rows[0].status}). Revisar CRON_SECRET y logs de Vercel.`,
  };
}

// =====================================================================
// Read helpers used by the dashboard. All return [] / null when DB empty
// so callers can fall back to live API calls without special-casing nulls.
// =====================================================================

export type TrafficRow = {
  date: string;
  domain: string;
  source: "gsc" | "ga4";
  clicks: number | null;
  impressions: number | null;
  ctr: number | null;
  position: number | null;
  sessions: number | null;
  organic_sessions: number | null;
  conversions: number | null;
};

export async function getLatestTrafficSnapshot(domain: string, source: "gsc" | "ga4"): Promise<TrafficRow | null> {
  const sql = getPersistenceSql();
  if (!sql) return null;
  await ensurePersistenceSchema();
  const rows = await sql`
    select date::text, domain, source, clicks, impressions, ctr, position, sessions, organic_sessions, conversions
    from seo_traffic_daily where domain = ${domain} and source = ${source}
    order by date desc limit 1
  ` as TrafficRow[];
  return rows[0] ?? null;
}

export async function getTrafficTrend(domain: string, source: "gsc" | "ga4", days: number = 30): Promise<TrafficRow[]> {
  const sql = getPersistenceSql();
  if (!sql) return [];
  await ensurePersistenceSchema();
  const start = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  return await sql`
    select date::text, domain, source, clicks, impressions, ctr, position, sessions, organic_sessions, conversions
    from seo_traffic_daily where domain = ${domain} and source = ${source} and date >= ${start}
    order by date asc
  ` as TrafficRow[];
}

export type DomainRankingsSnapshot = {
  snapshot_date: string;
  domain: string;
  total_tracked: number;
  top3: number;
  top10: number;
  top100: number;
  avg_position: number | null;
};

export async function getLatestDomainRankings(domain: string): Promise<DomainRankingsSnapshot | null> {
  const sql = getPersistenceSql();
  if (!sql) return null;
  await ensurePersistenceSchema();
  const rows = await sql`
    select snapshot_date::text, domain,
      count(*)::int as total_tracked,
      count(*) filter (where position is not null and position <= 3)::int as top3,
      count(*) filter (where position is not null and position <= 10)::int as top10,
      count(*) filter (where position is not null and position <= 100)::int as top100,
      round(avg(position) filter (where position is not null), 2)::float as avg_position
    from seo_keyword_rankings where domain = ${domain}
    group by snapshot_date, domain
    order by snapshot_date desc limit 1
  ` as DomainRankingsSnapshot[];
  return rows[0] ?? null;
}

export type BacklinksSnapshot = {
  snapshot_date: string;
  domain: string;
  total_backlinks: number | null;
  referring_domains: number | null;
  referring_main_domains: number | null;
  broken_backlinks: number | null;
  rank: number | null;
  spam_score: number | null;
};

export async function getLatestBacklinks(domain: string): Promise<BacklinksSnapshot | null> {
  const sql = getPersistenceSql();
  if (!sql) return null;
  await ensurePersistenceSchema();
  const rows = await sql`
    select snapshot_date::text, domain, total_backlinks, referring_domains, referring_main_domains, broken_backlinks, rank, spam_score
    from seo_backlink_snapshots where domain = ${domain}
    order by snapshot_date desc limit 1
  ` as BacklinksSnapshot[];
  return rows[0] ?? null;
}

export async function getBacklinksTrend(domain: string, weeks: number = 12): Promise<BacklinksSnapshot[]> {
  const sql = getPersistenceSql();
  if (!sql) return [];
  await ensurePersistenceSchema();
  const start = new Date(Date.now() - weeks * 7 * 86400_000).toISOString().slice(0, 10);
  return await sql`
    select snapshot_date::text, domain, total_backlinks, referring_domains, referring_main_domains, broken_backlinks, rank, spam_score
    from seo_backlink_snapshots where domain = ${domain} and snapshot_date >= ${start}
    order by snapshot_date asc
  ` as BacklinksSnapshot[];
}

export type LlmVisibilityRow = {
  snapshot_date: string;
  target_type: string;
  target_value: string;
  platform: string;
  mentions_count: number | null;
  ai_search_volume: number | null;
};

export async function getLatestLlmVisibility(targetValue: string, targetType: string = "domain"): Promise<LlmVisibilityRow[]> {
  const sql = getPersistenceSql();
  if (!sql) return [];
  await ensurePersistenceSchema();
  return await sql`
    select snapshot_date::text, target_type, target_value, platform, mentions_count, ai_search_volume
    from seo_llm_visibility
    where target_value = ${targetValue} and target_type = ${targetType}
      and snapshot_date = (select max(snapshot_date) from seo_llm_visibility where target_value = ${targetValue} and target_type = ${targetType})
  ` as LlmVisibilityRow[];
}
