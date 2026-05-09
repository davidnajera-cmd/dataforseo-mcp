import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { post, get } from "./dataforseo-client.js";
import { gscPost } from "./gsc-client.js";
import { ahrefsRequest, semrushRequest } from "./premium-seo-client.js";

function formatResult(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export function registerSeoWorkflowTools(server: McpServer) {
  // gsc_url_bulk_inspection moved to tools-gsc.ts with a richer response shape;
  // do not register here to avoid duplicate-tool runtime error.

  server.tool(
    "gsc_low_ctr_opportunities",
    "Find high-impression pages or queries with low CTR in Search Console.",
    {
      site_url: z.string(),
      start_date: z.string(),
      end_date: z.string(),
      dimension: z.enum(["page", "query"]).optional(),
      min_impressions: z.number().optional(),
      max_ctr: z.number().optional().describe("CTR as decimal, e.g. 0.025 for 2.5%"),
      row_limit: z.number().optional(),
    },
    async ({ site_url, start_date, end_date, dimension, min_impressions, max_ctr, row_limit }) => {
      const result = await gscPost(`/sites/${encodeURIComponent(site_url)}/searchAnalytics/query`, {
        startDate: start_date,
        endDate: end_date,
        dimensions: [dimension ?? "page"],
        rowLimit: row_limit ?? 5000,
        type: "web",
      });
      const rows = Array.isArray((result as any).rows) ? (result as any).rows : [];
      const opportunities = rows
        .filter((row: any) => Number(row.impressions ?? 0) >= (min_impressions ?? 500) && Number(row.ctr ?? 0) <= (max_ctr ?? 0.025))
        .map((row: any) => ({
          key: row.keys?.[0],
          clicks: row.clicks,
          impressions: row.impressions,
          ctr: row.ctr,
          position: row.position,
          action: "Revisar title/meta, ajustar intencion y agregar enlaces internos hacia la pagina.",
        }))
        .sort((a: any, b: any) => b.impressions - a.impressions);
      return { content: [{ type: "text" as const, text: formatResult({ total: opportunities.length, opportunities }) }] };
    }
  );

  server.tool(
    "keyword_cluster_builder",
    "Build keyword clusters with intent using DataForSEO Labs keyword ideas and search intent.",
    {
      seed_keyword: z.string(),
      location_code: z.number().optional(),
      language_code: z.string().optional(),
      limit: z.number().optional(),
    },
    async ({ seed_keyword, location_code, language_code, limit }) => {
      const location = location_code ?? 2170;
      const language = language_code ?? "es";
      const ideas = await post("/dataforseo_labs/google/keyword_ideas/live", {
        keyword: seed_keyword,
        location_code: location,
        language_code: language,
        limit: limit ?? 100,
      });
      const keywords = extractKeywords(ideas).slice(0, limit ?? 100);
      const intent = keywords.length
        ? await post("/dataforseo_labs/google/search_intent/live", { keywords, location_code: location, language_code: language })
        : null;
      return { content: [{ type: "text" as const, text: formatResult({ seed_keyword, keywords, intent, suggested_clusters: buildSimpleClusters(keywords) }) }] };
    }
  );

  server.tool(
    "competitor_domain_gap",
    "Find keyword overlap/gaps between DNA Music and competitors using DataForSEO Labs domain intersection.",
    {
      domain: z.string(),
      competitors: z.array(z.string()).min(1).max(4),
      location_code: z.number().optional(),
      language_code: z.string().optional(),
      limit: z.number().optional(),
    },
    async ({ domain, competitors, location_code, language_code, limit }) => {
      const targets: Record<string, string> = { "1": domain };
      competitors.forEach((competitor, index) => { targets[String(index + 2)] = competitor; });
      const result = await post("/dataforseo_labs/google/domain_intersection/live", {
        targets,
        location_code: location_code ?? 2170,
        language_code: language_code ?? "es",
        limit: limit ?? 100,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "onpage_full_crawl_sync",
    "Run a full DataForSEO OnPage crawl synchronously: posts the task, polls until ready or timeout, and returns summary plus pages. If the task doesn't finish in time, returns the task_id so the caller can fetch results later via onpage_summary / onpage_pages.",
    {
      target: z.string().describe("URL to crawl, e.g. https://www.dnamusic.edu.co/"),
      max_crawl_pages: z.number().int().positive().max(2000).optional().describe("Max pages (default 200)"),
      enable_javascript: z.boolean().optional(),
      max_wait_seconds: z.number().int().positive().max(600).optional().describe("Polling timeout in seconds (default 300, max 600)"),
      poll_interval_seconds: z.number().int().positive().max(60).optional().describe("Seconds between polls (default 20)"),
      pages_limit: z.number().int().positive().max(1000).optional().describe("How many pages to return (default 200)"),
    },
    async ({ target, max_crawl_pages, enable_javascript, max_wait_seconds, poll_interval_seconds, pages_limit }) => {
      const taskRaw = await post("/on_page/task_post", {
        target,
        max_crawl_pages: max_crawl_pages ?? 200,
        enable_javascript: enable_javascript ?? false,
      }) as { tasks?: Array<{ id?: string; status_message?: string }> };
      const taskId = taskRaw.tasks?.[0]?.id;
      if (!taskId) {
        return { content: [{ type: "text" as const, text: formatResult({ error: "task_post returned no task id", raw: taskRaw }) }] };
      }

      const timeout = (max_wait_seconds ?? 300) * 1000;
      const interval = (poll_interval_seconds ?? 20) * 1000;
      const start = Date.now();
      let summary: any = null;
      let crawlProgress: string | undefined;
      let polls = 0;

      while (Date.now() - start < timeout) {
        await new Promise((resolve) => setTimeout(resolve, interval));
        polls++;
        try {
          summary = await get(`/on_page/summary/${taskId}`);
          crawlProgress = summary?.tasks?.[0]?.result?.[0]?.crawl_progress;
          if (crawlProgress === "finished") break;
        } catch (error) {
          // ignore transient errors and keep polling
        }
      }

      if (crawlProgress !== "finished") {
        return { content: [{ type: "text" as const, text: formatResult({
          status: "timeout",
          task_id: taskId,
          polls,
          crawl_progress: crawlProgress ?? "unknown",
          message: `Crawl did not finish within ${max_wait_seconds ?? 300}s. Use onpage_summary / onpage_pages with task_id=${taskId} later.`,
          summary,
        }) }] };
      }

      const pages = await post("/on_page/pages", { id: taskId, limit: pages_limit ?? 200 });
      return { content: [{ type: "text" as const, text: formatResult({
        status: "finished",
        task_id: taskId,
        polls,
        elapsed_ms: Date.now() - start,
        summary,
        pages,
      }) }] };
    }
  );

  server.tool(
    "ahrefs_site_explorer",
    "Prepared premium connector: call Ahrefs API v3 Site Explorer endpoints. Requires AHREFS_API_TOKEN.",
    {
      path: z.string().describe("Ahrefs v3 path, e.g. site-explorer/overview"),
      params: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
    },
    async ({ path, params }) => {
      const result = await ahrefsRequest(path, params);
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "semrush_api_report",
    "Prepared premium connector: call Semrush API reports. Requires SEMRUSH_API_KEY.",
    {
      params: z.record(z.string(), z.union([z.string(), z.number()])).describe("Semrush API params, e.g. { type: 'domain_organic', domain: 'example.com', database: 'co' }"),
    },
    async ({ params }) => {
      const result = await semrushRequest(params);
      return { content: [{ type: "text" as const, text: result }] };
    }
  );
}

function extractKeywords(raw: unknown): string[] {
  const keywords = new Set<string>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (typeof record.keyword === "string") keywords.add(record.keyword);
    Object.values(record).forEach(visit);
  };
  visit(raw);
  return [...keywords];
}

function buildSimpleClusters(keywords: string[]) {
  const buckets = new Map<string, string[]>();
  for (const keyword of keywords) {
    const normalized = keyword.toLowerCase();
    const bucket = normalized.includes("precio") || normalized.includes("costo")
      ? "precio y financiacion"
      : normalized.includes("curso") || normalized.includes("clase")
        ? "cursos"
        : normalized.includes("produccion")
          ? "produccion musical"
          : normalized.includes("dj")
            ? "dj"
            : "otros";
    buckets.set(bucket, [...(buckets.get(bucket) ?? []), keyword]);
  }
  return Object.fromEntries([...buckets.entries()].map(([name, values]) => [name, values.slice(0, 20)]));
}
