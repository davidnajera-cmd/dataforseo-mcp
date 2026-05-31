import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  crawlGetStatus,
  crawlResume,
  crawlStart,
  crawlStop,
  getCredits,
  getHistoryEntry,
  listHistory,
  markdownify,
  ScrapeGraphError,
  searchScraper,
  smartScraper,
} from "./scrapegraph-client.js";

function formatResult(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

function formatScrapeGraphError(error: unknown): string {
  if (error instanceof ScrapeGraphError) {
    return formatResult({
      ok: false,
      source: "ScrapeGraphAI",
      status: error.status,
      message: error.message,
      body: error.body,
    });
  }
  return formatResult({
    ok: false,
    source: "ScrapeGraphAI",
    message: error instanceof Error ? error.message : String(error),
  });
}

export function registerScrapeGraphTools(server: McpServer) {
  server.tool(
    "scrapegraph_smartscraper",
    "Extract structured data from a single URL using a natural-language prompt. Useful for DNA Music to pull competitor pricing, specs, program details from rival academies, or contact data from commercial pages. Note: sites with strong anti-bot protections like LinkedIn or Amazon may still fail without extra proxy/stealth support.",
    {
      website_url: z.string().url().describe("Target page URL to extract from."),
      user_prompt: z.string().min(1).describe("Natural-language extraction instructions."),
      output_schema: z.record(z.string(), z.unknown()).optional().describe("Optional JSON schema shape to force a structured response."),
    },
    async ({ website_url, user_prompt, output_schema }) => {
      try {
        const result = await smartScraper(website_url, user_prompt, output_schema);
        return {
          content: [{ type: "text" as const, text: formatResult({ ok: true, website_url, user_prompt, result }) }],
        };
      } catch (error) {
        return { content: [{ type: "text" as const, text: formatScrapeGraphError(error) }] };
      }
    }
  );

  server.tool(
    "scrapegraph_searchscraper",
    "Search the web and extract structured information from multiple results in one call. Built for market research, competitor sweeps, and structuring data from several sources at once for DNA Music and La Tienda de Audio.",
    {
      user_prompt: z.string().min(1).describe("Prompt describing what to search and extract."),
      num_results: z.number().int().min(3).max(20).optional().describe("How many websites to search. Default 3."),
    },
    async ({ user_prompt, num_results }) => {
      try {
        const result = await searchScraper(user_prompt, num_results ?? 3);
        return {
          content: [{ type: "text" as const, text: formatResult({ ok: true, user_prompt, num_results: num_results ?? 3, result }) }],
        };
      } catch (error) {
        return { content: [{ type: "text" as const, text: formatScrapeGraphError(error) }] };
      }
    }
  );

  server.tool(
    "scrapegraph_markdownify",
    "Convert any webpage into clean Markdown for RAG, Cortex ingestion, or content analysis. Great for competitor blog ingestion, documentation capture, and turning noisy web pages into analysis-ready text.",
    {
      website_url: z.string().url().describe("Page URL to convert into Markdown."),
    },
    async ({ website_url }) => {
      try {
        const result = await markdownify(website_url);
        return {
          content: [{ type: "text" as const, text: formatResult({ ok: true, website_url, result }) }],
        };
      } catch (error) {
        return { content: [{ type: "text" as const, text: formatScrapeGraphError(error) }] };
      }
    }
  );

  server.tool(
    "scrapegraph_crawl_start",
    "Start an async multi-page crawl in ScrapeGraphAI v2. Great for crawling a competitor blog, product category, docs section, or multi-page academy site and keeping per-page markdown/JSON extraction ready for later analysis.",
    {
      url: z.string().url().describe("Starting URL for the crawl."),
      formats: z.array(z.record(z.string(), z.unknown())).optional().describe("Output formats per page. Default [{ type: 'markdown' }]."),
      max_pages: z.number().int().min(1).max(1000).optional().describe("Maximum pages to crawl. Default 25."),
      max_depth: z.number().int().min(1).max(10).optional().describe("How many link levels to follow. Default 2."),
      max_links_per_page: z.number().int().min(1).max(100).optional().describe("Cap on links expanded per page. Default 10."),
      include_patterns: z.array(z.string()).optional().describe("Glob-style URL patterns to include, e.g. ['/blog/*']."),
      exclude_patterns: z.array(z.string()).optional().describe("Glob-style URL patterns to exclude, e.g. ['/admin/*']."),
      fetch_config: z.record(z.string(), z.unknown()).optional().describe("Optional ScrapeGraph fetchConfig shared by every page."),
    },
    async ({ url, formats, max_pages, max_depth, max_links_per_page, include_patterns, exclude_patterns, fetch_config }) => {
      try {
        const result = await crawlStart({
          url,
          formats: formats ?? [{ type: "markdown" }],
          maxPages: max_pages ?? 25,
          maxDepth: max_depth ?? 2,
          maxLinksPerPage: max_links_per_page ?? 10,
          ...(include_patterns ? { includePatterns: include_patterns } : {}),
          ...(exclude_patterns ? { excludePatterns: exclude_patterns } : {}),
          ...(fetch_config ? { fetchConfig: fetch_config } : {}),
        });
        return { content: [{ type: "text" as const, text: formatResult({ ok: true, url, result }) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: formatScrapeGraphError(error) }] };
      }
    }
  );

  server.tool(
    "scrapegraph_crawl_status",
    "Check the status and partial/final results of a ScrapeGraphAI crawl job by id.",
    {
      id: z.string().min(1).describe("Crawl job id returned by scrapegraph_crawl_start."),
    },
    async ({ id }) => {
      try {
        const result = await crawlGetStatus(id);
        return { content: [{ type: "text" as const, text: formatResult({ ok: true, id, result }) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: formatScrapeGraphError(error) }] };
      }
    }
  );

  server.tool(
    "scrapegraph_crawl_stop",
    "Stop a running ScrapeGraphAI crawl job. Useful when a broad competitor crawl is consuming too many pages or credits.",
    {
      id: z.string().min(1).describe("Crawl job id to stop."),
    },
    async ({ id }) => {
      try {
        const result = await crawlStop(id);
        return { content: [{ type: "text" as const, text: formatResult({ ok: true, id, result }) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: formatScrapeGraphError(error) }] };
      }
    }
  );

  server.tool(
    "scrapegraph_crawl_resume",
    "Resume a stopped ScrapeGraphAI crawl job.",
    {
      id: z.string().min(1).describe("Crawl job id to resume."),
    },
    async ({ id }) => {
      try {
        const result = await crawlResume(id);
        return { content: [{ type: "text" as const, text: formatResult({ ok: true, id, result }) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: formatScrapeGraphError(error) }] };
      }
    }
  );

  server.tool(
    "scrapegraph_history_list",
    "Browse ScrapeGraphAI request history. Useful for recovering previous scrape/extract/search/crawl outputs without spending credits again.",
    {
      service: z.string().optional().describe("Optional service filter like 'scrape', 'extract', 'search', or 'crawl'."),
      page: z.number().int().min(1).optional().describe("Page number. Default 1."),
      limit: z.number().int().min(1).max(100).optional().describe("Items per page. Default 20."),
    },
    async ({ service, page, limit }) => {
      try {
        const result = await listHistory({ service, page: page ?? 1, limit: limit ?? 20 });
        return { content: [{ type: "text" as const, text: formatResult({ ok: true, service, page: page ?? 1, limit: limit ?? 20, result }) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: formatScrapeGraphError(error) }] };
      }
    }
  );

  server.tool(
    "scrapegraph_history_get",
    "Fetch one ScrapeGraphAI history entry by id, including stored results from a previous request.",
    {
      id: z.string().min(1).describe("History request id."),
    },
    async ({ id }) => {
      try {
        const result = await getHistoryEntry(id);
        return { content: [{ type: "text" as const, text: formatResult({ ok: true, id, result }) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: formatScrapeGraphError(error) }] };
      }
    }
  );

  server.tool(
    "scrapegraph_credits",
    "Check ScrapeGraphAI credit balance and quotas before launching expensive research or crawl jobs.",
    {},
    async () => {
      try {
        const result = await getCredits();
        return { content: [{ type: "text" as const, text: formatResult({ ok: true, result }) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: formatScrapeGraphError(error) }] };
      }
    }
  );
}
