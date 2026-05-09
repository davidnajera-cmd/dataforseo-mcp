// Thin client around the Apify v2 REST API. Apify hosts community-built and
// official "actors" (scrapers) — for our purposes we use it to access ads
// libraries that have no official API in LATAM (Meta, Google, TikTok).
//
// Required runtime variable:
//   APIFY_API_TOKEN  — Personal API token from https://console.apify.com/account/integrations
//
// Optional runtime variables (default to known actors; user can override at
// runtime if a better one ships):
//   APIFY_ACTOR_META_ADLIB    e.g. "curious_coder/facebook-ads-library-scraper"
//   APIFY_ACTOR_GOOGLE_ADLIB  e.g. "apify/google-ads-transparency-center-scraper"
//   APIFY_ACTOR_TIKTOK_ADLIB  e.g. "apify/tiktok-commercial-content-api-scraper"

import { getRuntimeVariable } from "./runtime-config.js";

const APIFY_BASE = "https://api.apify.com/v2";
const DEFAULT_TIMEOUT_MS = 240_000;  // Apify run-sync max wait; serverless limit is 300s on Vercel.

export class ApifyError extends Error {
  status: number;
  body: string;
  constructor(message: string, status: number, body: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function getApifyToken(): Promise<string> {
  const token = await getRuntimeVariable("APIFY_API_TOKEN");
  if (!token) {
    throw new Error("APIFY_API_TOKEN not configured. Add it in the Variables panel of the dashboard.");
  }
  return token;
}

// Run an actor synchronously and return only the dataset items (the actual
// scraped data). Apify queues the run, executes it, and streams the result
// back when complete. If it doesn't finish within the timeout, Apify returns
// a 408. For most ad-library scrapes this completes in 30-90s.
export async function runActorSync<T = unknown>(
  actorId: string,
  input: unknown,
  options: { timeout_ms?: number; max_items?: number } = {},
): Promise<T[]> {
  if (!actorId || actorId.trim() === "") {
    throw new Error(`Apify actor ID is empty. Configure the runtime variable that points to the actor you want to run.`);
  }
  const token = await getApifyToken();
  const params = new URLSearchParams();
  params.set("token", token);
  if (options.max_items !== undefined) params.set("maxItems", String(options.max_items));
  // The actor ID can be either "owner/name" or a 17-char hash. The endpoint
  // accepts both, but slashes need URL encoding.
  const encodedActor = actorId.includes("/") ? actorId.replace("/", "~") : actorId;
  const url = `${APIFY_BASE}/acts/${encodedActor}/run-sync-get-dataset-items?${params.toString()}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout_ms ?? DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input ?? {}),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new ApifyError(`Apify ${res.status} ${res.statusText} on actor ${actorId}`, res.status, body.slice(0, 1500));
    }
    const items = await res.json();
    return Array.isArray(items) ? (items as T[]) : [items as T];
  } catch (err) {
    if (err instanceof ApifyError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Apify actor ${actorId} did not finish within ${options.timeout_ms ?? DEFAULT_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function getConfiguredActor(kind: "meta" | "google" | "tiktok"): Promise<string> {
  const map = {
    meta: { var: "APIFY_ACTOR_META_ADLIB", fallback: "curious_coder/facebook-ads-library-scraper" },
    google: { var: "APIFY_ACTOR_GOOGLE_ADLIB", fallback: "apify/google-ads-transparency-center-scraper" },
    tiktok: { var: "APIFY_ACTOR_TIKTOK_ADLIB", fallback: "apify/tiktok-commercial-content-api-scraper" },
  } as const;
  const entry = map[kind];
  const configured = await getRuntimeVariable(entry.var);
  return (configured && configured.trim() !== "") ? configured : entry.fallback;
}
