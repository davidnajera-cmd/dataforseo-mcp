import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runPageSpeed, summarizePageSpeed } from "./pagespeed-client.js";

function formatResult(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

const categoryEnum = z.enum(["performance", "accessibility", "best-practices", "seo", "pwa"]);

export function registerPageSpeedTools(server: McpServer) {
  server.tool(
    "pagespeed_analyze_url",
    "Run PageSpeed Insights for one URL and return the full Lighthouse/CrUX response.",
    {
      url: z.string().url(),
      strategy: z.enum(["mobile", "desktop"]).optional(),
      categories: z.array(categoryEnum).optional(),
      locale: z.string().optional(),
      summary_only: z.boolean().optional(),
    },
    async ({ url, strategy, categories, locale, summary_only }) => {
      const result = await runPageSpeed(url, { strategy, categories, locale });
      return {
        content: [{
          type: "text" as const,
          text: formatResult(summary_only ? summarizePageSpeed(result) : result),
        }],
      };
    }
  );

  server.tool(
    "pagespeed_bulk_urls",
    "Run PageSpeed Insights for multiple URLs and return summarized Core Web Vitals, Lighthouse scores, and opportunities.",
    {
      urls: z.array(z.string().url()).max(20),
      strategy: z.enum(["mobile", "desktop"]).optional(),
      categories: z.array(categoryEnum).optional(),
      locale: z.string().optional(),
    },
    async ({ urls, strategy, categories, locale }) => {
      const results = [];
      for (const url of urls) {
        try {
          const raw = await runPageSpeed(url, { strategy, categories, locale });
          results.push({ ok: true, ...summarizePageSpeed(raw) });
        } catch (error) {
          results.push({ ok: false, url, error: error instanceof Error ? error.message : "Unknown error" });
        }
      }
      return { content: [{ type: "text" as const, text: formatResult(results) }] };
    }
  );
}
