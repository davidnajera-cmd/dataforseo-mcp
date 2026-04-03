import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./tools.js";
import { registerGscTools } from "./tools-gsc.js";
import { registerSerpApiTools } from "./tools-serpapi.js";

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

  return server;
}
