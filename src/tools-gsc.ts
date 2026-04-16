import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { gscGet, gscPost, gscPut, gscDelete } from "./gsc-client.js";

function formatResult(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export function registerGscTools(server: McpServer) {
  // ============================================================
  // SEARCH ANALYTICS (READ)
  // ============================================================
  server.tool(
    "gsc_search_analytics_query",
    "Query Google Search Console search analytics data (clicks, impressions, CTR, position) with filters.",
    {
      site_url: z.string().describe("Site URL (e.g., 'https://example.com/' or 'sc-domain:example.com')"),
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
      site_url: z.string().describe("Site URL"),
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
      site_url: z.string().describe("Site URL"),
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
      site_url: z.string().describe("Site URL"),
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
      site_url: z.string().describe("Site URL"),
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
    "List all sites in your Google Search Console account.",
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
      site_url: z.string().describe("Site URL"),
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
      site_url: z.string().describe("Site URL to add"),
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
      site_url: z.string().describe("Site URL to remove"),
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
    "Inspect a URL in Google's index. Get indexing status, crawl info, and rich results.",
    {
      inspection_url: z.string().describe("URL to inspect"),
      site_url: z.string().describe("Site URL (property in GSC)"),
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
    "Request Google to index or re-index a specific URL. Uses the Google Indexing API (type: URL_UPDATED). Requires the Indexing API enabled in Google Cloud and the service account added to GSC as an owner.",
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
    "Get the indexing notification status for a specific URL from the Google Indexing API.",
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
    "Request indexing for multiple URLs at once. Sends URL_UPDATED notifications for each URL in the list. Useful for submitting new or updated pages in bulk.",
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
}
