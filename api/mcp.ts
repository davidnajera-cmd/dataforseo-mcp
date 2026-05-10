import { createServer } from "../src/server.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { validateApiKey } from "../src/api-key-auth.js";
import { isValidBundle, type BundleName } from "../src/bundles.js";
import type { IncomingMessage, ServerResponse } from "node:http";

// Set this to true once you want to enforce API keys on the public /mcp
// endpoint. Until then, the endpoint is open (matching the historic
// behaviour Claude.ai connected to). Bundles are still respected via
// query string regardless of auth state.
const REQUIRE_API_KEY_DEFAULT = process.env.MCP_REQUIRE_API_KEY === "true";

export default async function handler(
  req: IncomingMessage & { body?: unknown; method?: string; headers: Record<string, string | string[] | undefined>; url?: string },
  res: ServerResponse
) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, mcp-session-id, x-api-key, authorization");
  res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  // Parse query string for bundle and auth strategy
  const url = new URL(req.url ?? "/api/mcp", "http://localhost");
  const bundleParam = url.searchParams.get("bundle") ?? undefined;
  let bundle: BundleName | undefined = undefined;
  if (bundleParam) {
    if (!isValidBundle(bundleParam)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid_bundle", valid: ["research", "seo", "pauta", "agent", "full"] }));
      return;
    }
    bundle = bundleParam;
  }

  // Auth: x-api-key header (preferred) OR Authorization: Bearer <key>.
  // When a bundle is requested OR the env flag forces it, an API key is required.
  // Default no-bundle (the legacy /mcp) stays open for Claude.ai backwards compat
  // unless MCP_REQUIRE_API_KEY=true in env.
  const apiKey = headerString(req.headers["x-api-key"])
    ?? extractBearer(headerString(req.headers["authorization"]));
  const requireKey = REQUIRE_API_KEY_DEFAULT || bundle !== undefined;

  if (requireKey) {
    const v = await validateApiKey(apiKey);
    if (!v.valid) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized", reason: v.reason, hint: "Provide an API key via x-api-key header or Authorization: Bearer <key>" }));
      return;
    }
    // If the key has a bundle_scope set, enforce that the requested bundle is in scope.
    if (v.bundle_scope && bundle && !v.bundle_scope.includes(bundle)) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "forbidden", reason: "bundle_not_in_key_scope", allowed_bundles: v.bundle_scope }));
      return;
    }
  }

  const server = createServer({ bundle });
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless mode
  });
  await server.connect(transport);

  let body = (req as unknown as { body?: unknown }).body;
  if (!body && req.method === "POST") {
    body = await new Promise<string>((resolve) => {
      let data = "";
      req.on("data", (chunk: Buffer) => { data += chunk.toString(); });
      req.on("end", () => resolve(data));
    });
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { /* keep as string */ }
    }
  }

  await transport.handleRequest(req, res, body);
}

function headerString(h: string | string[] | undefined): string | undefined {
  if (!h) return undefined;
  return Array.isArray(h) ? h[0] : h;
}

function extractBearer(auth: string | undefined): string | undefined {
  if (!auth) return undefined;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : undefined;
}
