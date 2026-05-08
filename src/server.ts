import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./tools.js";
import { registerGscTools } from "./tools-gsc.js";
import { registerSerpApiTools } from "./tools-serpapi.js";
import { registerClarityTools } from "./tools-clarity.js";
import { registerGa4Tools } from "./tools-ga4.js";
import { registerPageSpeedTools } from "./tools-pagespeed.js";
import { registerSeoWorkflowTools } from "./tools-seo-workflows.js";
import { registerBingTools } from "./tools-bing.js";
import { registerWaybackTools } from "./tools-wayback.js";
import { registerSchemaTools } from "./tools-schema.js";
import { registerHttpUtilsTools } from "./tools-http-utils.js";
import { registerLogTools } from "./tools-logs.js";
import { registerHistoryTools } from "./tools-history.js";
import { registerBacklogTools } from "./tools-backlog.js";
import { registerBrandKnowledgeTools } from "./tools-brand-knowledge.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "SEO MCP Server",
    version: "1.4.0",
  });

  // DataForSEO API tools (SERP, Keywords, Backlinks, OnPage, Labs, etc.)
  registerTools(server);

  // Google Search Console API tools
  registerGscTools(server);

  // Google Analytics 4 Admin/Data API tools
  registerGa4Tools(server);

  // PageSpeed Insights + Core Web Vitals tools
  registerPageSpeedTools(server);

  // SerpAPI tools (Google, Bing, YouTube, Amazon, eBay, etc.)
  registerSerpApiTools(server);

  // Microsoft Clarity tools (traffic analytics, UX metrics)
  registerClarityTools(server);

  // SEO workflow tools and prepared premium connectors
  registerSeoWorkflowTools(server);

  // Bing Webmaster Tools (sites, query/page stats, crawl, URL submission)
  registerBingTools(server);

  // Wayback Machine (snapshots, diffs, historical recovery)
  registerWaybackTools(server);

  // Schema markup validation and extraction
  registerSchemaTools(server);

  // HTTP utilities (redirect chain, headers, robots.txt)
  registerHttpUtilsTools(server);

  // Web server log file analysis
  registerLogTools(server);

  // Historical persistence: keyword universe management, time-series queries, snapshot runs
  registerHistoryTools(server);

  // SEO Agent: backlog of actionable tasks proposed by DeepSeek + Opus
  registerBacklogTools(server);

  // DNA Music brand knowledge (Colombia catalog): keyword mapping + Course schema
  registerBrandKnowledgeTools(server);

  return server;
}
