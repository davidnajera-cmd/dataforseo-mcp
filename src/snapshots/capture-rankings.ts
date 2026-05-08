import { post } from "../dataforseo-client.js";
import { getPersistenceSql, ensurePersistenceSchema, KeywordUniverseRow } from "../persistence-store.js";

const LOCATION_BY_COUNTRY: Record<string, number> = { co: 2170, mx: 2484 };

type RankingResult = {
  keyword_id: number;
  keyword: string;
  domain: string;
  position: number | null;
  url_ranking: string | null;
  search_volume: number | null;
  serp_features: Record<string, unknown> | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function fetchRanking(keyword: string, domain: string, countryCode: string): Promise<Omit<RankingResult, "keyword_id" | "keyword" | "domain">> {
  const locationCode = LOCATION_BY_COUNTRY[countryCode] ?? 2840;
  const response = await post("/serp/google/organic/live/advanced", {
    keyword,
    location_code: locationCode,
    language_code: countryCode === "mx" ? "es" : "es",
    depth: 100,
    device: "desktop",
  }) as { tasks?: Array<{ result?: Array<{ items?: unknown[]; keyword_data?: { keyword_info?: { search_volume?: number } } }> }> };

  const result = response.tasks?.[0]?.result?.[0];
  const items = (result?.items ?? []) as Array<Record<string, unknown>>;
  const search_volume = result?.keyword_data?.keyword_info?.search_volume ?? null;

  let position: number | null = null;
  let url_ranking: string | null = null;
  for (const item of items) {
    const itemDomain = String(item.domain ?? "").toLowerCase();
    if (itemDomain === domain.toLowerCase() || itemDomain.endsWith(`.${domain.toLowerCase()}`)) {
      const rank = Number(item.rank_absolute ?? item.rank_group ?? 0);
      if (rank && (position === null || rank < position)) {
        position = rank;
        url_ranking = String(item.url ?? item.relative_url ?? "");
      }
    }
  }

  const serp_features: Record<string, unknown> = {};
  for (const item of items) {
    const type = String(item.type ?? "");
    if (["featured_snippet", "ai_overview", "people_also_ask", "knowledge_graph", "video", "images"].includes(type)) {
      serp_features[type] = true;
    }
  }

  return { position, url_ranking, search_volume, serp_features: Object.keys(serp_features).length ? serp_features : null };
}

export async function captureRankings(scope: "core" | "non_core" | "all", snapshotDate: string): Promise<{ ok: number; failed: number; rows: RankingResult[]; errors: Array<{ keyword: string; error: string }> }> {
  const sql = getPersistenceSql();
  if (!sql) throw new Error("DATABASE_URL not configured");
  await ensurePersistenceSchema();

  const filter = scope === "core" ? sql`is_core = true` : scope === "non_core" ? sql`is_core = false` : sql`true`;
  const universe = await sql`
    select id, keyword, domain, country_code, is_core, intent, source, added_at, last_checked_at, active
    from seo_keyword_universe where active = true and ${filter}
  ` as KeywordUniverseRow[];

  const rows: RankingResult[] = [];
  const errors: Array<{ keyword: string; error: string }> = [];

  for (const kw of universe) {
    try {
      const ranking = await fetchRanking(kw.keyword, kw.domain, kw.country_code);
      const row: RankingResult = { keyword_id: kw.id, keyword: kw.keyword, domain: kw.domain, ...ranking };
      rows.push(row);
      await sql`
        insert into seo_keyword_rankings (snapshot_date, keyword_id, domain, position, url_ranking, search_volume, serp_features)
        values (${snapshotDate}, ${kw.id}, ${kw.domain}, ${row.position}, ${row.url_ranking}, ${row.search_volume}, ${row.serp_features ? JSON.stringify(row.serp_features) : null}::jsonb)
      `;
      await sql`update seo_keyword_universe set last_checked_at = now() where id = ${kw.id}`;
    } catch (error) {
      errors.push({ keyword: kw.keyword, error: error instanceof Error ? error.message : "unknown" });
    }
  }

  return { ok: rows.length, failed: errors.length, rows, errors };
}
