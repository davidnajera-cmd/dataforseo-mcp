import { post, get } from "../dataforseo-client.js";
import { gscPost } from "../gsc-client.js";
import { ga4Post } from "../ga4-client.js";
import { GA4_CONVERSION_EVENT_NAMES, GA4_CLEAN_KEY_EVENTS_TIMESTAMP, ga4AndExpression, ga4ExactStringExpression, ga4HostNameExpression, ga4InListExpression } from "../ga4-site-filters.js";
import { getRuntimeVariable } from "../runtime-config.js";
import { getLatestBacklinks, getBacklinksTrend, getLatestDomainRankings, getLatestLlmVisibility, getTrafficTrend } from "../persistence-store.js";

export type SiteContext = {
  domain: string;
  gscProperty: string | null;
  ga4PropertyId: string | null;
  countryCode: "co" | "mx";
  locationCode: number;
};

export async function loadSiteContexts(): Promise<SiteContext[]> {
  const out: SiteContext[] = [];
  const co_domain = await getRuntimeVariable("DNA_DOMAIN_CO");
  const co_site = await getRuntimeVariable("DNA_SITE_CO");
  const co_ga4 = (await getRuntimeVariable("GA4_PROPERTY_ID_CO")) ?? (await getRuntimeVariable("GA4_PROPERTY_ID")) ?? null;
  if (co_domain) out.push({ domain: co_domain, gscProperty: co_site ?? null, ga4PropertyId: co_ga4, countryCode: "co", locationCode: Number(await getRuntimeVariable("DNA_LOCATION_CO") ?? 2170) });

  const mx_domain = await getRuntimeVariable("DNA_DOMAIN_MX");
  const mx_site = await getRuntimeVariable("DNA_SITE_MX");
  const mx_ga4 = (await getRuntimeVariable("GA4_PROPERTY_ID_MX")) ?? null;
  if (mx_domain) out.push({ domain: mx_domain, gscProperty: mx_site ?? null, ga4PropertyId: mx_ga4, countryCode: "mx", locationCode: Number(await getRuntimeVariable("DNA_LOCATION_MX") ?? 2484) });

  const lta_domain = await getRuntimeVariable("DNA_DOMAIN_LTA");
  const lta_site = await getRuntimeVariable("DNA_SITE_LTA");
  const lta_ga4 = (await getRuntimeVariable("GA4_PROPERTY_ID_LTA")) ?? null;
  if (lta_domain) out.push({ domain: lta_domain, gscProperty: lta_site ?? null, ga4PropertyId: lta_ga4, countryCode: "co", locationCode: Number(await getRuntimeVariable("DNA_LOCATION_LTA") ?? 2170) });

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

// GA4 key events / conversion summary for the site. Returns the top events by
// count (last 28 days) with a flag for which look like web SEO conversions
// (whatsapp / form / lead / call / scheduling). The agent uses this to:
//   - Decide if conversion-based reasoning is grounded.
//   - Detect if WhatsApp/form events are configured at all (heuristic rule).
//   - Cross-reference traffic with conversion rate.
export type Ga4KeyEvent = {
  name: string;
  count: number;
  is_seo_conversion_proxy: boolean;
};

export type Ga4ConversionSnapshot = {
  configured: boolean;
  message: string;
  total_events_28d: number;
  total_seo_conversions_28d: number;
  events: Ga4KeyEvent[];
  by_landing_page: Array<{ landing_page: string; sessions: number; conversions: number }>;
};

const SEO_CONVERSION_NAME_PATTERNS = [
  /whatsapp/i, /wa[_-]?click/i, /click[_-]?wa/i,
  /form/i, /formulario/i, /lead/i,
  /call/i, /llamada/i, /phone/i,
  /schedul/i, /agend/i, /book/i, /cita/i,
];

function isSeoConversionEvent(name: string): boolean {
  return SEO_CONVERSION_NAME_PATTERNS.some((p) => p.test(name));
}

export async function collectGa4ConversionEvents(site: SiteContext): Promise<Ga4ConversionSnapshot> {
  if (!site.ga4PropertyId) {
    return { configured: false, message: "Sin GA4_PROPERTY_ID para este sitio.", total_events_28d: 0, total_seo_conversions_28d: 0, events: [], by_landing_page: [] };
  }
  const property = site.ga4PropertyId.startsWith("properties/") ? site.ga4PropertyId : `properties/${site.ga4PropertyId}`;
  const today = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - 28 * 86400_000).toISOString().slice(0, 10);
  const hostExpression = ga4HostNameExpression(site.domain);

  try {
    const [eventsRes, totalsRes, seoConversionsRes] = await Promise.all([
      ga4Post(`/${property}:runReport`, {
        dateRanges: [{ startDate: start, endDate: today }],
        dimensions: [{ name: "eventName" }],
        metrics: [{ name: "eventCount" }],
        dimensionFilter: hostExpression,
        orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
        limit: 50,
      }) as Promise<{ rows?: Array<{ dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }> }>,
      ga4Post(`/${property}:runReport`, {
        dateRanges: [{ startDate: start, endDate: today }],
        metrics: [{ name: "eventCount" }],
        dimensionFilter: hostExpression,
      }) as Promise<{ rows?: Array<{ metricValues?: Array<{ value?: string }> }> }>,
      ga4Post(`/${property}:runReport`, {
        dateRanges: [{ startDate: start, endDate: today }],
        metrics: [{ name: "eventCount" }],
        dimensionFilter: ga4AndExpression(hostExpression, ga4InListExpression("eventName", GA4_CONVERSION_EVENT_NAMES)),
      }) as Promise<{ rows?: Array<{ metricValues?: Array<{ value?: string }> }> }>,
    ]);

    const events: Ga4KeyEvent[] = (eventsRes.rows ?? []).map((r) => {
      const name = r.dimensionValues?.[0]?.value ?? "(unknown)";
      const count = Number(r.metricValues?.[0]?.value ?? 0);
      return { name, count, is_seo_conversion_proxy: isSeoConversionEvent(name) };
    });

    const total = Number(totalsRes.rows?.[0]?.metricValues?.[0]?.value ?? 0);
    const totalSeo = Number(seoConversionsRes.rows?.[0]?.metricValues?.[0]?.value ?? 0);

    // Sessions + whitelisted conversion events by landing page (organic only, host filtered).
    let byLanding: Array<{ landing_page: string; sessions: number; conversions: number }> = [];
    try {
      const [sessionRes, conversionRes] = await Promise.all([
        ga4Post(`/${property}:runReport`, {
          dateRanges: [{ startDate: start, endDate: today }],
          dimensions: [{ name: "landingPage" }],
          metrics: [{ name: "sessions" }],
          dimensionFilter: ga4AndExpression(
            hostExpression,
            ga4ExactStringExpression("sessionDefaultChannelGroup", "Organic Search")
          ),
          orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
          limit: 30,
        }) as Promise<{ rows?: Array<{ dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }> }>,
        ga4Post(`/${property}:runReport`, {
          dateRanges: [{ startDate: start, endDate: today }],
          dimensions: [{ name: "landingPage" }],
          metrics: [{ name: "eventCount" }],
          dimensionFilter: ga4AndExpression(
            hostExpression,
            ga4ExactStringExpression("sessionDefaultChannelGroup", "Organic Search"),
            ga4InListExpression("eventName", GA4_CONVERSION_EVENT_NAMES)
          ),
          orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
          limit: 30,
        }) as Promise<{ rows?: Array<{ dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }> }>,
      ]);
      const conversionMap = new Map(
        (conversionRes.rows ?? []).map((r) => [r.dimensionValues?.[0]?.value ?? "(unknown)", Number(r.metricValues?.[0]?.value ?? 0)])
      );
      byLanding = (sessionRes.rows ?? []).map((r) => {
        const landing_page = r.dimensionValues?.[0]?.value ?? "(unknown)";
        return {
          landing_page,
          sessions: Number(r.metricValues?.[0]?.value ?? 0),
          conversions: conversionMap.get(landing_page) ?? 0,
        };
      });
    } catch {
      // landing page query optional
    }

    return {
      configured: true,
      message: events.length > 0
        ? `Eventos GA4 detectados. Conversiones SEO calculadas por whitelist (${GA4_CONVERSION_EVENT_NAMES.join(", ")}) para evitar key_events históricos contaminados antes de ${GA4_CLEAN_KEY_EVENTS_TIMESTAMP}.`
        : "GA4 conectado pero sin eventos en los últimos 28 días.",
      total_events_28d: total,
      total_seo_conversions_28d: totalSeo,
      events: events.slice(0, 25),
      by_landing_page: byLanding,
    };
  } catch (error) {
    return {
      configured: false,
      message: error instanceof Error ? error.message : "GA4 no respondió.",
      total_events_28d: 0,
      total_seo_conversions_28d: 0,
      events: [],
      by_landing_page: [],
    };
  }
}
