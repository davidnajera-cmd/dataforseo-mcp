import { createServer } from "../src/server.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { MCP_API_KEY_REQUESTS_PER_MINUTE, consumeMcpApiKeyQuota, validateApiKey } from "../src/api-key-auth.js";
import { isValidBundle, type BundleName } from "../src/bundles.js";
import { isMutatingMcpTool, requestedMcpToolName } from "../src/mcp-permissions.js";
import { authorizeMcpToolCall, getMcpToolCapability } from "../src/mcp-capabilities.js";
import { executionRequestFingerprint, executionTraceFinalState, idempotencyKeyFingerprint, normalizeIdempotencyKey, normalizeTraceActorKeyId, redactExecutionArguments } from "../src/mcp-execution-trace.js";
import { finishMcpExecutionRun, startMcpExecutionRun } from "../src/persistence-store.js";
import { randomUUID } from "node:crypto";
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

export function isMcpToolAuthorized(toolName: string, capabilityScopes: readonly string[], allowLegacyMutations: boolean): boolean {
  return authorizeMcpToolCall(toolName, capabilityScopes, allowLegacyMutations).allowed;
}

/**
 * Claude and ChatGPT exchange protocol setup messages before they attach
 * configured static request headers. Permit only non-executable protocol
 * traffic so they can persist the connector configuration; every tool call
 * still requires an API key.
 */
export function isUnauthenticatedConnectorProtocolRequest(body: unknown): boolean {
  const method = typeof body === "object" && body !== null
    ? (body as { method?: unknown }).method
    : undefined;
  return typeof method === "string" && method !== "tools/call";
}

export default async function handler(
  req: IncomingMessage & { body?: unknown; method?: string; headers: Record<string, string | string[] | undefined>; url?: string },
  res: ServerResponse
) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, mcp-session-id, x-api-key, x-mcp-idempotency-key, authorization");
  res.setHeader("Access-Control-Expose-Headers", "mcp-session-id, x-mcp-trace-id");
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
  // The only unauthenticated exception is non-executable connector protocol
  // traffic required by clients before they apply static request headers.
  const apiKey = headerString(req.headers["x-api-key"])
    ?? extractBearer(headerString(req.headers["authorization"]));
  const requireKey = isMcpApiKeyRequired(bundle);
  let completeTrace: (() => Promise<void>) | undefined;

  if (requireKey && !isUnauthenticatedConnectorProtocolRequest(body)) {
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
    const toolName = requestedMcpToolName(body);
    const requestedIdempotencyKey = headerString(req.headers["x-mcp-idempotency-key"]);
    const idempotencyKey = normalizeIdempotencyKey(requestedIdempotencyKey);
    if (requestedIdempotencyKey && !idempotencyKey) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid_idempotency_key", hint: "Use 8-128 letters, digits, dots, colons, underscores, or hyphens." }));
      return;
    }
    const trace = toolName ? (() => {
      const traceId = randomUUID();
      res.setHeader("x-mcp-trace-id", traceId);
      return {
        traceId,
        started: startMcpExecutionRun({
          trace_id: traceId,
          actor_key_id: normalizeTraceActorKeyId(v.id),
          tool_name: toolName,
          operation: getMcpToolCapability(toolName).operation,
          args: redactExecutionArguments(body),
          idempotency_key_hash: idempotencyKey ? idempotencyKeyFingerprint(idempotencyKey) : undefined,
          request_fingerprint: idempotencyKey ? executionRequestFingerprint(body) : undefined,
        }),
      };
    })() : undefined;
    let traceCreated = false;
    if (trace) {
      try {
        const start = await trace.started;
        traceCreated = start.created;
        if (!start.created) {
          res.setHeader("x-mcp-trace-id", start.trace_id);
          res.writeHead(start.same_request ? 409 : 422, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            error: start.same_request ? "idempotency_replay" : "idempotency_key_reused_with_different_request",
            trace_id: start.trace_id,
            status: start.status,
          }));
          return;
        }
      } catch {
        res.writeHead(503, { "Content-Type": "application/json", "Retry-After": "5" });
        res.end(JSON.stringify({ error: "execution_trace_unavailable", hint: "Retry with the same idempotency key." }));
        return;
      }
    }
    completeTrace = async () => {
      if (!trace || !traceCreated) return;
      await finishMcpExecutionRun({ trace_id: trace.traceId, ...executionTraceFinalState(res.statusCode) }).catch(() => undefined);
    };
    const scopedAuthorization = toolName && v.capability_scopes !== null
      ? authorizeMcpToolCall(toolName, v.capability_scopes, false)
      : null;
    if (scopedAuthorization && !scopedAuthorization.allowed) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "forbidden", reason: scopedAuthorization.reason, tool: toolName, required_capability: scopedAuthorization.required_capability }));
      await completeTrace?.();
      return;
    }
    if (!scopedAuthorization && isMutatingMcpTool(toolName) && !v.allow_mutations) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "forbidden", reason: "mutation_permission_required", tool: toolName }));
      await completeTrace?.();
      return;
    }
    const quota = await consumeMcpApiKeyQuota(apiKey!);
    if (!quota.allowed || isMcpRateLimitExceeded(quota.requestCount)) {
      res.writeHead(429, {
        "Content-Type": "application/json",
        "Retry-After": "60",
      });
      res.end(JSON.stringify({ error: "rate_limited", retry_after_seconds: 60 }));
      await completeTrace?.();
      return;
    }
  }

  const server = createServer({ bundle });
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless mode
  });
  await server.connect(transport);

  try {
    await transport.handleRequest(req, res, body);
    await completeTrace?.();
  } catch (error) {
    await completeTrace?.();
    throw error;
  }
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
