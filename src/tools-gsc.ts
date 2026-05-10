import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { gscGet, gscPost, gscPut, gscDelete } from "./gsc-client.js";

function formatResult(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

// Reusable description for the site_url parameter. GSC accepts two property
// formats; they return DIFFERENT data and people mix them up constantly.
// Bake the rule into the tool surface so any client (Claude, scripts, agents)
// sees the guidance without reading docs.
const SITE_URL_DESCRIPTION =
  "GSC property identifier. TWO formats accepted, they return DIFFERENT data:\n" +
  "  • URL-prefix (e.g. 'https://example.com/'): only URLs starting with that exact prefix. Excludes www, http, subdomains.\n" +
  "  • Domain (e.g. 'sc-domain:example.com'): every URL on the domain — apex + www + http + https + ALL subdomains. Strict superset of the URL-prefix variant.\n" +
  "Choose based on intent:\n" +
  "  • Post-migration audits / pre-vs-post comparisons → 'sc-domain:...' (catches www era + apex era together).\n" +
  "  • Current-site-only analysis when host is stable → URL-prefix is fine.\n" +
  "  • URL Inspection of a specific URL → either works, prefer Domain for full coverage.\n" +
  "Note: a newly verified Domain property takes 24–72h to backfill data. Until then it returns empty rows even if the URL-prefix has data.\n" +
  "Use gsc_sites_list to see which formats the connected account has access to before guessing.";

export function registerGscTools(server: McpServer) {
  // ============================================================
  // SEARCH ANALYTICS (READ)
  // ============================================================
  server.tool(
    "gsc_search_analytics_query",
    "Foundational GSC tool: returns clicks/impressions/CTR/position rows for a date range, grouped by your chosen dimensions (query, page, country, device, date, searchAppearance). Use this when you need raw numbers. For curated views prefer gsc_site_health_report (executive summary), gsc_keyword_opportunities (quick wins), or gsc_search_analytics_compare (period vs period).\n\n⚠ site_url choice CHANGES the dataset. URL-prefix returns only URLs matching that exact prefix; Domain ('sc-domain:...') returns the entire domain (apex + www + http + all subdomains). Cross-property comparisons are NOT apples-to-apples. For migration audits or anything spanning a host change, always use the Domain property.",
    {
      site_url: z.string().describe(SITE_URL_DESCRIPTION),
      start_date: z.string().describe("Start date (YYYY-MM-DD)"),
      end_date: z.string().describe("End date (YYYY-MM-DD)"),
      dimensions: z.array(z.enum(["country", "device", "page", "query", "searchAppearance", "date"])).optional()
        .describe("Dimensions to group by"),
      search_type: z.enum(["web", "image", "video", "news", "discover", "googleNews"]).optional(),
      row_limit: z.number().optional().describe("Max rows (default 1000, max 25000)"),
      start_row: z.number().optional().describe("Offset for pagination"),
      dimension_filter_groups: z.array(z.object({
        groupType: z.enum(["and"]).optional(),
        filters: z.array(z.object({
          dimension: z.string(),
          operator: z.enum(["contains", "equals", "notContains", "notEquals", "includingRegex", "excludingRegex"]),
          expression: z.string(),
        })),
      })).optional().describe("Filters to apply"),
      aggregation_type: z.enum(["auto", "byNewsShowcasePanel", "byPage", "byProperty"]).optional(),
    },
    async ({ site_url, start_date, end_date, dimensions, search_type, row_limit, start_row, dimension_filter_groups, aggregation_type }) => {
      const encodedSite = encodeURIComponent(site_url);
      const result = await gscPost(`/sites/${encodedSite}/searchAnalytics/query`, {
        startDate: start_date,
        endDate: end_date,
        dimensions: dimensions ?? ["query"],
        type: search_type ?? "web",
        rowLimit: row_limit ?? 1000,
        startRow: start_row ?? 0,
        dimensionFilterGroups: dimension_filter_groups,
        aggregationType: aggregation_type ?? "auto",
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // SITEMAPS (READ + WRITE)
  // ============================================================
  server.tool(
    "gsc_sitemaps_list",
    "List all sitemaps submitted for a site in Google Search Console.",
    {
      site_url: z.string().describe(SITE_URL_DESCRIPTION),
    },
    async ({ site_url }) => {
      const encodedSite = encodeURIComponent(site_url);
      const result = await gscGet(`/sites/${encodedSite}/sitemaps`);
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "gsc_sitemaps_get",
    "Get information about a specific sitemap.",
    {
      site_url: z.string().describe(SITE_URL_DESCRIPTION),
      feedpath: z.string().describe("Full URL of the sitemap"),
    },
    async ({ site_url, feedpath }) => {
      const encodedSite = encodeURIComponent(site_url);
      const encodedFeed = encodeURIComponent(feedpath);
      const result = await gscGet(`/sites/${encodedSite}/sitemaps/${encodedFeed}`);
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "gsc_sitemaps_submit",
    "Submit a sitemap for a site in Google Search Console.",
    {
      site_url: z.string().describe(SITE_URL_DESCRIPTION),
      feedpath: z.string().describe("Full URL of the sitemap to submit"),
    },
    async ({ site_url, feedpath }) => {
      const encodedSite = encodeURIComponent(site_url);
      const encodedFeed = encodeURIComponent(feedpath);
      const result = await gscPut(`/sites/${encodedSite}/sitemaps/${encodedFeed}`);
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "gsc_sitemaps_delete",
    "Remove a sitemap from a site in Google Search Console.",
    {
      site_url: z.string().describe(SITE_URL_DESCRIPTION),
      feedpath: z.string().describe("Full URL of the sitemap to delete"),
    },
    async ({ site_url, feedpath }) => {
      const encodedSite = encodeURIComponent(site_url);
      const encodedFeed = encodeURIComponent(feedpath);
      const result = await gscDelete(`/sites/${encodedSite}/sitemaps/${encodedFeed}`);
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // SITES (READ + WRITE)
  // ============================================================
  server.tool(
    "gsc_sites_list",
    "List all GSC properties the connected account has access to. ALWAYS call this first before any other GSC tool: the response shows you exactly which property formats are available (URL-prefix vs Domain — see site_url docs for any other GSC tool). Don't guess the format; copy the literal 'siteUrl' string from this response.",
    {},
    async () => {
      const result = await gscGet("/sites");
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "gsc_sites_get",
    "Get information about a specific site in Google Search Console.",
    {
      site_url: z.string().describe(SITE_URL_DESCRIPTION),
    },
    async ({ site_url }) => {
      const encodedSite = encodeURIComponent(site_url);
      const result = await gscGet(`/sites/${encodedSite}`);
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "gsc_sites_add",
    "Add a site to your Google Search Console account.",
    {
      site_url: z.string().describe(SITE_URL_DESCRIPTION + "\n(For sites_add: the URL/domain you want to register and verify in GSC.)"),
    },
    async ({ site_url }) => {
      const encodedSite = encodeURIComponent(site_url);
      const result = await gscPut(`/sites/${encodedSite}`);
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "gsc_sites_delete",
    "Remove a site from your Google Search Console account.",
    {
      site_url: z.string().describe(SITE_URL_DESCRIPTION + "\n(For sites_delete: the property you want to remove.)"),
    },
    async ({ site_url }) => {
      const encodedSite = encodeURIComponent(site_url);
      const result = await gscDelete(`/sites/${encodedSite}`);
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // URL INSPECTION (READ)
  // ============================================================
  server.tool(
    "gsc_url_inspection",
    "Inspect ONE specific URL in Google's index. Returns coverageState (Indexed/Submitted/Excluded), indexingState, robotsTxtState, lastCrawlTime, googleCanonical vs userCanonical, mobile usability, rich results status. Use to debug 'why isn't this URL ranking' or 'is Google seeing what I expect'. For multiple URLs at once use gsc_url_bulk_inspection (rate-limited 200ms/url).",
    {
      inspection_url: z.string().describe("URL to inspect"),
      site_url: z.string().describe(SITE_URL_DESCRIPTION),
      language_code: z.string().optional().describe("Language code (e.g., 'en-US')"),
    },
    async ({ inspection_url, site_url, language_code }) => {
      const result = await gscPost("/urlInspection/index:inspect", {
        inspectionUrl: inspection_url,
        siteUrl: site_url,
        languageCode: language_code ?? "en-US",
      }, "searchconsole");
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // INDEXING / WRITE OPERATIONS
  // ============================================================

  server.tool(
    "gsc_url_request_indexing",
    "Request Google to index or re-index a specific URL via the Indexing API (type: URL_UPDATED). ⚠ IMPORTANT scope limitation: per Google's documentation, the Indexing API only officially supports two URL types — pages with JobPosting structured data and pages with VideoObject + BroadcastEvent (live streams). For other content (blog posts, landing pages, programs), the API call may return 200 OK but Google silently no-ops the request. For regular content URLs, prefer (a) submitting an updated sitemap.xml + waiting for natural re-crawl, or (b) using GSC's URL Inspection 'Request Indexing' button manually in the web UI. Use this tool when the target URL has eligible structured data, or as a programmatic ping for sitemap-discovery acceleration on URLs you've also added to a sitemap.",
    {
      url: z.string().describe("The canonical URL to request indexing for (e.g., 'https://example.com/page')"),
    },
    async ({ url }) => {
      const result = await gscPost("/urlNotifications:publish", {
        url,
        type: "URL_UPDATED",
      }, "indexing" as any);
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "gsc_url_cancel_indexing",
    "Notify Google that a URL has been deleted and should be removed from the index. Uses the Google Indexing API (type: URL_DELETED).",
    {
      url: z.string().describe("The URL to remove from Google's index"),
    },
    async ({ url }) => {
      const result = await gscPost("/urlNotifications:publish", {
        url,
        type: "URL_DELETED",
      }, "indexing" as any);
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "gsc_url_indexing_status",
    "Get the indexing notification status for a specific URL from the Google Indexing API. Returns 404 if the URL was never submitted (or was submitted but Google silently no-oped it because it's not an eligible JobPosting/VideoObject URL). Use to verify whether a previous gsc_url_request_indexing call actually registered.",
    {
      url: z.string().describe("The URL to check indexing notification status for"),
    },
    async ({ url }) => {
      const encodedUrl = encodeURIComponent(url);
      const result = await gscGet(`/urlNotifications/metadata?url=${encodedUrl}`, "indexing" as any);
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "gsc_bulk_request_indexing",
    "Request indexing for multiple URLs at once via the Indexing API. ⚠ Same Google-side scope limit as gsc_url_request_indexing: officially supported only for JobPosting + VideoObject/BroadcastEvent URLs. For regular content the API silently no-ops. For bulk re-crawl of regular pages, the right tool is sitemap submission + ping. Useful for batch JobPosting updates or as a sitemap-discovery accelerator.",
    {
      urls: z.array(z.string()).describe("List of URLs to request indexing for (max 200 recommended per batch)"),
    },
    async ({ urls }) => {
      const results: { url: string; status: string; data?: unknown; error?: string }[] = [];

      for (const url of urls) {
        try {
          const data = await gscPost("/urlNotifications:publish", {
            url,
            type: "URL_UPDATED",
          }, "indexing" as any);
          results.push({ url, status: "success", data });
        } catch (err: any) {
          results.push({ url, status: "error", error: err?.message ?? String(err) });
        }
      }

      const summary = {
        total: urls.length,
        success: results.filter(r => r.status === "success").length,
        errors: results.filter(r => r.status === "error").length,
        results,
      };

      return { content: [{ type: "text" as const, text: formatResult(summary) }] };
    }
  );

  // ============================================================
  // SELF-MANAGEMENT / WORKFLOW TOOLS
  // ============================================================

  server.tool(
    "gsc_url_bulk_inspection",
    "Inspect multiple URLs at once via the URL Inspection API. Sequential with 200ms delay between calls (rate limit ~2000/day per property). Returns per-URL coverage, indexing state, canonical, last crawl time, and rich results state, plus an aggregate summary.",
    {
      urls: z.array(z.string()).min(1).describe("List of URLs to inspect"),
      site_url: z.string().describe(SITE_URL_DESCRIPTION),
      language_code: z.string().optional().describe("Language code, default 'en-US'"),
    },
    async ({ urls, site_url, language_code }) => {
      try {
        const results: Array<Record<string, unknown>> = [];
        for (let i = 0; i < urls.length; i++) {
          const url = urls[i];
          try {
            const raw = await gscPost("/urlInspection/index:inspect", {
              inspectionUrl: url,
              siteUrl: site_url,
              languageCode: language_code ?? "en-US",
            }, "searchconsole") as { inspectionResult?: Record<string, any> };
            const insp = raw.inspectionResult ?? {};
            const idx = insp.indexStatusResult ?? {};
            const rich = insp.richResultsResult ?? {};
            results.push({
              url,
              ok: true,
              coverageState: idx.coverageState ?? null,
              robotsTxtState: idx.robotsTxtState ?? null,
              indexingState: idx.indexingState ?? null,
              lastCrawlTime: idx.lastCrawlTime ?? null,
              crawledAs: idx.crawledAs ?? null,
              googleCanonical: idx.googleCanonical ?? null,
              userCanonical: idx.userCanonical ?? null,
              richResultsState: rich.verdict ?? null,
            });
          } catch (err: any) {
            results.push({ url, ok: false, error: err?.message ?? String(err) });
          }
          if (i < urls.length - 1) await new Promise((resolve) => setTimeout(resolve, 200));
        }
        const indexed = results.filter((r) => r.ok && (r.coverageState as string)?.toLowerCase().includes("indexed")).length;
        const errors = results.filter((r) => !r.ok).length;
        const summary = { total: urls.length, indexed, notIndexed: results.length - indexed - errors, errors, results };
        return { content: [{ type: "text" as const, text: formatResult(summary) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: formatResult({ error: err?.message ?? String(err) }) }] };
      }
    }
  );

  server.tool(
    "gsc_search_analytics_compare",
    "Compare search analytics between two periods. Returns per-row deltas (clicks/impressions/ctr/position), top gainers, top losers, new and lost keywords.",
    {
      site_url: z.string(),
      current_start: z.string().describe("YYYY-MM-DD"),
      current_end: z.string(),
      prior_start: z.string(),
      prior_end: z.string(),
      dimensions: z.array(z.string()).optional().describe("Default ['query']"),
      search_type: z.string().optional().describe("Default 'web'"),
      row_limit: z.number().optional().describe("Default 1000"),
    },
    async ({ site_url, current_start, current_end, prior_start, prior_end, dimensions, search_type, row_limit }) => {
      try {
        const encodedSite = encodeURIComponent(site_url);
        const dims = dimensions ?? ["query"];
        const body = (start: string, end: string) => ({
          startDate: start,
          endDate: end,
          dimensions: dims,
          type: search_type ?? "web",
          rowLimit: row_limit ?? 1000,
        });
        const [current, prior] = await Promise.all([
          gscPost(`/sites/${encodedSite}/searchAnalytics/query`, body(current_start, current_end)) as Promise<{ rows?: Array<{ keys?: string[]; clicks: number; impressions: number; ctr: number; position: number }> }>,
          gscPost(`/sites/${encodedSite}/searchAnalytics/query`, body(prior_start, prior_end)) as Promise<{ rows?: Array<{ keys?: string[]; clicks: number; impressions: number; ctr: number; position: number }> }>,
        ]);
        const key = (row: { keys?: string[] }) => (row.keys ?? []).join("|");
        const priorMap = new Map((prior.rows ?? []).map((row) => [key(row), row]));
        const currentRows = current.rows ?? [];
        const merged: Array<Record<string, unknown>> = [];
        const seenKeys = new Set<string>();
        for (const row of currentRows) {
          const k = key(row);
          seenKeys.add(k);
          const before = priorMap.get(k);
          const clicks_delta = row.clicks - (before?.clicks ?? 0);
          const impressions_delta = row.impressions - (before?.impressions ?? 0);
          const ctr_delta = row.ctr - (before?.ctr ?? 0);
          const position_delta = row.position - (before?.position ?? 0);
          merged.push({
            keys: row.keys,
            current: { clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.position },
            prior: before ? { clicks: before.clicks, impressions: before.impressions, ctr: before.ctr, position: before.position } : null,
            clicks_delta,
            clicks_delta_pct: before && before.clicks ? ((clicks_delta / before.clicks) * 100) : null,
            impressions_delta,
            ctr_delta,
            position_delta,
            is_new: !before,
          });
        }
        const new_keywords = merged.filter((m) => m.is_new).map((m) => ({ keys: m.keys, current: m.current }));
        const lost_keywords = (prior.rows ?? [])
          .filter((row) => !seenKeys.has(key(row)))
          .map((row) => ({ keys: row.keys, prior: { clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.position } }));
        const top_gainers = [...merged].sort((a, b) => Number(b.clicks_delta) - Number(a.clicks_delta)).slice(0, 20);
        const top_losers = [...merged].sort((a, b) => Number(a.clicks_delta) - Number(b.clicks_delta)).slice(0, 20);
        const totals = (rows: typeof currentRows) => ({
          clicks: rows.reduce((acc, r) => acc + r.clicks, 0),
          impressions: rows.reduce((acc, r) => acc + r.impressions, 0),
          rows: rows.length,
        });
        const summary = {
          current_period: { start: current_start, end: current_end, ...totals(currentRows) },
          prior_period: { start: prior_start, end: prior_end, ...totals(prior.rows ?? []) },
          new_keywords_count: new_keywords.length,
          lost_keywords_count: lost_keywords.length,
        };
        return { content: [{ type: "text" as const, text: formatResult({ summary, top_gainers, top_losers, new_keywords, lost_keywords }) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: formatResult({ error: err?.message ?? String(err) }) }] };
      }
    }
  );

  server.tool(
    "gsc_indexing_coverage_report",
    "Cross-reference a sitemap against pages with traffic in the last 28 days. Classifies URLs into in_sitemap_with_traffic, in_sitemap_no_traffic, has_traffic_not_in_sitemap.",
    {
      site_url: z.string(),
      sitemap_url: z.string().describe("Full sitemap URL, e.g. https://example.com/sitemap.xml"),
    },
    async ({ site_url, sitemap_url }) => {
      try {
        const encodedSite = encodeURIComponent(site_url);
        const encodedFeed = encodeURIComponent(sitemap_url);
        const today = new Date().toISOString().slice(0, 10);
        const start = new Date(Date.now() - 28 * 86400_000).toISOString().slice(0, 10);

        const [sitemapInfo, pages] = await Promise.all([
          gscGet(`/sites/${encodedSite}/sitemaps/${encodedFeed}`) as Promise<{ contents?: Array<{ submitted?: string }>; lastDownloaded?: string; lastSubmitted?: string; warnings?: string; errors?: string }>,
          gscPost(`/sites/${encodedSite}/searchAnalytics/query`, {
            startDate: start,
            endDate: today,
            dimensions: ["page"],
            rowLimit: 25000,
            type: "web",
          }) as Promise<{ rows?: Array<{ keys?: string[]; clicks: number; impressions: number }> }>,
        ]);

        // Try to fetch the actual sitemap XML to enumerate URLs
        let sitemapUrls: string[] = [];
        try {
          const res = await fetch(sitemap_url, { headers: { "User-Agent": "dataforseo-mcp/1.0 (sitemap reader)" } });
          if (res.ok) {
            const xml = await res.text();
            sitemapUrls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) => m[1].trim());
          }
        } catch {
          // ignore — we still report what GSC knows
        }

        const trafficUrls = new Map<string, { clicks: number; impressions: number }>();
        for (const row of pages.rows ?? []) {
          const url = row.keys?.[0];
          if (url) trafficUrls.set(url, { clicks: row.clicks, impressions: row.impressions });
        }
        const sitemapSet = new Set(sitemapUrls);

        const in_sitemap_with_traffic: Array<Record<string, unknown>> = [];
        const in_sitemap_no_traffic: string[] = [];
        const has_traffic_not_in_sitemap: Array<Record<string, unknown>> = [];

        for (const url of sitemapUrls) {
          const t = trafficUrls.get(url);
          if (t) in_sitemap_with_traffic.push({ url, ...t });
          else in_sitemap_no_traffic.push(url);
        }
        for (const [url, metrics] of trafficUrls.entries()) {
          if (!sitemapSet.has(url)) has_traffic_not_in_sitemap.push({ url, ...metrics });
        }

        const report = {
          period: { start, end: today },
          sitemap: { url: sitemap_url, total_urls: sitemapUrls.length, lastDownloaded: sitemapInfo.lastDownloaded ?? null, lastSubmitted: sitemapInfo.lastSubmitted ?? null, warnings: sitemapInfo.warnings ?? null, errors: sitemapInfo.errors ?? null },
          counts: {
            in_sitemap_with_traffic: in_sitemap_with_traffic.length,
            in_sitemap_no_traffic: in_sitemap_no_traffic.length,
            has_traffic_not_in_sitemap: has_traffic_not_in_sitemap.length,
            total_urls_with_traffic: trafficUrls.size,
          },
          samples: {
            in_sitemap_with_traffic: in_sitemap_with_traffic.slice(0, 50),
            in_sitemap_no_traffic: in_sitemap_no_traffic.slice(0, 50),
            has_traffic_not_in_sitemap: has_traffic_not_in_sitemap.slice(0, 50),
          },
        };
        return { content: [{ type: "text" as const, text: formatResult(report) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: formatResult({ error: err?.message ?? String(err) }) }] };
      }
    }
  );

  server.tool(
    "gsc_keyword_opportunities",
    "Find keywords with high CTR/position improvement potential. Filters by impression and position thresholds, scores by impressions × (1-ctr) × (position-1), and classifies into quick_win / medium_effort / long_term.",
    {
      site_url: z.string(),
      start_date: z.string(),
      end_date: z.string(),
      min_impressions: z.number().optional().describe("Default 100"),
      max_position: z.number().optional().describe("Default 20"),
      min_position: z.number().optional().describe("Default 4"),
    },
    async ({ site_url, start_date, end_date, min_impressions, max_position, min_position }) => {
      try {
        const encodedSite = encodeURIComponent(site_url);
        const minImp = min_impressions ?? 100;
        const maxPos = max_position ?? 20;
        const minPos = min_position ?? 4;
        const result = await gscPost(`/sites/${encodedSite}/searchAnalytics/query`, {
          startDate: start_date,
          endDate: end_date,
          dimensions: ["query", "page"],
          rowLimit: 5000,
          type: "web",
        }) as { rows?: Array<{ keys?: string[]; clicks: number; impressions: number; ctr: number; position: number }> };

        const opportunities = (result.rows ?? [])
          .filter((row) => row.position >= minPos && row.position <= maxPos && row.impressions >= minImp)
          .map((row) => {
            const opportunity_score = row.impressions * (1 - row.ctr) * (row.position - 1);
            const classification = row.position <= 10 ? "quick_win" : row.position <= 15 ? "medium_effort" : "long_term";
            return {
              query: row.keys?.[0] ?? null,
              page: row.keys?.[1] ?? null,
              clicks: row.clicks,
              impressions: row.impressions,
              ctr: row.ctr,
              position: row.position,
              opportunity_score,
              classification,
            };
          })
          .sort((a, b) => b.opportunity_score - a.opportunity_score)
          .slice(0, 100);

        const summary = {
          period: { start: start_date, end: end_date },
          filters: { min_impressions: minImp, max_position: maxPos, min_position: minPos },
          total_opportunities: opportunities.length,
          by_classification: {
            quick_win: opportunities.filter((o) => o.classification === "quick_win").length,
            medium_effort: opportunities.filter((o) => o.classification === "medium_effort").length,
            long_term: opportunities.filter((o) => o.classification === "long_term").length,
          },
        };
        return { content: [{ type: "text" as const, text: formatResult({ summary, opportunities }) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: formatResult({ error: err?.message ?? String(err) }) }] };
      }
    }
  );

  server.tool(
    "gsc_site_health_report",
    "Comprehensive SEO health report combining trend, top keywords, top pages, country/device breakdowns, and sitemap status. Runs all queries in parallel.",
    {
      site_url: z.string(),
      days: z.number().optional().describe("Default 28"),
    },
    async ({ site_url, days }) => {
      try {
        const encodedSite = encodeURIComponent(site_url);
        const range = days ?? 28;
        const today = new Date().toISOString().slice(0, 10);
        const start = new Date(Date.now() - range * 86400_000).toISOString().slice(0, 10);
        const baseBody = (extra: Record<string, unknown>) => ({ startDate: start, endDate: today, type: "web", ...extra });

        const [trend, queries, pages, country, device, sitemaps] = await Promise.all([
          gscPost(`/sites/${encodedSite}/searchAnalytics/query`, baseBody({ dimensions: ["date"], rowLimit: 1000 })) as Promise<{ rows?: Array<{ keys?: string[]; clicks: number; impressions: number; ctr: number; position: number }> }>,
          gscPost(`/sites/${encodedSite}/searchAnalytics/query`, baseBody({ dimensions: ["query"], rowLimit: 100 })) as Promise<{ rows?: Array<{ keys?: string[]; clicks: number; impressions: number; ctr: number; position: number }> }>,
          gscPost(`/sites/${encodedSite}/searchAnalytics/query`, baseBody({ dimensions: ["page"], rowLimit: 100 })) as Promise<{ rows?: Array<{ keys?: string[]; clicks: number; impressions: number; ctr: number; position: number }> }>,
          gscPost(`/sites/${encodedSite}/searchAnalytics/query`, baseBody({ dimensions: ["country"], rowLimit: 20 })) as Promise<{ rows?: Array<{ keys?: string[]; clicks: number; impressions: number; ctr: number; position: number }> }>,
          gscPost(`/sites/${encodedSite}/searchAnalytics/query`, baseBody({ dimensions: ["device"] })) as Promise<{ rows?: Array<{ keys?: string[]; clicks: number; impressions: number; ctr: number; position: number }> }>,
          gscGet(`/sites/${encodedSite}/sitemaps`).catch((err: any) => ({ error: err?.message ?? String(err) })),
        ]);

        const totals = (trend.rows ?? []).reduce(
          (acc, r) => ({ clicks: acc.clicks + r.clicks, impressions: acc.impressions + r.impressions, ctr_sum: acc.ctr_sum + r.ctr * r.clicks, pos_sum: acc.pos_sum + r.position * r.clicks }),
          { clicks: 0, impressions: 0, ctr_sum: 0, pos_sum: 0 }
        );
        const avg_ctr = totals.impressions ? totals.clicks / totals.impressions : 0;
        const avg_position = totals.clicks ? totals.pos_sum / totals.clicks : 0;
        const mapRows = (rows?: Array<{ keys?: string[]; clicks: number; impressions: number; ctr: number; position: number }>, k = 10) =>
          (rows ?? []).slice(0, k).map((r) => ({ key: r.keys?.[0] ?? null, clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position }));

        const report = {
          period: { start, end: today, days: range },
          total_clicks: totals.clicks,
          total_impressions: totals.impressions,
          avg_ctr,
          avg_position,
          top_keywords: mapRows(queries.rows, 10),
          top_pages: mapRows(pages.rows, 10),
          traffic_by_country: mapRows(country.rows, 20),
          traffic_by_device: (device.rows ?? []).map((r) => ({ device: r.keys?.[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position })),
          daily_trend: (trend.rows ?? []).map((r) => ({ date: r.keys?.[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position })),
          sitemaps_status: sitemaps,
        };
        return { content: [{ type: "text" as const, text: formatResult(report) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: formatResult({ error: err?.message ?? String(err) }) }] };
      }
    }
  );

  server.tool(
    "gsc_rich_results_audit",
    "Audit rich results / structured data on multiple URLs via URL Inspection. Groups by rich result type, counts errors, and flags pages without structured data. Sequential with 200ms delay (rate limit ~2000/day).",
    {
      urls: z.array(z.string()).min(1),
      site_url: z.string(),
    },
    async ({ urls, site_url }) => {
      try {
        const byType = new Map<string, { withErrors: number; total: number; urls: string[] }>();
        const pagesWithoutStructuredData: string[] = [];
        const detail: Array<Record<string, unknown>> = [];

        for (let i = 0; i < urls.length; i++) {
          const url = urls[i];
          try {
            const raw = await gscPost("/urlInspection/index:inspect", {
              inspectionUrl: url,
              siteUrl: site_url,
              languageCode: "en-US",
            }, "searchconsole") as { inspectionResult?: { richResultsResult?: any } };
            const rich = raw.inspectionResult?.richResultsResult ?? {};
            const items = (rich.detectedItems ?? rich.items ?? []) as Array<{ richResultType?: string; items?: Array<{ issues?: Array<{ severity?: string }> }>; issues?: Array<{ severity?: string }> }>;
            if (items.length === 0) pagesWithoutStructuredData.push(url);

            const perUrl: Array<Record<string, unknown>> = [];
            for (const item of items) {
              const type = item.richResultType ?? "unknown";
              const issuesList = item.items?.flatMap((it) => it.issues ?? []) ?? item.issues ?? [];
              const errorCount = issuesList.filter((iss) => (iss.severity ?? "").toLowerCase() === "error").length;
              const bucket = byType.get(type) ?? { withErrors: 0, total: 0, urls: [] };
              bucket.total += 1;
              if (errorCount > 0) bucket.withErrors += 1;
              if (!bucket.urls.includes(url)) bucket.urls.push(url);
              byType.set(type, bucket);
              perUrl.push({ type, error_count: errorCount, total_issues: issuesList.length });
            }
            detail.push({ url, ok: true, verdict: rich.verdict ?? null, detection_time: rich.detectedItemsTime ?? null, items: perUrl });
          } catch (err: any) {
            detail.push({ url, ok: false, error: err?.message ?? String(err) });
          }
          if (i < urls.length - 1) await new Promise((resolve) => setTimeout(resolve, 200));
        }

        const summary = {
          total_urls: urls.length,
          pages_without_structured_data: pagesWithoutStructuredData.length,
          rich_result_types: [...byType.entries()].map(([type, info]) => ({ type, total_pages: info.urls.length, pages_with_errors: info.withErrors })).sort((a, b) => b.total_pages - a.total_pages),
        };
        return { content: [{ type: "text" as const, text: formatResult({ summary, pages_without_structured_data: pagesWithoutStructuredData.slice(0, 50), detail }) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: formatResult({ error: err?.message ?? String(err) }) }] };
      }
    }
  );

  server.tool(
    "gsc_submit_sitemap_and_verify",
    "Submit a sitemap and verify Google processed it. Returns the sitemap status (pending, lastDownloaded, lastSubmitted, warnings, errors) after a 2s wait.",
    {
      site_url: z.string(),
      sitemap_url: z.string(),
    },
    async ({ site_url, sitemap_url }) => {
      try {
        const encodedSite = encodeURIComponent(site_url);
        const encodedFeed = encodeURIComponent(sitemap_url);
        await gscPut(`/sites/${encodedSite}/sitemaps/${encodedFeed}`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const status = await gscGet(`/sites/${encodedSite}/sitemaps/${encodedFeed}`);
        return { content: [{ type: "text" as const, text: formatResult({ submitted: true, sitemap_url, sitemap_status: status }) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: formatResult({ submitted: false, error: err?.message ?? String(err) }) }] };
      }
    }
  );
}

// Total GSC tools: 21
