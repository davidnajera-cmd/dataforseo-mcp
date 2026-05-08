import type { IncomingMessage, ServerResponse } from "node:http";
import { listBacklog, getBacklogTask, updateTaskStatus, addTaskNote, listAgentRuns, BacklogStatus, BacklogPriority, BacklogCategory } from "../src/backlog-store.js";
import { assertVariablesAdminToken, clearRuntimeVariableCache } from "../src/runtime-config.js";
import { clearGoogleAccessTokenCache } from "../src/gsc-client.js";
import { runAgent } from "../src/agent/pipeline.js";

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
    const url = new URL(req.url ?? "/api/backlog", "http://localhost");
    const action = url.searchParams.get("action") ?? "list";

    if (req.method === "GET" && action === "list") {
      const rows = await listBacklog({
        domain: url.searchParams.get("domain") ?? undefined,
        status: (url.searchParams.get("status") as BacklogStatus) ?? undefined,
        priority: (url.searchParams.get("priority") as BacklogPriority) ?? undefined,
        category: (url.searchParams.get("category") as BacklogCategory) ?? undefined,
        limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
      });
      send(res, 200, { rows });
      return;
    }

    if (req.method === "GET" && action === "get") {
      const id = Number(url.searchParams.get("id"));
      const task = await getBacklogTask(id);
      send(res, task ? 200 : 404, task ?? { error: "not_found" });
      return;
    }

    if (req.method === "GET" && action === "runs") {
      const rows = await listAgentRuns(20);
      send(res, 200, { runs: rows });
      return;
    }

    if (req.method === "POST" && action === "run_agent") {
      assertVariablesAdminToken(header(req, "x-admin-token"));
      clearRuntimeVariableCache();
      clearGoogleAccessTokenCache();
      const result = await runAgent();
      send(res, 200, result);
      return;
    }

    if (req.method === "POST" && (action === "update_status" || action === "add_note")) {
      assertVariablesAdminToken(header(req, "x-admin-token"));
      const body = await readJson(req);
      if (action === "update_status") {
        const id = Number(body.id);
        const updated = await updateTaskStatus(id, body.status as BacklogStatus, body.notes as string | undefined, body.assignee as string | undefined);
        send(res, updated ? 200 : 404, updated ?? { error: "not_found" });
        return;
      }
      const id = Number(body.id);
      const note = String(body.note ?? "");
      const stamped = `[${new Date().toISOString()}] ${note}`;
      const updated = await addTaskNote(id, stamped);
      send(res, updated ? 200 : 404, updated ?? { error: "not_found" });
      return;
    }

    send(res, 405, { error: "method_or_action_not_supported" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    send(res, message.includes("token") ? 401 : 500, { error: "backlog_failed", message });
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
