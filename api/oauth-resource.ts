import type { IncomingMessage, ServerResponse } from "node:http";

export default function handler(_req: IncomingMessage, res: ServerResponse) {
  res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" });
  res.end(JSON.stringify({ resource: "https://dataforseo-mcp-three.vercel.app/mcp", authorization_servers: ["https://dataforseo-mcp-three.vercel.app"], bearer_methods_supported: ["header"], scopes_supported: ["mcp"] }));
}
