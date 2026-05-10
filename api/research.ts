import type { IncomingMessage, ServerResponse } from "node:http";
import { startResearch, approveAndExecute } from "../src/agent/research-pipeline.js";
import { getBrief, listBriefs, listEntities } from "../src/research-store.js";
import { assertVariablesAdminToken, clearRuntimeVariableCache } from "../src/runtime-config.js";
import { clearGoogleAccessTokenCache } from "../src/gsc-client.js";

export const config = { maxDuration: 300 };

export default async function handler(
  req: IncomingMessage & { body?: unknown; method?: string; headers: Record<string, string | string[] | undefined>; url?: string },
  res: ServerResponse
) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-admin-token");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  try {
    const url = new URL(req.url ?? "/api/research", "http://localhost");
    const action = url.searchParams.get("action") ?? "list";

    if (req.method === "GET" && action === "list") {
      const status = url.searchParams.get("status") as "planning" | "awaiting_approval" | "running" | "completed" | "failed" | null;
      const geo = url.searchParams.get("geo");
      const domain = url.searchParams.get("domain");
      const limit = url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined;
      const rows = await listBriefs({ status: status ?? undefined, geo_contains: geo ?? undefined, domain_contains: domain ?? undefined, limit });
      send(res, 200, { briefs: rows });
      return;
    }

    if (req.method === "GET" && action === "get") {
      const id = Number(url.searchParams.get("id"));
      const brief = await getBrief(id);
      send(res, brief ? 200 : 404, brief ?? { error: "not_found" });
      return;
    }

    if (req.method === "GET" && action === "entities") {
      const entityType = url.searchParams.get("type") as "brand" | "competitor" | "keyword" | "url" | "sede" | "program" | "hashtag" | "media_outlet" | null;
      const limit = url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined;
      const rows = await listEntities({ entity_type: entityType ?? undefined, limit });
      send(res, 200, { entities: rows });
      return;
    }

    if (req.method === "POST" && action === "plan") {
      assertVariablesAdminToken(header(req, "x-admin-token"));
      clearRuntimeVariableCache();
      clearGoogleAccessTokenCache();
      const body = await readJson(req);
      const result = await startResearch({
        question: String(body.question ?? "").trim(),
        parent_brief_id: body.parent_brief_id ? Number(body.parent_brief_id) : undefined,
        requested_by: body.requested_by ? String(body.requested_by) : undefined,
        auto_approve: false,
      });
      send(res, 200, result);
      return;
    }

    if (req.method === "POST" && action === "approve") {
      assertVariablesAdminToken(header(req, "x-admin-token"));
      clearRuntimeVariableCache();
      clearGoogleAccessTokenCache();
      const body = await readJson(req);
      const id = Number(body.id);
      const approvedBy = String(body.approved_by ?? "admin");
      const result = await approveAndExecute(id, approvedBy);
      send(res, 200, result);
      return;
    }

    if (req.method === "POST" && action === "auto_run") {
      assertVariablesAdminToken(header(req, "x-admin-token"));
      clearRuntimeVariableCache();
      clearGoogleAccessTokenCache();
      const body = await readJson(req);
      const result = await startResearch({
        question: String(body.question ?? "").trim(),
        parent_brief_id: body.parent_brief_id ? Number(body.parent_brief_id) : undefined,
        requested_by: body.requested_by ? String(body.requested_by) : undefined,
        auto_approve: true,
      });
      send(res, 200, result);
      return;
    }

    send(res, 405, { error: "method_or_action_not_supported" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    send(res, message.includes("token") ? 401 : 500, { error: "research_failed", message });
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

function header(req: IncomingMessage & { headers: Record<string, string | string[] | undefined> }, name: string) {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v;
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.writeHead(status);
  res.end(JSON.stringify(body));
}
