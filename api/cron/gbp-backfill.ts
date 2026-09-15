import type { IncomingMessage, ServerResponse } from "node:http";
import { backfillGoogleBusinessFromZernio } from "../../src/google-business-store.js";
import { getRuntimeVariable, clearRuntimeVariableCache } from "../../src/runtime-config.js";

export const config = { maxDuration: 280 };

export default async function handler(
  req: IncomingMessage & { headers: Record<string, string | string[] | undefined>; method?: string },
  res: ServerResponse
) {
  try {
    clearRuntimeVariableCache();
    const auth = headerValue(req, "authorization");
    // See api/cron/snapshot.ts: the Vercel project env var is what Vercel's cron
    // invoker actually sends, so it must take precedence over the DB-stored copy.
    const expected = process.env.CRON_SECRET ?? (await getRuntimeVariable("CRON_SECRET"));
    if (!expected) { send(res, 500, { error: "CRON_SECRET not configured" }); return; }
    const provided = (auth ?? "").replace(/^Bearer\s+/i, "");
    if (provided !== expected) { send(res, 401, { error: "unauthorized" }); return; }

    const result = await backfillGoogleBusinessFromZernio();
    send(res, 200, result);
  } catch (error) {
    send(res, 500, { error: "gbp_backfill_failed", message: error instanceof Error ? error.message : "unknown" });
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
