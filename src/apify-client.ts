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
      // Translate the most common upstream errors into actionable hints so
      // callers (and the LLM) know what to do.
      let hint = "";
      const lowerBody = body.toLowerCase();
      if (res.status === 402 || lowerBody.includes("payment") || lowerBody.includes("subscription") || lowerBody.includes("hard usage limit")) {
        hint = " — Apify plan does not allow this run. Most ad-library actors are pay-per-event and require Apify Starter ($49/mo) or higher with billing enabled. Upgrade at console.apify.com/billing, or override APIFY_ACTOR_* runtime variable to a free actor.";
      } else if (res.status === 401 || res.status === 403) {
        hint = " — Apify token is invalid or revoked. Regenerate at console.apify.com/account/integrations and update APIFY_API_TOKEN runtime variable.";
      } else if (res.status === 404) {
        hint = ` — Actor '${actorId}' not found on Apify Store. It may have been renamed or removed. Override the APIFY_ACTOR_* runtime variable for this kind, or use apify_run_actor with a current actor ID.`;
      } else if (res.status === 429) {
        hint = " — Apify rate-limited the request. Wait 30-60s and retry, or reduce concurrency.";
      } else if (res.status === 400) {
        hint = " — Actor rejected the input. The actor's input schema may have changed; check its page on apify.com/store and adjust `actor_input_overrides`.";
      }
      throw new ApifyError(`Apify ${res.status} on actor ${actorId}${hint}`, res.status, body.slice(0, 1500));
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

export type ApifyActorKind = "meta" | "google" | "tiktok" | "google_maps" | "web_crawler" | "instagram" | "youtube" | "reddit" | "news" | "tiktok_content" | "tiktok_comments";

export async function getConfiguredActor(kind: ApifyActorKind): Promise<string> {
  const map: Record<ApifyActorKind, { var: string; fallback: string }> = {
    // All ad-library actors on the Apify Store are PAY_PER_EVENT.
    // The FREE Apify tier ($0 hard limit) cannot run these — Apify returns
    // 400/402. To use adlib_*, upgrade Apify to at least Starter ($49/mo)
    // and add billing.
    meta: { var: "APIFY_ACTOR_META_ADLIB", fallback: "apify/facebook-ads-scraper" },
    google: { var: "APIFY_ACTOR_GOOGLE_ADLIB", fallback: "solidcode/ads-transparency-scraper" },
    tiktok: { var: "APIFY_ACTOR_TIKTOK_ADLIB", fallback: "burbn/tiktok-top-ads-spy" },
    google_maps: { var: "APIFY_ACTOR_GOOGLE_MAPS", fallback: "compass/crawler-google-places" },
    web_crawler: { var: "APIFY_ACTOR_WEB_CRAWLER", fallback: "apify/website-content-crawler" },
    instagram: { var: "APIFY_ACTOR_INSTAGRAM", fallback: "apify/instagram-scraper" },
    youtube: { var: "APIFY_ACTOR_YOUTUBE", fallback: "happitap/youtube-transcript-scraper" },
    reddit: { var: "APIFY_ACTOR_REDDIT", fallback: "trudax/reddit-scraper-lite" },
    news: { var: "APIFY_ACTOR_NEWS", fallback: "data_xplorer/google-news-scraper-fast" },
    tiktok_content: { var: "APIFY_ACTOR_TIKTOK_CONTENT", fallback: "clockworks/tiktok-scraper" },
    tiktok_comments: { var: "APIFY_ACTOR_TIKTOK_COMMENTS", fallback: "apidojo/tiktok-comments-scraper" },
  };
  const entry = map[kind];
  const configured = await getRuntimeVariable(entry.var);
  return (configured && configured.trim() !== "") ? configured : entry.fallback;
}
