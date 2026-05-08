import type { IncomingMessage, ServerResponse } from "node:http";
import { runAgent } from "../../src/agent/pipeline.js";
import { getRuntimeVariable, clearRuntimeVariableCache } from "../../src/runtime-config.js";
import { clearGoogleAccessTokenCache } from "../../src/gsc-client.js";

export const config = { maxDuration: 300 };

export default async function handler(
  req: IncomingMessage & { headers: Record<string, string | string[] | undefined>; method?: string },
  res: ServerResponse
) {
  try {
    clearRuntimeVariableCache();
    clearGoogleAccessTokenCache();
    const auth = headerValue(req, "authorization");
    const expected = (await getRuntimeVariable("CRON_SECRET")) ?? process.env.CRON_SECRET;
    if (!expected) { send(res, 500, { error: "CRON_SECRET not configured" }); return; }
    const provided = (auth ?? "").replace(/^Bearer\s+/i, "");
    if (provided !== expected) { send(res, 401, { error: "unauthorized" }); return; }
    const result = await runAgent();
    send(res, 200, result);
  } catch (error) {
    send(res, 500, { error: "agent_run_failed", message: error instanceof Error ? error.message : "unknown" });
  }
}

function headerValue(req: IncomingMessage & { headers: Record<string, string | string[] | undefined> }, name: string): string | undefined {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v;
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.writeHead(status);
  res.end(JSON.stringify(body));
}
