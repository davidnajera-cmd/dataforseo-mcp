import type { IncomingMessage, ServerResponse } from "node:http";
import {
  assertVariablesAdminToken,
  deleteRuntimeVariable,
  listRuntimeVariables,
  setRuntimeVariable,
} from "../src/runtime-config.js";

export default async function handler(
  req: IncomingMessage & { body?: unknown; method?: string; headers: Record<string, string | string[] | undefined> },
  res: ServerResponse
) {
  try {
    if (req.method === "GET") {
      send(res, 200, { variables: await listRuntimeVariables() });
      return;
    }

    assertVariablesAdminToken(header(req, "x-admin-token"));

    if (req.method === "POST") {
      const body = await readJson(req);
      await setRuntimeVariable(String(body.name ?? ""), String(body.value ?? ""));
      send(res, 200, { ok: true, variables: await listRuntimeVariables() });
      return;
    }

    if (req.method === "DELETE") {
      const url = new URL(req.url ?? "/api/variables", "http://localhost");
      await deleteRuntimeVariable(url.searchParams.get("name") ?? "");
      send(res, 200, { ok: true, variables: await listRuntimeVariables() });
      return;
    }

    send(res, 405, { error: "method_not_allowed" });
  } catch (error) {
    send(res, error instanceof Error && error.message.includes("token") ? 401 : 500, {
      error: "variables_failed",
      message: error instanceof Error ? error.message : "Unexpected variables error",
    });
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
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.writeHead(status);
  res.end(JSON.stringify(body));
}
