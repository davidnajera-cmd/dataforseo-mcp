import type { IncomingMessage, ServerResponse } from "node:http";
import { pullSlackToTasks, pushTasksToSlack } from "../../src/slack-sync.js";
import { getRuntimeVariable, clearRuntimeVariableCache } from "../../src/runtime-config.js";

export const config = { maxDuration: 120 };

export default async function handler(
  req: IncomingMessage & { headers: Record<string, string | string[] | undefined>; method?: string },
  res: ServerResponse
) {
  try {
    clearRuntimeVariableCache();
    const auth = headerValue(req, "authorization");
    const expected = (await getRuntimeVariable("CRON_SECRET")) ?? process.env.CRON_SECRET;
    if (!expected) { send(res, 500, { error: "CRON_SECRET not configured" }); return; }
    const provided = (auth ?? "").replace(/^Bearer\s+/i, "");
    if (provided !== expected) { send(res, 401, { error: "unauthorized" }); return; }

    // Pull first (so we mark items closed in Slack as ejecutada locally),
    // then push (so newly-closed items are not re-pushed as pending).
    const inbound = await pullSlackToTasks();
    const outbound = await pushTasksToSlack(50);
    send(res, 200, { inbound, outbound });
  } catch (error) {
    send(res, 500, { error: "slack_sync_failed", message: error instanceof Error ? error.message : "unknown" });
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
