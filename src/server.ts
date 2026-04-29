import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./tools.js";
import { registerGscTools } from "./tools-gsc.js";
import { registerSerpApiTools } from "./tools-serpapi.js";
import { registerClarityTools } from "./tools-clarity.js";
import { registerGa4Tools } from "./tools-ga4.js";
import { registerPageSpeedTools } from "./tools-pagespeed.js";
import { registerSeoWorkflowTools } from "./tools-seo-workflows.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "SEO MCP Server",
    version: "1.0.0",
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

  return server;
}
