import { getRuntimeVariable } from "./runtime-config.js";

const PAGESPEED_BASE = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

export type PageSpeedStrategy = "mobile" | "desktop";
export type PageSpeedCategory = "performance" | "accessibility" | "best-practices" | "seo" | "pwa";

export async function runPageSpeed(
  url: string,
  options: {
    strategy?: PageSpeedStrategy;
    categories?: PageSpeedCategory[];
    locale?: string;
  } = {}
): Promise<unknown> {
  const apiKey = await getRuntimeVariable("PAGESPEED_API_KEY");
  if (!apiKey) throw new Error("PAGESPEED_API_KEY environment variable is required");

  const params = new URLSearchParams({
    url,
    key: apiKey,
    strategy: options.strategy ?? "mobile",
    locale: options.locale ?? "es",
  });

  for (const category of options.categories ?? ["performance", "accessibility", "best-practices", "seo"]) {
    params.append("category", category);
  }

  const res = await fetch(`${PAGESPEED_BASE}?${params.toString()}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PageSpeed API error ${res.status}: ${text}`);
  }
  return res.json();
}

export function summarizePageSpeed(raw: unknown) {
  const data = raw as Record<string, any>;
  const lighthouse = data.lighthouseResult ?? {};
  const categories = lighthouse.categories ?? {};
  const audits = lighthouse.audits ?? {};
  const loading = data.loadingExperience?.metrics ?? {};

  return {
    url: data.id,
    strategy: data.analysisUTCTimestamp ? undefined : undefined,
    scores: {
      performance: score(categories.performance?.score),
      accessibility: score(categories.accessibility?.score),
      bestPractices: score(categories["best-practices"]?.score),
      seo: score(categories.seo?.score),
    },
    lab: {
      lcp: audits["largest-contentful-paint"]?.displayValue,
      cls: audits["cumulative-layout-shift"]?.displayValue,
      inp: audits["interaction-to-next-paint"]?.displayValue,
      speedIndex: audits["speed-index"]?.displayValue,
      tbt: audits["total-blocking-time"]?.displayValue,
    },
    field: {
      lcp: loading.LARGEST_CONTENTFUL_PAINT_MS?.percentile,
      cls: loading.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile,
      inp: loading.INTERACTION_TO_NEXT_PAINT?.percentile,
    },
    opportunities: Object.values(audits)
      .filter((audit: any) => audit?.details?.type === "opportunity" && typeof audit.score === "number" && audit.score < 0.9)
      .map((audit: any) => ({
        id: audit.id,
        title: audit.title,
        displayValue: audit.displayValue,
        score: audit.score,
      }))
      .slice(0, 8),
  };
}

function score(value: unknown): number | null {
  return typeof value === "number" ? Math.round(value * 100) : null;
}
