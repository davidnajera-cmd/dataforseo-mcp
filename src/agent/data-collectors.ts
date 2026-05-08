import { post, get } from "../dataforseo-client.js";
import { gscPost } from "../gsc-client.js";
import { getRuntimeVariable } from "../runtime-config.js";
import { getLatestBacklinks, getBacklinksTrend, getLatestDomainRankings, getLatestLlmVisibility, getTrafficTrend } from "../persistence-store.js";

export type SiteContext = {
  domain: string;
  gscProperty: string | null;
  countryCode: "co" | "mx";
  locationCode: number;
};

export async function loadSiteContexts(): Promise<SiteContext[]> {
  const out: SiteContext[] = [];
  const co_domain = await getRuntimeVariable("DNA_DOMAIN_CO");
  const co_site = await getRuntimeVariable("DNA_SITE_CO");
  if (co_domain) out.push({ domain: co_domain, gscProperty: co_site ?? null, countryCode: "co", locationCode: Number(await getRuntimeVariable("DNA_LOCATION_CO") ?? 2170) });

  const mx_domain = await getRuntimeVariable("DNA_DOMAIN_MX");
  const mx_site = await getRuntimeVariable("DNA_SITE_MX");
  if (mx_domain) out.push({ domain: mx_domain, gscProperty: mx_site ?? null, countryCode: "mx", locationCode: Number(await getRuntimeVariable("DNA_LOCATION_MX") ?? 2484) });

  const lta_domain = await getRuntimeVariable("DNA_DOMAIN_LTA");
  const lta_site = await getRuntimeVariable("DNA_SITE_LTA");
  if (lta_domain) out.push({ domain: lta_domain, gscProperty: lta_site ?? null, countryCode: "co", locationCode: Number(await getRuntimeVariable("DNA_LOCATION_LTA") ?? 2170) });

  return out;
}

export type GscOpportunity = { query: string; page: string; clicks: number; impressions: number; ctr: number; position: number; opportunity_score: number };

export async function collectGscOpportunities(site: SiteContext, days: number = 28): Promise<GscOpportunity[]> {
  if (!site.gscProperty) return [];
  const today = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  try {
    const result = await gscPost(`/sites/${encodeURIComponent(site.gscProperty)}/searchAnalytics/query`, {
      startDate: start, endDate: today, dimensions: ["query", "page"], rowLimit: 5000, type: "web",
    }) as { rows?: Array<{ keys?: string[]; clicks: number; impressions: number; ctr: number; position: number }> };
    return (result.rows ?? [])
      .filter((row) => row.position >= 4 && row.position <= 20 && row.impressions >= 100)
      .map((row) => ({
        query: row.keys?.[0] ?? "",
        page: row.keys?.[1] ?? "",
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position,
        opportunity_score: row.impressions * (1 - row.ctr) * (row.position - 1),
      }))
      .sort((a, b) => b.opportunity_score - a.opportunity_score)
      .slice(0, 50);
  } catch {
    return [];
  }
}

export type GscTopMover = { query: string; clicks_current: number; clicks_prior: number; delta: number };

export async function collectGscMovers(site: SiteContext): Promise<{ gainers: GscTopMover[]; losers: GscTopMover[] } > {
  if (!site.gscProperty) return { gainers: [], losers: [] };
  const end = new Date().toISOString().slice(0, 10);
  const mid = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const start = new Date(Date.now() - 60 * 86400_000).toISOString().slice(0, 10);
  try {
    const body = (s: string, e: string) => ({ startDate: s, endDate: e, dimensions: ["query"], rowLimit: 1000, type: "web" });
    const [current, prior] = await Promise.all([
      gscPost(`/sites/${encodeURIComponent(site.gscProperty)}/searchAnalytics/query`, body(mid, end)) as Promise<{ rows?: Array<{ keys?: string[]; clicks: number }> }>,
      gscPost(`/sites/${encodeURIComponent(site.gscProperty)}/searchAnalytics/query`, body(start, mid)) as Promise<{ rows?: Array<{ keys?: string[]; clicks: number }> }>,
    ]);
    const priorMap = new Map((prior.rows ?? []).map((r) => [r.keys?.[0] ?? "", r.clicks]));
    const merged = (current.rows ?? []).map((r) => {
      const q = r.keys?.[0] ?? "";
      const before = priorMap.get(q) ?? 0;
      return { query: q, clicks_current: r.clicks, clicks_prior: before, delta: r.clicks - before };
    });
    const gainers = [...merged].sort((a, b) => b.delta - a.delta).slice(0, 10);
    const losers = [...merged].sort((a, b) => a.delta - b.delta).slice(0, 10);
    return { gainers, losers };
  } catch {
    return { gainers: [], losers: [] };
  }
}

export async function collectBacklinksSnapshot(site: SiteContext) {
  const cached = await getLatestBacklinks(site.domain).catch(() => null);
  if (cached) return { source: "db" as const, data: cached, anchors: null as Array<{ anchor: string; backlinks: number; spam_score?: number }> | null };
  try {
    const summary = await post("/backlinks/summary/live", { target: site.domain, include_subdomains: true }) as any;
    const sum = summary.tasks?.[0]?.result?.[0];
    if (!sum) return { source: "missing" as const, data: null, anchors: null };
    const anchors = await post("/backlinks/anchors/live", { target: site.domain, limit: 20, include_subdomains: true }) as any;
    return {
      source: "live" as const,
      data: { snapshot_date: new Date().toISOString().slice(0, 10), domain: site.domain, total_backlinks: sum.backlinks, referring_domains: sum.referring_domains, referring_main_domains: sum.referring_main_domains, broken_backlinks: sum.broken_backlinks, rank: sum.rank, spam_score: sum.backlinks_spam_score },
      anchors: (anchors.tasks?.[0]?.result?.[0]?.items ?? []).slice(0, 20),
    };
  } catch {
    return { source: "missing" as const, data: null, anchors: null };
  }
}

export async function collectRankingsSnapshot(site: SiteContext) {
  return getLatestDomainRankings(site.domain).catch(() => null);
}

export async function collectLlmVisibility(site: SiteContext) {
  return getLatestLlmVisibility(site.domain).catch(() => []);
}

export async function collectTrafficTrend(site: SiteContext, days: number = 28) {
  const [gsc, ga4] = await Promise.all([
    getTrafficTrend(site.domain, "gsc", days).catch(() => []),
    getTrafficTrend(site.domain, "ga4", days).catch(() => []),
  ]);
  return { gsc, ga4 };
}

export async function collectSitemapStatus(site: SiteContext) {
  if (!site.gscProperty) return null;
  try {
    const list = await gscPost(`/sites/${encodeURIComponent(site.gscProperty)}/sitemaps`, {}) as any;
    return list?.sitemap ?? null;
  } catch {
    return null;
  }
}

export async function collectAccountUserData() {
  try {
    return await get("/appendix/user_data") as unknown;
  } catch {
    return null;
  }
}
