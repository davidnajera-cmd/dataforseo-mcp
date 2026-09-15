import type { IncomingMessage, ServerResponse } from "node:http";
import { recordWebLead, type WebLeadInput } from "../src/persistence-store.js";

export const config = { maxDuration: 30 };

type IncomingLead = {
  external_id?: unknown;
  domain?: unknown;
  source_url?: unknown;
  utm_source?: unknown;
  utm_medium?: unknown;
  utm_campaign?: unknown;
  utm_content?: unknown;
  utm_term?: unknown;
  channel?: unknown;
  name?: unknown;
  phone?: unknown;
  email?: unknown;
  received_at?: unknown;
  metadata?: unknown;
};

export default async function handler(
  req: IncomingMessage & { headers: Record<string, string | string[] | undefined>; method?: string; body?: unknown },
  res: ServerResponse
) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== "POST") {
    send(res, 405, { error: "method_not_allowed" });
    return;
  }

  try {
    // Deliberately process.env only, no DB-stored fallback: this secret authenticates an
    // external system (Dream CRM), not our own scheduler, so it must never silently drift
    // out of sync the way CRON_SECRET did when a DB copy shadowed the real Vercel value.
    const expected = process.env.DREAM_CRM_WEBHOOK_SECRET;
    if (!expected) {
      send(res, 500, { error: "webhook_not_configured", message: "DREAM_CRM_WEBHOOK_SECRET is not set." });
      return;
    }
    const provided = (headerValue(req, "authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (provided !== expected) {
      send(res, 401, { error: "unauthorized" });
      return;
    }

    const body = await readJson(req);
    const items: IncomingLead[] = Array.isArray(body) ? body : [body];
    if (items.length === 0) {
      send(res, 400, { error: "empty_payload", message: "Send a lead object or a non-empty array of lead objects." });
      return;
    }

    const results: Array<{ ok: true; id: number; deduped: boolean } | { ok: false; error: string }> = [];
    for (const item of items) {
      try {
        results.push({ ok: true, ...(await recordWebLead(toLeadInput(item))) });
      } catch (error) {
        results.push({ ok: false, error: error instanceof Error ? error.message : "unknown error" });
      }
    }

    const allFailed = results.every((r) => !r.ok);
    send(res, allFailed ? 400 : 200, Array.isArray(body) ? { results } : { ...results[0] });
  } catch (error) {
    send(res, 500, {
      error: "leads_webhook_failed",
      message: error instanceof Error ? error.message : "Unexpected leads webhook error",
    });
  }
}

function toLeadInput(item: IncomingLead): WebLeadInput {
  if (typeof item !== "object" || item === null) {
    throw new Error("Each lead must be a JSON object.");
  }
  const sourceUrl = stringOrNull(item.source_url);
  const externalId = stringOrNull(item.external_id);
  if (!sourceUrl && !externalId) {
    throw new Error("Each lead needs at least source_url or external_id.");
  }
  return {
    external_id: externalId,
    domain: stringOrNull(item.domain) ?? deriveDomain(sourceUrl),
    source_url: sourceUrl,
    utm_source: stringOrNull(item.utm_source),
    utm_medium: stringOrNull(item.utm_medium),
    utm_campaign: stringOrNull(item.utm_campaign),
    utm_content: stringOrNull(item.utm_content),
    utm_term: stringOrNull(item.utm_term),
    channel: stringOrNull(item.channel),
    name: stringOrNull(item.name),
    phone: stringOrNull(item.phone),
    email: stringOrNull(item.email),
    received_at: stringOrNull(item.received_at),
    metadata: item.metadata,
  };
}

function deriveDomain(sourceUrl: string | null): string | null {
  if (!sourceUrl) return null;
  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function headerValue(req: IncomingMessage & { headers: Record<string, string | string[] | undefined> }, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

async function readJson(req: IncomingMessage & { body?: unknown }): Promise<unknown> {
  if (req.body !== undefined) {
    return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  }
  const raw = await new Promise<string>((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: Buffer) => { data += chunk.toString(); });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
  if (!raw) throw new Error("Empty request body.");
  return JSON.parse(raw);
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.writeHead(status);
  res.end(JSON.stringify(body));
}
