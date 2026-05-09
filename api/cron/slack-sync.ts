import type { IncomingMessage, ServerResponse } from "node:http";
import { pullSlackToTasks, pushTasksToSlack, pushClosedTasksToSlack } from "../../src/slack-sync.js";
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

    // Order matters:
    //  1. Pull from Slack (marks Slack-completed items as ejecutada locally).
    //  2. Push closed (writes ejecutada/descartada local statuses back to Slack
    //     as completed=true + Estado=Completadas).
    //  3. Push open (creates/refreshes pending and en_progreso items in Slack).
    const inbound = await pullSlackToTasks();
    const closed = await pushClosedTasksToSlack();
    const outbound = await pushTasksToSlack(50);
    send(res, 200, { inbound, closed, outbound });
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
