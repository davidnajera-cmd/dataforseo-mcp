import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { gscGet, gscPost, gscPut, gscDelete } from "./gsc-client.js";

function formatResult(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export function registerGscTools(server: McpServer) {
  // ============================================================
  // SEARCH ANALYTICS
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
  // SITEMAPS
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
  // SITES
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
  // URL INSPECTION
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
}
