import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./tools.js";
import { registerGscTools } from "./tools-gsc.js";
import { registerSerpApiTools } from "./tools-serpapi.js";
import { registerClarityTools } from "./tools-clarity.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "SEO MCP Server",
    version: "1.0.0",
  });

  // DataForSEO API tools (SERP, Keywords, Backlinks, OnPage, Labs, etc.)
  registerTools(server);

  // Google Search Console API tools
  registerGscTools(server);

  // SerpAPI tools (Google, Bing, YouTube, Amazon, eBay, etc.)
  registerSerpApiTools(server);

  // Microsoft Clarity tools (traffic analytics, UX metrics)
  registerClarityTools(server);

  return server;
}
