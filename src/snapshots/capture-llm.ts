import { post } from "../dataforseo-client.js";
import { getPersistenceSql, ensurePersistenceSchema } from "../persistence-store.js";

const LOCATION_BY_COUNTRY: Record<string, number> = { co: 2170, mx: 2484 };

type Mention = {
  ai_search_volume?: number;
  mentions_count?: number;
  domain?: string;
  keyword?: string;
  top_sources?: unknown;
};

async function fetchMentions(target: { domain?: string; keyword?: string }, platform: "chat_gpt" | "google", locationCode: number): Promise<Mention> {
  const response = await post("/ai_optimization/llm_mentions/search/live", {
    target: [target],
    location_code: locationCode,
    language_code: "es",
    platform,
    limit: 1,
  }) as { tasks?: Array<{ status_code: number; result?: Array<{ items?: Mention[]; total_count?: number }> }> };
  const task = response.tasks?.[0];
  if (!task || task.status_code !== 20000) return {};
  const item = task.result?.[0]?.items?.[0] ?? {};
  return {
    ...item,
    mentions_count: task.result?.[0]?.total_count ?? item.mentions_count,
  };
}

export async function captureLlmVisibility(snapshotDate: string): Promise<{ ok: number; failed: number; errors: Array<{ target: string; error: string }> }> {
  const sql = getPersistenceSql();
  if (!sql) throw new Error("DATABASE_URL not configured");
  await ensurePersistenceSchema();

  const domains = await sql`select distinct domain, country_code from seo_keyword_universe where active = true` as Array<{ domain: string; country_code: string }>;
  const keywords = await sql`select distinct keyword, country_code from seo_keyword_universe where active = true and is_core = true` as Array<{ keyword: string; country_code: string }>;

  let ok = 0;
  const errors: Array<{ target: string; error: string }> = [];

  const platforms: Array<"chat_gpt" | "google"> = ["chat_gpt", "google"];

  for (const { domain, country_code } of domains) {
    for (const platform of platforms) {
      try {
        const data = await fetchMentions({ domain }, platform, LOCATION_BY_COUNTRY[country_code] ?? 2840);
        await sql`
          insert into seo_llm_visibility (snapshot_date, target_type, target_value, platform, mentions_count, ai_search_volume, top_sources)
          values (${snapshotDate}, 'domain', ${domain}, ${platform}, ${data.mentions_count ?? null}, ${data.ai_search_volume ?? null}, ${data.top_sources ? JSON.stringify(data.top_sources) : null}::jsonb)
        `;
        ok++;
      } catch (error) {
        errors.push({ target: `domain:${domain}:${platform}`, error: error instanceof Error ? error.message : "unknown" });
      }
    }
  }

  for (const { keyword, country_code } of keywords) {
    for (const platform of platforms) {
      try {
        const data = await fetchMentions({ keyword }, platform, LOCATION_BY_COUNTRY[country_code] ?? 2840);
        await sql`
          insert into seo_llm_visibility (snapshot_date, target_type, target_value, platform, mentions_count, ai_search_volume, top_sources)
          values (${snapshotDate}, 'keyword', ${keyword}, ${platform}, ${data.mentions_count ?? null}, ${data.ai_search_volume ?? null}, ${data.top_sources ? JSON.stringify(data.top_sources) : null}::jsonb)
        `;
        ok++;
      } catch (error) {
        errors.push({ target: `keyword:${keyword}:${platform}`, error: error instanceof Error ? error.message : "unknown" });
      }
    }
  }

  return { ok, failed: errors.length, errors };
}
