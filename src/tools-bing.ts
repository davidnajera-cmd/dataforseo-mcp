import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { bingGet, bingPost } from "./bing-client.js";

function formatResult(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export function registerBingTools(server: McpServer) {
  server.tool(
    "bing_get_sites",
    "List sites verified in Bing Webmaster Tools for the authenticated account.",
    {},
    async () => {
      const result = await bingGet("GetUserSites");
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "bing_get_query_stats",
    "Get clicks/impressions/avg position by query for a Bing-verified site (last 6 months).",
    {
      site_url: z.string().describe("Verified site, e.g. https://www.dnamusic.edu.co/"),
    },
    async ({ site_url }) => {
      const result = await bingGet("GetQueryStats", { siteUrl: site_url });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "bing_get_page_stats",
    "Get clicks/impressions/avg position by page for a Bing-verified site (last 6 months).",
    {
      site_url: z.string(),
    },
    async ({ site_url }) => {
      const result = await bingGet("GetPageStats", { siteUrl: site_url });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "bing_get_crawl_stats",
    "Get crawl statistics (errors, indexed pages, pages crawled) for a Bing-verified site.",
    {
      site_url: z.string(),
    },
    async ({ site_url }) => {
      const result = await bingGet("GetCrawlStats", { siteUrl: site_url });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "bing_get_url_info",
    "Get index status info for a specific URL in Bing.",
    {
      site_url: z.string(),
      url: z.string(),
    },
    async ({ site_url, url }) => {
      const result = await bingGet("GetUrlInfo", { siteUrl: site_url, url });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "bing_submit_url",
    "Submit a single URL to Bing for indexing. Daily quota: ~10k URLs per site.",
    {
      site_url: z.string(),
      url: z.string(),
    },
    async ({ site_url, url }) => {
      const result = await bingPost("SubmitUrl", { siteUrl: site_url, url });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "bing_submit_url_batch",
    "Submit up to 500 URLs at once to Bing for indexing. Counts against the daily quota per URL.",
    {
      site_url: z.string(),
      urls: z.array(z.string()).max(500),
    },
    async ({ site_url, urls }) => {
      const result = await bingPost("SubmitUrlBatch", { siteUrl: site_url, urlList: urls });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "bing_get_url_submission_quota",
    "Check remaining daily/monthly URL submission quota for a Bing-verified site.",
    {
      site_url: z.string(),
    },
    async ({ site_url }) => {
      const result = await bingGet("GetUrlSubmissionQuota", { siteUrl: site_url });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );
}
