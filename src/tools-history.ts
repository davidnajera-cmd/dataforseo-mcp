import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  ensurePersistenceSchema,
  getPersistenceSql,
  listKeywordUniverse,
  addKeywords,
  removeKeyword,
  setKeywordCore,
  setKeywordActive,
} from "./persistence-store.js";
import { runSnapshot, SnapshotTask } from "./snapshots/index.js";

function formatResult(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
}

export function registerHistoryTools(server: McpServer) {
  // Keyword universe management

  server.tool(
    "keyword_universe_list",
    "List keywords being tracked for historical SEO snapshots. Filter by domain, country, core flag, source.",
    {
      domain: z.string().optional(),
      country_code: z.string().optional().describe("co | mx"),
      is_core: z.boolean().optional(),
      source: z.string().optional().describe("manual | auto_gsc"),
      active_only: z.boolean().optional().describe("If true (default), only return active keywords"),
    },
    async ({ domain, country_code, is_core, source, active_only }) => {
      const rows = await listKeywordUniverse({
        domain,
        country_code,
        is_core,
        source,
        active: active_only !== false ? true : undefined,
      });
      return { content: [{ type: "text" as const, text: formatResult({ total: rows.length, rows }) }] };
    }
  );

  server.tool(
    "keyword_universe_add",
    "Add keywords to the tracked universe. Idempotent (skips duplicates by keyword+domain+country).",
    {
      keywords: z.array(z.string()).min(1),
      domain: z.string().describe("Target domain, e.g. dnamusic.edu.co"),
      country_code: z.string().describe("co | mx"),
      is_core: z.boolean().optional().describe("Daily SERP check (default false = weekly)"),
      intent: z.string().optional(),
    },
    async ({ keywords, domain, country_code, is_core, intent }) => {
      const result = await addKeywords({ keywords, domain, country_code, is_core, intent, source: "manual" });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "keyword_universe_remove",
    "Remove a keyword from tracking. Pass either id, or keyword+domain+country_code.",
    {
      id: z.number().int().optional(),
      keyword: z.string().optional(),
      domain: z.string().optional(),
      country_code: z.string().optional(),
    },
    async ({ id, keyword, domain, country_code }) => {
      const removed = await removeKeyword({ id, keyword, domain, country_code });
      return { content: [{ type: "text" as const, text: formatResult({ removed }) }] };
    }
  );

  server.tool(
    "keyword_universe_set_core",
    "Toggle is_core flag for a keyword. Core keywords are checked daily; non-core weekly.",
    {
      id: z.number().int(),
      is_core: z.boolean(),
    },
    async ({ id, is_core }) => {
      await setKeywordCore(id, is_core);
      return { content: [{ type: "text" as const, text: formatResult({ ok: true, id, is_core }) }] };
    }
  );

  server.tool(
    "keyword_universe_set_active",
    "Activate or deactivate tracking for a keyword without deleting it (preserves history).",
    {
      id: z.number().int(),
      active: z.boolean(),
    },
    async ({ id, active }) => {
      await setKeywordActive(id, active);
      return { content: [{ type: "text" as const, text: formatResult({ ok: true, id, active }) }] };
    }
  );

  // History queries

  server.tool(
    "history_keyword_ranking",
    "Time series of a keyword's ranking position for a domain. Returns daily snapshots when available.",
    {
      keyword: z.string(),
      domain: z.string(),
      country_code: z.string().optional().describe("co | mx; if omitted, returns all"),
      days: z.number().int().positive().max(365).optional().describe("Default 30"),
    },
    async ({ keyword, domain, country_code, days }) => {
      const sql = getPersistenceSql();
      if (!sql) throw new Error("DATABASE_URL not configured");
      await ensurePersistenceSchema();
      const start = daysAgoIso(days ?? 30);
      const rows = await sql`
        select r.snapshot_date, r.position, r.url_ranking, r.search_volume, r.serp_features, k.country_code, k.is_core
        from seo_keyword_rankings r
        join seo_keyword_universe k on k.id = r.keyword_id
        where k.keyword = ${keyword} and k.domain = ${domain}
          and (${country_code ?? null}::text is null or k.country_code = ${country_code ?? null})
          and r.snapshot_date >= ${start}
        order by r.snapshot_date asc
      ` as Array<Record<string, unknown>>;
      return { content: [{ type: "text" as const, text: formatResult({ keyword, domain, country_code: country_code ?? "all", points: rows.length, series: rows }) }] };
    }
  );

  server.tool(
    "history_domain_rankings",
    "Aggregate ranking history for a domain: average position, count in top 3 / 10 / 100 over time. Useful to see overall SEO health trend.",
    {
      domain: z.string(),
      days: z.number().int().positive().max(365).optional(),
    },
    async ({ domain, days }) => {
      const sql = getPersistenceSql();
      if (!sql) throw new Error("DATABASE_URL not configured");
      await ensurePersistenceSchema();
      const start = daysAgoIso(days ?? 30);
      const rows = await sql`
        select snapshot_date,
          count(*) filter (where position is not null and position <= 3)::int as top3,
          count(*) filter (where position is not null and position <= 10)::int as top10,
          count(*) filter (where position is not null and position <= 100)::int as top100,
          count(*)::int as total_tracked,
          round(avg(position) filter (where position is not null), 2) as avg_position
        from seo_keyword_rankings
        where domain = ${domain} and snapshot_date >= ${start}
        group by snapshot_date order by snapshot_date asc
      `;
      return { content: [{ type: "text" as const, text: formatResult({ domain, days: days ?? 30, series: rows }) }] };
    }
  );

  server.tool(
    "history_backlinks",
    "Weekly backlinks history for a domain.",
    {
      domain: z.string(),
      weeks: z.number().int().positive().max(104).optional().describe("Default 12"),
    },
    async ({ domain, weeks }) => {
      const sql = getPersistenceSql();
      if (!sql) throw new Error("DATABASE_URL not configured");
      await ensurePersistenceSchema();
      const start = daysAgoIso((weeks ?? 12) * 7);
      const rows = await sql`
        select snapshot_date, total_backlinks, referring_domains, referring_main_domains, broken_backlinks, rank, spam_score
        from seo_backlink_snapshots
        where domain = ${domain} and snapshot_date >= ${start}
        order by snapshot_date asc
      `;
      return { content: [{ type: "text" as const, text: formatResult({ domain, weeks: weeks ?? 12, series: rows }) }] };
    }
  );

  server.tool(
    "history_llm_visibility",
    "Weekly LLM visibility history for a domain or keyword.",
    {
      target_value: z.string().describe("Domain or keyword that was tracked"),
      target_type: z.enum(["domain", "keyword"]).optional(),
      weeks: z.number().int().positive().max(104).optional(),
    },
    async ({ target_value, target_type, weeks }) => {
      const sql = getPersistenceSql();
      if (!sql) throw new Error("DATABASE_URL not configured");
      await ensurePersistenceSchema();
      const start = daysAgoIso((weeks ?? 12) * 7);
      const rows = await sql`
        select snapshot_date, target_type, target_value, platform, mentions_count, ai_search_volume
        from seo_llm_visibility
        where target_value = ${target_value}
          and (${target_type ?? null}::text is null or target_type = ${target_type ?? null})
          and snapshot_date >= ${start}
        order by snapshot_date asc, platform
      `;
      return { content: [{ type: "text" as const, text: formatResult({ target_value, weeks: weeks ?? 12, series: rows }) }] };
    }
  );

  server.tool(
    "history_traffic",
    "Daily traffic history for a domain (clicks/impressions from GSC, sessions/conversions from GA4).",
    {
      domain: z.string(),
      days: z.number().int().positive().max(365).optional(),
      source: z.enum(["gsc", "ga4"]).optional().describe("Filter to one source"),
    },
    async ({ domain, days, source }) => {
      const sql = getPersistenceSql();
      if (!sql) throw new Error("DATABASE_URL not configured");
      await ensurePersistenceSchema();
      const start = daysAgoIso(days ?? 30);
      const rows = await sql`
        select date, source, clicks, impressions, ctr, position, sessions, organic_sessions, conversions
        from seo_traffic_daily
        where domain = ${domain} and date >= ${start}
          and (${source ?? null}::text is null or source = ${source ?? null})
        order by date asc, source
      `;
      return { content: [{ type: "text" as const, text: formatResult({ domain, days: days ?? 30, series: rows }) }] };
    }
  );

  server.tool(
    "snapshot_run_now",
    "Manually trigger a snapshot capture (rather than waiting for the daily cron). Useful for testing or backfilling a single date. Skipping snapshot_date defaults to today UTC.",
    {
      tasks: z.array(z.enum(["rankings_core", "rankings_full", "backlinks", "llm", "traffic", "auto_expand", "all"])).min(1),
      snapshot_date: z.string().optional().describe("YYYY-MM-DD; defaults to today UTC"),
    },
    async ({ tasks, snapshot_date }) => {
      const result = await runSnapshot(tasks as SnapshotTask[], snapshot_date);
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "snapshot_runs_list",
    "List recent snapshot runs with their status, stats and errors. Useful to debug the cron pipeline.",
    {
      limit: z.number().int().positive().max(100).optional(),
    },
    async ({ limit }) => {
      const sql = getPersistenceSql();
      if (!sql) throw new Error("DATABASE_URL not configured");
      await ensurePersistenceSchema();
      const rows = await sql`
        select id, run_kind, started_at, ended_at, status, stats, errors
        from seo_snapshot_runs
        order by started_at desc
        limit ${limit ?? 20}
      `;
      return { content: [{ type: "text" as const, text: formatResult({ runs: rows }) }] };
    }
  );
}
