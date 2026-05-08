import type { IncomingMessage, ServerResponse } from "node:http";
import { runSnapshot, defaultDailyTasks, defaultWeeklyTasks } from "../../src/snapshots/index.js";
import { getRuntimeVariable } from "../../src/runtime-config.js";

export const config = { maxDuration: 300 };

export default async function handler(
  req: IncomingMessage & { headers: Record<string, string | string[] | undefined>; method?: string },
  res: ServerResponse
) {
  try {
    const auth = headerValue(req, "authorization");
    const expected = (await getRuntimeVariable("CRON_SECRET")) ?? process.env.CRON_SECRET;
    if (!expected) {
      send(res, 500, { error: "CRON_SECRET not configured" });
      return;
    }
    const provided = (auth ?? "").replace(/^Bearer\s+/i, "");
    if (provided !== expected) {
      send(res, 401, { error: "unauthorized" });
      return;
    }

    const isMonday = new Date().getUTCDay() === 1;
    const tasks = isMonday ? defaultWeeklyTasks() : defaultDailyTasks();
    const result = await runSnapshot(tasks);
    send(res, 200, { ...result, scheduled: isMonday ? "weekly" : "daily" });
  } catch (error) {
    send(res, 500, {
      error: "snapshot_failed",
      message: error instanceof Error ? error.message : "Unexpected snapshot error",
    });
  }
}

function headerValue(req: IncomingMessage & { headers: Record<string, string | string[] | undefined> }, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.writeHead(status);
  res.end(JSON.stringify(body));
}
