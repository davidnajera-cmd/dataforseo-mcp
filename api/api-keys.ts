import type { IncomingMessage, ServerResponse } from "node:http";
import { createApiKey, listApiKeys, revokeApiKey } from "../src/api-key-auth.js";
import { assertVariablesAdminToken } from "../src/runtime-config.js";
import { isValidBundle } from "../src/bundles.js";
import { isValidMcpCapabilityScope } from "../src/mcp-capabilities.js";

export function parseRequestedCapabilityScopes(value: unknown): { valid: boolean; scopes: string[] } {
  if (value === undefined) return { valid: true, scopes: [] };
  if (!Array.isArray(value) || !value.every(isValidMcpCapabilityScope)) return { valid: false, scopes: [] };
  return { valid: true, scopes: [...new Set(value)] };
}

export default async function handler(
  req: IncomingMessage & { body?: unknown; method?: string; headers: Record<string, string | string[] | undefined>; url?: string },
  res: ServerResponse
) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-admin-token");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  try {
    assertVariablesAdminToken(headerString(req.headers["x-admin-token"]));

    const url = new URL(req.url ?? "/api/api-keys", "http://localhost");
    const action = url.searchParams.get("action") ?? (req.method === "GET" ? "list" : "create");

    if (req.method === "GET" && action === "list") {
      const includeRevoked = url.searchParams.get("include_revoked") === "true";
      const rows = await listApiKeys(includeRevoked);
      // Never return key_hash in the response
      const safe = rows.map((r) => ({
        id: r.id,
        name: r.name,
        created_at: r.created_at,
        last_used_at: r.last_used_at,
        revoked_at: r.revoked_at,
        request_count: Number(r.request_count),
        allow_mutations: r.allow_mutations,
        capability_scopes: r.capability_scopes,
      }));
      send(res, 200, { keys: safe });
      return;
    }

    if (req.method === "POST" && action === "create") {
      const body = await readJson(req);
      const name = String(body.name ?? "").trim();
      if (!name) { send(res, 400, { error: "name_required" }); return; }
      const bundleScope = Array.isArray(body.bundle_scope) ? (body.bundle_scope as string[]).filter(isValidBundle) : undefined;
      const allowMutations = body.allow_mutations === true;
      const parsedScopes = parseRequestedCapabilityScopes(body.capability_scopes);
      if (!parsedScopes.valid) { send(res, 400, { error: "invalid_capability_scope" }); return; }
      if (allowMutations && parsedScopes.scopes.length === 0) {
        send(res, 400, { error: "mutation_scopes_required", hint: "Provide explicit capability_scopes for every new mutating key." });
        return;
      }
      const capabilityScopes = parsedScopes.scopes.length > 0 ? parsedScopes.scopes : undefined;
      const created = await createApiKey(name, bundleScope, allowMutations, capabilityScopes);
      // The raw key is returned ONCE here. Caller must save it.
      send(res, 201, {
        id: created.id,
        name: created.name,
        key: created.key,
        bundle_scope: bundleScope ?? null,
        allow_mutations: allowMutations,
        capability_scopes: capabilityScopes ?? null,
        warning: "Esta es la única vez que verás la llave en texto plano. Guárdala ahora.",
      });
      return;
    }

    if (req.method === "POST" && action === "revoke") {
      const body = await readJson(req);
      const id = Number(body.id);
      if (!id) { send(res, 400, { error: "id_required" }); return; }
      const ok = await revokeApiKey(id);
      send(res, ok ? 200 : 404, { revoked: ok, id });
      return;
    }

    send(res, 405, { error: "method_or_action_not_supported" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    send(res, message.includes("token") ? 401 : 500, { error: "api_keys_failed", message });
  }
}

async function readJson(req: IncomingMessage & { body?: unknown }) {
  if (req.body && typeof req.body === "object") return req.body as Record<string, unknown>;
  const raw = await new Promise<string>((resolve) => {
    let data = "";
    req.on("data", (chunk: Buffer) => { data += chunk.toString(); });
    req.on("end", () => resolve(data));
  });
  return raw ? JSON.parse(raw) as Record<string, unknown> : {};
}

function headerString(h: string | string[] | undefined): string | undefined {
  if (!h) return undefined;
  return Array.isArray(h) ? h[0] : h;
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.writeHead(status);
  res.end(JSON.stringify(body));
}
