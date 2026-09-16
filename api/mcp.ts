import { createServer } from "../src/server.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { MCP_API_KEY_REQUESTS_PER_MINUTE, consumeMcpApiKeyQuota, validateApiKey } from "../src/api-key-auth.js";
import { isValidBundle, type BundleName } from "../src/bundles.js";
import type { IncomingMessage, ServerResponse } from "node:http";

// Some tools (seo_legacy_redirect_audit, bulk URL inspection, Apify scrapers,
// AI optimization LLM calls) routinely run 30-120s. Default Vercel function
// timeout is 60s — bump to 300s so the MCP can finish long-running tool calls
// without truncation. Per-tool internal time budgets still apply.
export const config = { maxDuration: 300 };

// The MCP endpoint provides access to paid providers and mutating workflows.
// Authentication is therefore mandatory for every bundle, including the
// default full bundle. Never make public access depend on an environment flag.
export function isMcpApiKeyRequired(_bundle: BundleName | undefined): boolean {
  return true;
}

export function isMcpRateLimitExceeded(requestCount: number): boolean {
  return requestCount > MCP_API_KEY_REQUESTS_PER_MINUTE;
}

/**
 * Claude and ChatGPT probe a remote MCP server with `initialize` and
 * `tools/list` before they attach configured static request headers. Permit
 * only that discovery exchange so they can persist the connector
 * configuration; every executable MCP operation still requires an API key.
 */
export function isUnauthenticatedConnectorDiscovery(body: unknown): boolean {
  return typeof body === "object"
    && body !== null
    && ["initialize", "tools/list"].includes((body as { method?: unknown }).method as string);
}

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

  // Auth: x-api-key header (preferred) OR Authorization: Bearer <key>.
  // The only unauthenticated exception is connector discovery required by
  // clients before they apply static request headers.
  const apiKey = headerString(req.headers["x-api-key"])
    ?? extractBearer(headerString(req.headers["authorization"]));
  const requireKey = isMcpApiKeyRequired(bundle);

  if (requireKey && !isUnauthenticatedConnectorDiscovery(body)) {
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
    const quota = await consumeMcpApiKeyQuota(apiKey!);
    if (!quota.allowed || isMcpRateLimitExceeded(quota.requestCount)) {
      res.writeHead(429, {
        "Content-Type": "application/json",
        "Retry-After": "60",
      });
      res.end(JSON.stringify({ error: "rate_limited", retry_after_seconds: 60 }));
      return;
    }
  }

  const server = createServer({ bundle });
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless mode
  });
  await server.connect(transport);

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
