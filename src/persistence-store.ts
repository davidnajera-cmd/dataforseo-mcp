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
