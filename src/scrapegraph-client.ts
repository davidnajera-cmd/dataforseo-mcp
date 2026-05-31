import { getRuntimeVariable } from "./runtime-config.js";

const SCRAPEGRAPH_BASE = "https://v2-api.scrapegraphai.com/api";
const DEFAULT_TIMEOUT_MS = 120_000;

export class ScrapeGraphError extends Error {
  status: number;
  body: string;

  constructor(message: string, status: number, body: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

type ScrapeGraphSuccess<T> = {
  status: "success";
  data: T;
};

export type ExtractResponse = ScrapeGraphSuccess<{
  id?: string;
  json?: unknown;
  raw?: unknown;
  usage?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}>;

export type SearchResponse = ScrapeGraphSuccess<{
  id?: string;
  results?: unknown[];
  json?: unknown;
  referenceUrls?: string[];
  metadata?: Record<string, unknown>;
}>;

export type ScrapeResponse = ScrapeGraphSuccess<{
  id?: string;
  results?: Record<string, { data?: unknown; metadata?: Record<string, unknown> }>;
  metadata?: Record<string, unknown>;
}>;

export type CrawlResponse = ScrapeGraphSuccess<{
  id?: string;
  status?: "running" | "completed" | "failed" | "stopped" | string;
  total?: number;
  finished?: number;
  pages?: unknown[];
  error?: string;
}>;

export type CreditsResponse = ScrapeGraphSuccess<Record<string, unknown>>;

export type HistoryListResponse = ScrapeGraphSuccess<Record<string, unknown>>;

export type HistoryEntryResponse = ScrapeGraphSuccess<Record<string, unknown>>;

export async function getScrapeGraphApiKey(): Promise<string> {
  const apiKey = await getRuntimeVariable("SGAI_API_KEY");
  if (!apiKey) {
    throw new Error("SGAI_API_KEY not configured. Add it in the Variables panel of the dashboard.");
  }
  return apiKey;
}

export async function smartScraper(
  website_url: string,
  user_prompt: string,
  output_schema?: Record<string, unknown>,
): Promise<ExtractResponse> {
  const data = await scrapeGraphFetch<ExtractResponse["data"]>("/extract", {
    url: website_url,
    prompt: user_prompt,
    ...(output_schema ? { schema: output_schema } : {}),
  });
  return { status: "success", data };
}

export async function searchScraper(
  user_prompt: string,
  num_results = 3,
): Promise<SearchResponse> {
  const data = await scrapeGraphFetch<SearchResponse["data"]>("/search", {
    query: user_prompt,
    numResults: num_results,
  });
  return { status: "success", data };
}

export async function markdownify(
  website_url: string,
): Promise<ScrapeResponse> {
  const data = await scrapeGraphFetch<ScrapeResponse["data"]>("/scrape", {
    url: website_url,
    formats: [{ type: "markdown" }],
  });
  return { status: "success", data };
}

export async function crawlStart(payload: {
  url: string;
  formats?: Array<Record<string, unknown>>;
  maxPages?: number;
  maxDepth?: number;
  maxLinksPerPage?: number;
  includePatterns?: string[];
  excludePatterns?: string[];
  fetchConfig?: Record<string, unknown>;
}): Promise<CrawlResponse> {
  const data = await scrapeGraphFetch<CrawlResponse["data"]>("/crawl", payload);
  return { status: "success", data };
}

export async function crawlGetStatus(id: string): Promise<CrawlResponse> {
  const data = await scrapeGraphGet<CrawlResponse["data"]>(`/crawl/${encodeURIComponent(id)}`);
  return { status: "success", data };
}

export async function crawlStop(id: string): Promise<CrawlResponse> {
  const data = await scrapeGraphFetch<CrawlResponse["data"]>(`/crawl/${encodeURIComponent(id)}/stop`, {});
  return { status: "success", data };
}

export async function crawlResume(id: string): Promise<CrawlResponse> {
  const data = await scrapeGraphFetch<CrawlResponse["data"]>(`/crawl/${encodeURIComponent(id)}/resume`, {});
  return { status: "success", data };
}

export async function getCredits(): Promise<CreditsResponse> {
  const data = await scrapeGraphGet<CreditsResponse["data"]>("/credits");
  return { status: "success", data };
}

export async function listHistory(params: {
  service?: string;
  page?: number;
  limit?: number;
} = {}): Promise<HistoryListResponse> {
  const data = await scrapeGraphGet<HistoryListResponse["data"]>("/history", params);
  return { status: "success", data };
}

export async function getHistoryEntry(id: string): Promise<HistoryEntryResponse> {
  const data = await scrapeGraphGet<HistoryEntryResponse["data"]>(`/history/${encodeURIComponent(id)}`);
  return { status: "success", data };
}

async function scrapeGraphFetch<T>(
  endpoint: string,
  payload: Record<string, unknown>,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const apiKey = await getScrapeGraphApiKey();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${SCRAPEGRAPH_BASE}${normalizeEndpoint(endpoint)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "SGAI-APIKEY": apiKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw buildScrapeGraphHttpError(endpoint, response.status, body);
    }

    return await response.json() as T;
  } catch (error) {
    if (error instanceof ScrapeGraphError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`ScrapeGraph ${endpoint} timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function scrapeGraphGet<T>(
  endpoint: string,
  query?: Record<string, unknown>,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const apiKey = await getScrapeGraphApiKey();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === undefined || value === null || value === "") continue;
      params.set(key, String(value));
    }
    const url = `${SCRAPEGRAPH_BASE}${normalizeEndpoint(endpoint)}${params.size ? `?${params.toString()}` : ""}`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "SGAI-APIKEY": apiKey,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw buildScrapeGraphHttpError(endpoint, response.status, body);
    }

    return await response.json() as T;
  } catch (error) {
    if (error instanceof ScrapeGraphError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`ScrapeGraph ${endpoint} timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function buildScrapeGraphHttpError(endpoint: string, status: number, body: string) {
  const lowerBody = body.toLowerCase();
  let hint = "";
  if (status === 401) {
    hint = " — Missing SGAI-APIKEY header. Verify the runtime variable is being read correctly.";
  } else if (status === 403) {
    hint = " — SGAI_API_KEY is invalid or deprecated for the v2 API. Rotate it in the ScrapeGraphAI dashboard.";
  } else if (status === 402 || lowerBody.includes("credits") || lowerBody.includes("payment")) {
    hint = " — ScrapeGraphAI credits exhausted or billing required. Top up or upgrade the plan before retrying.";
  } else if (status === 429) {
    hint = " — ScrapeGraphAI rate limited the request. Wait a bit and retry with lower concurrency.";
  } else if (status === 400 || status === 422 || lowerBody.includes("validation")) {
    hint = " — ScrapeGraphAI rejected the payload. Verify fields like url, prompt, schema, query, or formats.";
  } else if (status >= 500) {
    hint = " — Upstream server error. Retry after a short wait or check ScrapeGraphAI status.";
  }
  return new ScrapeGraphError(`ScrapeGraph ${status} on ${normalizeEndpoint(endpoint)}${hint}`, status, body.slice(0, 2000));
}

function normalizeEndpoint(endpoint: string) {
  return endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
}
