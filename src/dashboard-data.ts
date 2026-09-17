import { post } from "./dataforseo-client.js";
import { gscPost } from "./gsc-client.js";
import { ga4Post } from "./ga4-client.js";
import { GA4_CONVERSION_EVENT_NAMES, ga4AndExpression, ga4ExactStringExpression, ga4HostNameExpression } from "./ga4-site-filters.js";
import { clarityRequest } from "./clarity-client.js";
import { formatGscAttemptErrors, gscPropertyCandidates } from "./gsc-property.js";
import { runPageSpeed, summarizePageSpeed } from "./pagespeed-client.js";
import { getRuntimeVariable } from "./runtime-config.js";
import {
  getLatestBacklinks,
  getBacklinksTrend,
  getLatestLlmVisibility,
  getLatestTrafficSnapshot,
  getTrafficTrend,
  getLatestDomainRankings,
  getWebLeadStats,
  hasAnyWebLeads,
} from "./persistence-store.js";

export type SiteCode = "co" | "mx" | "mx_edu" | "ar" | "us" | "cl" | "pe" | "encasa" | "lta";
export type CountryCode = "all" | SiteCode;
export type Timeframe = "monthly" | "weekly";
export type Channel = "all" | "blog" | "programs" | "campaigns";

// One entry per tracked property. Adding a market is: one row here, plus the matching
// runtime variables in src/runtime-config.ts if you want to override a default. Everything
// else (GSC loading, comparison table, "Sitio" filter) derives from this list — nothing
// else in this file hardcodes which sites exist.
type SiteRegistryEntry = {
  code: SiteCode;
  name: string;
  siteVar: string;
  defaultSite: string;
  domainVar: string;
  defaultDomain: string;
  canonicalVar: string;
  defaultCanonical: string;
  locationVar: string;
  defaultLocationCode: number;
  ga4Var: string;
  ga4FallbackVar?: string;
};

const SITE_REGISTRY: SiteRegistryEntry[] = [
  { code: "co", name: "Colombia", siteVar: "DNA_SITE_CO", defaultSite: "https://dnamusic.edu.co/", domainVar: "DNA_DOMAIN_CO", defaultDomain: "dnamusic.edu.co", canonicalVar: "DNA_CANONICAL_URL", defaultCanonical: "https://www.dnamusic.edu.co/", locationVar: "DNA_LOCATION_CO", defaultLocationCode: 2170, ga4Var: "GA4_PROPERTY_ID_CO", ga4FallbackVar: "GA4_PROPERTY_ID" },
  { code: "mx", name: "Mexico", siteVar: "DNA_SITE_MX", defaultSite: "sc-domain:dnamusic.mx", domainVar: "DNA_DOMAIN_MX", defaultDomain: "dnamusic.mx", canonicalVar: "DNA_CANONICAL_URL_MX", defaultCanonical: "https://dnamusic.mx/", locationVar: "DNA_LOCATION_MX", defaultLocationCode: 2484, ga4Var: "GA4_PROPERTY_ID_MX" },
  { code: "mx_edu", name: "Mexico (dnamusic.edu.co)", siteVar: "DNA_SITE_MX_EDU", defaultSite: "https://mexico.dnamusic.edu.co/", domainVar: "DNA_DOMAIN_MX_EDU", defaultDomain: "mexico.dnamusic.edu.co", canonicalVar: "DNA_CANONICAL_URL_MX_EDU", defaultCanonical: "https://mexico.dnamusic.edu.co/", locationVar: "DNA_LOCATION_MX_EDU", defaultLocationCode: 2484, ga4Var: "GA4_PROPERTY_ID_MX_EDU" },
  { code: "ar", name: "Argentina", siteVar: "DNA_SITE_AR", defaultSite: "https://argentina.dnamusic.edu.co/", domainVar: "DNA_DOMAIN_AR", defaultDomain: "argentina.dnamusic.edu.co", canonicalVar: "DNA_CANONICAL_URL_AR", defaultCanonical: "https://argentina.dnamusic.edu.co/", locationVar: "DNA_LOCATION_AR", defaultLocationCode: 2032, ga4Var: "GA4_PROPERTY_ID_AR" },
  { code: "us", name: "Estados Unidos", siteVar: "DNA_SITE_US", defaultSite: "https://dnamusic.us/", domainVar: "DNA_DOMAIN_US", defaultDomain: "dnamusic.us", canonicalVar: "DNA_CANONICAL_URL_US", defaultCanonical: "https://dnamusic.us/", locationVar: "DNA_LOCATION_US", defaultLocationCode: 2840, ga4Var: "GA4_PROPERTY_ID_US" },
  { code: "cl", name: "Chile", siteVar: "DNA_SITE_CL", defaultSite: "https://dnamusic.cl/", domainVar: "DNA_DOMAIN_CL", defaultDomain: "dnamusic.cl", canonicalVar: "DNA_CANONICAL_URL_CL", defaultCanonical: "https://dnamusic.cl/", locationVar: "DNA_LOCATION_CL", defaultLocationCode: 2152, ga4Var: "GA4_PROPERTY_ID_CL" },
  { code: "pe", name: "Peru", siteVar: "DNA_SITE_PE", defaultSite: "https://dnamusic.pe/", domainVar: "DNA_DOMAIN_PE", defaultDomain: "dnamusic.pe", canonicalVar: "DNA_CANONICAL_URL_PE", defaultCanonical: "https://dnamusic.pe/", locationVar: "DNA_LOCATION_PE", defaultLocationCode: 2604, ga4Var: "GA4_PROPERTY_ID_PE" },
  { code: "encasa", name: "DNA Music en Casa", siteVar: "DNA_SITE_ENCASA", defaultSite: "https://dnamusicencasa.com/", domainVar: "DNA_DOMAIN_ENCASA", defaultDomain: "dnamusicencasa.com", canonicalVar: "DNA_CANONICAL_URL_ENCASA", defaultCanonical: "https://dnamusicencasa.com/", locationVar: "DNA_LOCATION_ENCASA", defaultLocationCode: 2170, ga4Var: "GA4_PROPERTY_ID_ENCASA" },
  { code: "lta", name: "La Tienda de Audio", siteVar: "DNA_SITE_LTA", defaultSite: "sc-domain:latiendadeaudio.com", domainVar: "DNA_DOMAIN_LTA", defaultDomain: "latiendadeaudio.com", canonicalVar: "DNA_CANONICAL_URL_LTA", defaultCanonical: "https://latiendadeaudio.com/", locationVar: "DNA_LOCATION_LTA", defaultLocationCode: 2170, ga4Var: "GA4_PROPERTY_ID_LTA" },
];

export type DashboardFilters = {
  country: CountryCode;
  timeframe: Timeframe;
  channel: Channel;
  startDate: string;
  endDate: string;
};

type Metric = {
  label: string;
  value: string;
  delta: number | null;
  detail: string;
  source: string;
};

type TrendPoint = {
  label: string;
  organic: number;
  leads: number | null;
  ctr: number | null;
};

type CountryMetric = {
  metric: string;
  values: Array<{ code: SiteCode; name: string; value: string; raw: number | null }>;
  leader: string;
};

type PageMetric = {
  path: string;
  sessions: number;
  ctr: number;
  conversion: number | null;
  status: "Sube" | "Baja" | "Optimizar" | "Sin historico";
};

type KeywordSegment = {
  name: string;
  value: number | null;
  description: string;
};

type ActionItem = {
  title: string;
  reason: string;
  action: string;
  priority: "Alta" | "Media" | "Baja";
};

type SourceStatus = {
  name: string;
  status: "live" | "pending" | "error" | "degraded";
  message: string;
};

export type SeoDashboardData = {
  generatedAt: string;
  filters: DashboardFilters;
  overview: {
    verdict: string;
    summary: string;
    metrics: Metric[];
  };
  trends: TrendPoint[];
  keywords: {
    top3: number | null;
    top10: number | null;
    newKeywords: number | null;
    movementUp: number | null;
    movementDown: number | null;
    intent: KeywordSegment[];
  };
  content: {
    published: number | null;
    optimized: number | null;
    updated: number | null;
    blogTrafficShare: number | null;
    topPages: PageMetric[];
  };
  technical: {
    score: number | null;
    lcp: string | null;
    inp: string | null;
    cls: string | null;
    speed: string | null;
    indexErrors: number | null;
    indexedNew: number | null;
    deadClicks: number | null;
    rageClicks: number | null;
    excessiveScroll: number | null;
    quickbackClick: number | null;
  };
  business: {
    programs: Array<{ name: string; traffic: number | null; conversion: number | null }>;
    channels: Array<{ name: string; leads: number | null; conversion: number | null }>;
    opportunities: ActionItem[];
  };
  comparison: CountryMetric[];
  sources: SourceStatus[];
  ga4?: {
    sessions: number | null;
    organic_sessions: number | null;
    conversions: number | null;
    by_domain: Array<{ domain: string; sessions: number | null; organic_sessions: number | null; conversions: number | null; date: string | null; source_origin: "db" | "live" | "missing" }>;
    series: Array<{ date: string; sessions: number; organic_sessions: number; conversions: number }>;
    reality: {
      notes: string[];
      acquisition_sessions: number | null;
      organic_acquisition_sessions: number | null;
      operational_sessions: number | null;
      by_domain: Array<{
        domain: string;
        property_id: string | null;
        host_filter: string;
        acquisition_sessions: number | null;
        organic_acquisition_sessions: number | null;
        operational_sessions: number | null;
        top_acquisition_pages: string[];
        top_operational_pages: string[];
        source_origin: "live" | "missing";
        note: string;
      }>;
    };
  };
  backlinks?: {
    by_domain: Array<{ domain: string; total: number | null; referring_domains: number | null; rank: number | null; spam_score: number | null; date: string | null; source_origin: "db" | "live" | "missing" }>;
    trend: Array<{ date: string; domain: string; total: number | null; referring_domains: number | null }>;
  };
  ai_visibility?: {
    by_domain: Array<{ domain: string; chat_gpt_mentions: number | null; google_mentions: number | null; date: string | null }>;
    has_data: boolean;
    note: string;
  };
  history_summary?: {
    rankings_by_domain: Array<{ domain: string; total_tracked: number; top3: number; top10: number; avg_position: number | null; snapshot_date: string }>;
  };
};

const DEFAULT_FILTERS: Omit<DashboardFilters, "startDate" | "endDate"> = {
  country: "all",
  timeframe: "monthly",
  channel: "all",
};

const BOGOTA_TIME_ZONE = "America/Bogota";

function formatDateInBogota(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BOGOTA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// GSC/GA4 data for "today" is typically incomplete, so the rolling window ends yesterday
// (Bogota time, the project's reference timezone) instead of the current calendar day.
function computeDefaultDateRange(timeframe: Timeframe): { startDate: string; endDate: string } {
  const endDate = addDays(formatDateInBogota(new Date()), -1);
  const windowDays = timeframe === "weekly" ? 7 : 28;
  return { startDate: addDays(endDate, -(windowDays - 1)), endDate };
}

function daysSince(isoDate: string | null): number | null {
  if (!isoDate) return null;
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}

function newestIsoDate(dates: Array<string | null>): string | null {
  const valid = dates.filter((d): d is string => !!d);
  return valid.length ? valid.sort().at(-1)! : null;
}

type CountryConfig = {
  code: SiteCode;
  name: string;
  site: string;
  domain: string;
  canonicalUrl: string;
  locationCode: number;
  published: boolean;
  ga4PropertyId: string | null;
};

type GscData = {
  live: boolean;
  error?: boolean;
  message: string;
  clicks: number | null;
  impressions: number | null;
  ctr: number | null;
  position: number | null;
  pages: PageMetric[];
  trends: TrendPoint[];
  byCountry: Record<SiteCode, { clicks: number | null; impressions: number | null; ctr: number | null }>;
};

export function normalizeFilters(input: Partial<DashboardFilters>): DashboardFilters {
  const timeframe: Timeframe = input.timeframe === "weekly" ? "weekly" : "monthly";
  const defaultRange = computeDefaultDateRange(timeframe);
  return {
    country: isCountry(input.country) ? input.country : DEFAULT_FILTERS.country,
    timeframe,
    channel: isChannel(input.channel) ? input.channel : DEFAULT_FILTERS.channel,
    startDate: input.startDate || defaultRange.startDate,
    endDate: input.endDate || defaultRange.endDate,
  };
}

export async function collectSeoDashboardData(input: Partial<DashboardFilters>): Promise<SeoDashboardData> {
  const filters = normalizeFilters(input);
  const countries = filters.country === "all" ? SITE_REGISTRY.map((entry) => entry.code) : [filters.country];
  const configs = await Promise.all(countries.map(getCountryConfig));
  const sources: SourceStatus[] = [];

  const [gsc, dataforseo, pagespeed, ga4, clarity, backlinksData, llmData, historyData, webLeads] = await Promise.all([
    loadSearchConsole(filters, configs).then((data) => {
      sources.push({ name: "Google Search Console", status: sourceStatus(data), message: data.message });
      return data;
    }),
    loadDataForSeo(configs).then((data) => {
      sources.push({ name: "DataForSEO", status: sourceStatus(data), message: data.message });
      return data;
    }),
    loadPageSpeed(configs).then((data) => {
      sources.push({ name: "PageSpeed Insights", status: sourceStatus(data), message: data.message });
      return data;
    }),
    loadGa4(configs).then((data) => {
      sources.push({ name: "Google Analytics 4", status: data.live ? "live" : data.error ? "error" : "pending", message: data.message });
      return data;
    }),
    loadClarity().then((data) => {
      sources.push({ name: "Microsoft Clarity", status: data.live ? "live" : data.degraded ? "degraded" : data.error ? "error" : "pending", message: data.message });
      return data;
    }),
    loadBacklinksSection(configs).then((data) => {
      const dbRows = data.byDomain.filter((row) => row.source_origin === "db");
      const age = dbRows.length ? daysSince(newestIsoDate(dbRows.map((row) => row.date))) : null;
      const stale = data.live && age !== null && age > 10;
      sources.push({
        name: "Backlinks (DataForSEO)",
        status: data.live ? (stale ? "degraded" : "live") : data.error ? "error" : "pending",
        message: stale ? `${data.message} Snapshot con ${age} dias de antiguedad — el cron semanal deberia haberlo refrescado.` : data.message,
      });
      return data;
    }),
    loadLlmVisibilitySection(configs).then((data) => {
      // A weekly snapshot older than ~10 days means the pipeline stalled, not that
      // the data is merely "live" — the source-health badge needs to say so.
      const age = daysSince(newestIsoDate(data.by_domain.map((row) => row.date)));
      const stale = data.has_data && age !== null && age > 10;
      sources.push({
        name: "LLM Visibility (DataForSEO)",
        status: !data.has_data ? "pending" : stale ? "degraded" : "live",
        message: stale ? `${data.note} Snapshot con ${age} dias de antiguedad — el cron semanal deberia haberlo refrescado.` : data.note,
      });
      return data;
    }),
    loadHistorySummary(configs),
    (async () => {
      const domain = filters.country === "all" ? null : configs[0]?.domain ?? null;
      const [stats, everConnected] = await Promise.all([
        getWebLeadStats({ domain, startDate: filters.startDate, endDate: filters.endDate }),
        hasAnyWebLeads(),
      ]);
      sources.push({
        name: "Leads (Dream CRM)",
        status: everConnected ? "live" : "pending",
        message: everConnected
          ? `${stats.total} leads registrados en el periodo seleccionado.`
          : "No hay leads conectados todavia. Configura el webhook /api/leads-webhook en Dream CRM.",
      });
      return { stats, everConnected };
    })(),
  ]);
  const hasGsc = gsc.live && gsc.clicks !== null;
  const hasTrend = gsc.trends.length > 0;
  const hasKeywords = dataforseo.live && (dataforseo.top3 !== null || dataforseo.top10 !== null);
  const hasTechnical = pagespeed.live && pagespeed.score !== null;

  const metrics: Metric[] = [
    {
      label: "Clics organicos",
      value: hasGsc ? formatNumber(gsc.clicks ?? 0) : "Sin datos reales",
      delta: null,
      detail: hasGsc ? `${formatNumber(gsc.impressions ?? 0)} impresiones` : gsc.message,
      source: hasGsc ? "Search Console" : "Pendiente",
    },
    {
      label: "Leads SEO",
      value: webLeads.everConnected ? formatNumber(webLeads.stats.total) : "No conectado",
      delta: null,
      detail: webLeads.everConnected
        ? (webLeads.stats.byUtmSource[0] ? `Top origen: ${webLeads.stats.byUtmSource[0].utmSource} (${webLeads.stats.byUtmSource[0].count})` : "Sin desglose por utm_source en este periodo.")
        : "No hay fuente CRM/lead real conectada todavia.",
      source: webLeads.everConnected ? "Dream CRM" : "Pendiente CRM",
    },
    {
      label: "Keywords Top 10",
      value: dataforseo.top10 !== null ? formatNumber(dataforseo.top10) : "Sin datos reales",
      delta: null,
      detail: dataforseo.top3 !== null ? `${formatNumber(dataforseo.top3)} en Top 3` : dataforseo.message,
      source: hasKeywords ? "DataForSEO" : "Pendiente",
    },
    {
      label: "CTR promedio",
      value: gsc.ctr !== null ? `${gsc.ctr.toFixed(2)}%` : "Sin datos reales",
      delta: null,
      detail: gsc.position !== null ? `Posicion media ${gsc.position.toFixed(1)}` : gsc.message,
      source: hasGsc ? "Search Console" : "Pendiente",
    },
  ];

  const pendingReasons = sources
    .filter((source) => source.status === "pending" || source.status === "error")
    .map((source) => `${source.name}: ${source.message}`);

  const ga4RealitySummary = ga4.reality.operational_sessions && ga4.reality.operational_sessions > 0
    ? `GA4 separa ${formatNumber(ga4.reality.operational_sessions)} sesiones operativas de Portal / Q10 para no mezclarlas con adquisicion web.`
    : ga4.reality.acquisition_sessions !== null
      ? "GA4 muestra solo trafico de adquisicion web en los hosts filtrados para este corte."
      : null;

  const llmAgeDays = daysSince(newestIsoDate(llmData.by_domain.map((row) => row.date)));
  const historyAgeDays = daysSince(newestIsoDate(historyData.map((row) => row.snapshot_date)));
  const staleParts: string[] = [];
  if (llmAgeDays !== null && llmAgeDays > 10) staleParts.push(`visibilidad AI (hace ${llmAgeDays}d)`);
  if (historyAgeDays !== null && historyAgeDays > 10) staleParts.push(`historico de rankings (hace ${historyAgeDays}d)`);
  const staleNote = staleParts.length
    ? ` Ojo: ${staleParts.join(" y ")} viene de una foto historica vieja, no de una consulta en vivo — revisa la fecha en cada panel.`
    : "";

  return {
    generatedAt: new Date().toISOString(),
    filters,
    overview: {
      verdict: hasGsc || hasKeywords || hasTechnical ? "Datos reales parciales" : "Sin datos reales suficientes",
      summary: pendingReasons.length
        ? `El tablero solo muestra fuentes reales. ${ga4RealitySummary ? `${ga4RealitySummary} ` : ""}Pendiente: ${pendingReasons.join(" | ")}${staleNote}`
        : `${ga4RealitySummary ? `${ga4RealitySummary} ` : ""}Las metricas visibles vienen de fuentes reales conectadas; la fecha de cada panel indica su antiguedad real.${staleNote}`,
      metrics,
    },
    trends: hasTrend ? gsc.trends : [],
    keywords: {
      top3: dataforseo.top3,
      top10: dataforseo.top10,
      newKeywords: null,
      movementUp: null,
      movementDown: null,
      intent: [
        { name: "Informacional", value: null, description: "Pendiente workflow real de intent por keywords." },
        { name: "Comercial", value: null, description: "Pendiente workflow real de intent por keywords." },
        { name: "Transaccional", value: null, description: "Pendiente workflow real de intent por keywords." },
        { name: "Navegacional", value: null, description: "Pendiente workflow real de intent por keywords." },
      ],
    },
    content: {
      published: null,
      optimized: null,
      updated: null,
      blogTrafficShare: null,
      topPages: gsc.pages,
    },
    technical: {
      score: pagespeed.score,
      lcp: pagespeed.lcp,
      inp: pagespeed.inp,
      cls: pagespeed.cls,
      speed: pagespeed.speed,
      indexErrors: null,
      indexedNew: null,
      deadClicks: clarity.deadClicks,
      rageClicks: clarity.rageClicks,
      excessiveScroll: clarity.excessiveScroll,
      quickbackClick: clarity.quickbackClick,
    },
    business: {
      programs: [],
      channels: [
        { name: "Adquisicion web", leads: ga4.reality.acquisition_sessions, conversion: null },
        { name: "SEO organico util", leads: ga4.reality.organic_acquisition_sessions, conversion: null },
        { name: "Portal / Q10", leads: ga4.reality.operational_sessions, conversion: null },
        { name: "Conversiones GA4", leads: ga4.totals.conversions, conversion: null },
        ...(webLeads.everConnected
          ? webLeads.stats.byChannel.map((row) => ({ name: `Lead: ${row.channel}`, leads: row.count, conversion: null }))
          : [
              { name: "WhatsApp", leads: null, conversion: null },
              { name: "Formulario", leads: null, conversion: null },
            ]),
      ],
      opportunities: buildRealOpportunities(gsc, dataforseo, pagespeed),
    },
    comparison: buildComparison(gsc.byCountry, configs),
    sources: sources.sort((a, b) => a.name.localeCompare(b.name)),
    ga4: {
      sessions: ga4.totals.sessions,
      organic_sessions: ga4.totals.organic_sessions,
      conversions: ga4.totals.conversions,
      by_domain: ga4.byDomain,
      series: ga4.series,
      reality: {
        notes: ga4.reality.notes,
        acquisition_sessions: ga4.reality.acquisition_sessions,
        organic_acquisition_sessions: ga4.reality.organic_acquisition_sessions,
        operational_sessions: ga4.reality.operational_sessions,
        by_domain: ga4.reality.byDomain.map((row) => ({
          domain: row.domain,
          property_id: row.propertyId,
          host_filter: row.hostFilter,
          acquisition_sessions: row.acquisition_sessions,
          organic_acquisition_sessions: row.organic_acquisition_sessions,
          operational_sessions: row.operational_sessions,
          top_acquisition_pages: row.top_acquisition_pages,
          top_operational_pages: row.top_operational_pages,
          source_origin: row.source_origin,
          note: row.note,
        })),
      },
    },
    backlinks: {
      by_domain: backlinksData.byDomain,
      trend: backlinksData.trend,
    },
    ai_visibility: llmData,
    history_summary: { rankings_by_domain: historyData },
  };
}

async function getCountryConfig(country: SiteCode): Promise<CountryConfig> {
  const entry = SITE_REGISTRY.find((item) => item.code === country);
  if (!entry) throw new Error(`Unknown site code: ${country}`);

  // Every site defaults to published — DNA_MX_PUBLISHED used to be the only such flag,
  // and it was never registered as a settable variable (nobody could ever set it via
  // the admin UI), so it always read as unset and silently skipped GSC for Mexico even
  // though the site is real and has working data via a URL-prefix property (the
  // sc-domain: format 403s, but https://dnamusic.mx/ doesn't — confirmed live).
  // Generalized here so any site can be paused the same way if it's ever needed, but
  // only an explicit "false" suppresses it — the default is always published.
  const publishedVar = `DNA_${entry.code.toUpperCase()}_PUBLISHED`;
  const published = (await getRuntimeVariable(publishedVar)) !== "false";

  const ga4PropertyId = (await getRuntimeVariable(entry.ga4Var))
    ?? (entry.ga4FallbackVar ? await getRuntimeVariable(entry.ga4FallbackVar) : null)
    ?? null;

  return {
    code: entry.code,
    name: entry.name,
    site: (await getRuntimeVariable(entry.siteVar)) ?? entry.defaultSite,
    domain: (await getRuntimeVariable(entry.domainVar)) ?? entry.defaultDomain,
    canonicalUrl: (await getRuntimeVariable(entry.canonicalVar)) ?? entry.defaultCanonical,
    locationCode: Number((await getRuntimeVariable(entry.locationVar)) ?? entry.defaultLocationCode),
    published,
    ga4PropertyId,
  };
}

async function loadSearchConsole(filters: DashboardFilters, configs: CountryConfig[]): Promise<GscData> {
  if (!await getRuntimeVariable("GOOGLE_CLIENT_ID") || !await getRuntimeVariable("GOOGLE_CLIENT_SECRET") || !await getRuntimeVariable("GOOGLE_REFRESH_TOKEN")) {
    return emptyGsc("Faltan credenciales de Google Search Console.");
  }

  const byCountry = emptyCountryData();
  const allPages: PageMetric[] = [];
  const trendCtrAccumulator = new Map<string, { organic: number; leads: null; ctrClicks: number; ctrWeighted: number }>();
  let clicks = 0;
  let impressions = 0;
  let weightedPosition = 0;
  let liveCount = 0;
  const errors: string[] = [];

  for (const config of configs) {
    if (!config.published) {
      errors.push(`${config.name}: sitio marcado como no publicado.`);
      continue;
    }

    try {
      const { site, summary, pages, trend } = await loadSearchConsoleForConfig(filters, config);

      const parsedSummary = parseGscSummary(summary);
      byCountry[config.code] = {
        clicks: parsedSummary.clicks,
        impressions: parsedSummary.impressions,
        ctr: parsedSummary.ctr,
      };
      clicks += parsedSummary.clicks;
      impressions += parsedSummary.impressions;
      weightedPosition += parsedSummary.position * parsedSummary.clicks;
      allPages.push(...parseGscPages(pages));
      for (const point of parseGscTrend(trend)) {
        // CTR isn't additive across sites, so blend it as a click-weighted average
        // instead of letting whichever country is processed last overwrite it.
        const existing = trendCtrAccumulator.get(point.label) ?? { organic: 0, leads: null, ctrClicks: 0, ctrWeighted: 0 };
        existing.organic += point.organic;
        if (point.ctr !== null) {
          existing.ctrWeighted += point.ctr * point.organic;
          existing.ctrClicks += point.organic;
        }
        trendCtrAccumulator.set(point.label, existing);
      }
      liveCount += 1;
      if (site !== config.site) errors.push(`${config.name}: usando propiedad GSC alternativa ${site}.`);
    } catch (error) {
      errors.push(`${config.name}: ${error instanceof Error ? error.message : "Search Console no respondio."}`);
    }
  }

  if (!liveCount) return emptyGsc(errors.join(" | ") || "Search Console sin datos reales.");

  return {
    live: true,
    message: errors.length ? `Datos parciales. ${errors.join(" | ")}` : "Datos reales disponibles.",
    clicks,
    impressions,
    ctr: impressions ? (clicks / impressions) * 100 : null,
    position: clicks ? weightedPosition / clicks : null,
    pages: allPages.sort((a, b) => b.sessions - a.sessions).slice(0, 20),
    trends: [...trendCtrAccumulator.entries()]
      .map(([label, point]) => ({
        label,
        organic: point.organic,
        leads: point.leads,
        ctr: point.ctrClicks ? (point.ctrWeighted / point.ctrClicks) : null,
      }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    byCountry,
  };
}

// GSC's dimensionFilterGroups let us scope a query to URLs matching a path pattern.
// "campaigns" has no dedicated path prefix in the site IA yet, so it's defined as the
// residual bucket: organic landing pages that aren't the evergreen program or blog sections.
function buildChannelFilterGroups(channel: Channel): Array<Record<string, unknown>> | undefined {
  if (channel === "blog") {
    return [{ filters: [{ dimension: "page", operator: "includingRegex", expression: "/blog/" }] }];
  }
  if (channel === "programs") {
    return [{ filters: [{ dimension: "page", operator: "includingRegex", expression: "/programas/" }] }];
  }
  if (channel === "campaigns") {
    return [{
      filters: [
        { dimension: "page", operator: "excludingRegex", expression: "/programas/" },
        { dimension: "page", operator: "excludingRegex", expression: "/blog/" },
      ],
    }];
  }
  return undefined;
}

async function loadSearchConsoleForConfig(filters: DashboardFilters, config: CountryConfig) {
  const attemptErrors: Array<{ site: string; error: unknown }> = [];
  const dimensionFilterGroups = buildChannelFilterGroups(filters.channel);

  for (const site of gscPropertyCandidates(config)) {
    try {
      const [summary, pages, trend] = await Promise.all([
        gscPost(`/sites/${encodeURIComponent(site)}/searchAnalytics/query`, {
          startDate: filters.startDate,
          endDate: filters.endDate,
          rowLimit: 1,
          type: "web",
          ...(dimensionFilterGroups ? { dimensionFilterGroups } : {}),
        }),
        gscPost(`/sites/${encodeURIComponent(site)}/searchAnalytics/query`, {
          startDate: filters.startDate,
          endDate: filters.endDate,
          dimensions: ["page"],
          rowLimit: 20,
          type: "web",
          ...(dimensionFilterGroups ? { dimensionFilterGroups } : {}),
        }),
        gscPost(`/sites/${encodeURIComponent(site)}/searchAnalytics/query`, {
          startDate: filters.startDate,
          endDate: filters.endDate,
          dimensions: ["date"],
          rowLimit: 1000,
          type: "web",
          ...(dimensionFilterGroups ? { dimensionFilterGroups } : {}),
        }),
      ]);

      return { site, summary, pages, trend };
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Failed to refresh Google access token")) throw error;
      attemptErrors.push({ site, error });
    }
  }

  throw new Error(formatGscAttemptErrors(attemptErrors) || "Search Console no respondio.");
}

async function loadDataForSeo(configs: CountryConfig[]) {
  if (!await getRuntimeVariable("DATAFORSEO_LOGIN") || !await getRuntimeVariable("DATAFORSEO_PASSWORD")) {
    return { live: false, message: "Faltan credenciales de DataForSEO.", top3: null, top10: null };
  }

  try {
    const results = await Promise.all(configs
      .filter((config) => config.published)
      .map((config) => post("/dataforseo_labs/google/domain_rank_overview/live", {
        target: config.domain,
        location_code: config.locationCode,
        language_code: "es",
      })));
    const buckets = extractRankBuckets(results);
    return {
      live: buckets.top3 !== null || buckets.top10 !== null,
      message: buckets.top3 !== null || buckets.top10 !== null
        ? "Datos reales disponibles."
        : "DataForSEO respondio, pero no entrego buckets Top 3/Top 10 en la respuesta.",
      ...buckets,
    };
  } catch (error) {
    return {
      live: false,
      error: true,
      message: error instanceof Error ? error.message : "DataForSEO no respondio.",
      top3: null,
      top10: null,
    };
  }
}

async function loadPageSpeed(configs: CountryConfig[]) {
  if (!await getRuntimeVariable("PAGESPEED_API_KEY")) {
    return { live: false, message: "Falta PAGESPEED_API_KEY.", score: null, lcp: null, inp: null, cls: null, speed: null };
  }

  const config = configs.find((item) => item.published) ?? configs[0];
  if (!config?.canonicalUrl) {
    return { live: false, message: "Falta URL canonica para PageSpeed.", score: null, lcp: null, inp: null, cls: null, speed: null };
  }

  try {
    const summary = summarizePageSpeed(await runPageSpeed(config.canonicalUrl, { strategy: "mobile" }));
    return {
      live: true,
      message: `Datos reales disponibles para ${config.canonicalUrl}.`,
      score: summary.scores.performance,
      lcp: summary.lab.lcp ?? null,
      inp: summary.lab.inp ?? null,
      cls: summary.lab.cls ?? null,
      speed: summary.lab.speedIndex ?? null,
    };
  } catch (error) {
    return {
      live: false,
      error: true,
      // Provider responses can include opaque Lighthouse payloads. They are not
      // actionable in the dashboard and make the executive summary unreadable.
      message: "PageSpeed no respondió temporalmente; se reintentará en la próxima actualización.",
      score: null,
      lcp: null,
      inp: null,
      cls: null,
      speed: null,
    };
  }
}

function parseGscSummary(raw: unknown) {
  const row = getRows(raw)[0] ?? {};
  return {
    clicks: Number(row.clicks ?? 0),
    impressions: Number(row.impressions ?? 0),
    ctr: Number(row.ctr ?? 0) * 100,
    position: Number(row.position ?? 0),
  };
}

function parseGscPages(raw: unknown): PageMetric[] {
  return getRows(raw)
    .map((row) => ({
      path: String(row.keys?.[0] ?? "/"),
      sessions: Number(row.clicks ?? 0),
      ctr: Number(row.ctr ?? 0) * 100,
      conversion: null,
      status: (Number(row.ctr ?? 0) < 0.025 && Number(row.impressions ?? 0) > 100 ? "Optimizar" : "Sin historico") as PageMetric["status"],
    }))
    .filter((row) => !isOperationalTrafficPath(row.path));
}

function parseGscTrend(raw: unknown): TrendPoint[] {
  return getRows(raw).map((row) => ({
    label: String(row.keys?.[0] ?? ""),
    organic: Number(row.clicks ?? 0),
    leads: null,
    ctr: typeof row.ctr === "number" ? row.ctr * 100 : null,
  })).filter((point) => point.label);
}

function getRows(raw: unknown): Array<Record<string, any>> {
  return isRecord(raw) && Array.isArray(raw.rows) ? raw.rows as Array<Record<string, any>> : [];
}

function extractRankBuckets(raw: unknown[]) {
  let top1 = 0;
  let top23 = 0;
  let top410 = 0;
  let found = false;

  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value)) return;
    for (const [key, item] of Object.entries(value)) {
      if (typeof item === "number") {
        if (key === "pos_1") { top1 += item; found = true; }
        if (key === "pos_2_3") { top23 += item; found = true; }
        if (key === "pos_4_10") { top410 += item; found = true; }
      }
      visit(item);
    }
  };

  visit(raw);
  return found
    ? { top3: top1 + top23, top10: top1 + top23 + top410 }
    : { top3: null, top10: null };
}

function buildRealOpportunities(gsc: GscData, dataforseo: { top3: number | null; top10: number | null }, pagespeed: { score: number | null }) {
  const opportunities: ActionItem[] = [];

  const lowCtrPages = gsc.pages.filter((page) => page.status === "Optimizar").slice(0, 3);
  for (const page of lowCtrPages) {
    opportunities.push({
      title: "Pagina con impresiones y bajo CTR",
      reason: `${page.path} tiene CTR ${page.ctr.toFixed(2)}% en Search Console.`,
      action: "Revisar title/meta y alinear el snippet con la intencion de busqueda.",
      priority: "Alta",
    });
  }

  if (pagespeed.score !== null && pagespeed.score < 75) {
    opportunities.push({
      title: "Performance movil baja",
      reason: `PageSpeed reporta performance ${pagespeed.score}/100.`,
      action: "Priorizar LCP, JS bloqueante e imagenes criticas.",
      priority: "Alta",
    });
  }

  if (dataforseo.top10 === null) {
    opportunities.push({
      title: "Ranking buckets no disponibles",
      reason: "DataForSEO no entrego Top 3/Top 10 parseable para el dominio.",
      action: "Conectar ranked keywords o validar el endpoint de dominio para este mercado.",
      priority: "Media",
    });
  }

  return opportunities;
}

function buildComparison(data: GscData["byCountry"], configs: CountryConfig[]): CountryMetric[] {
  const metricDefs: Array<{ label: string; key: keyof GscData["byCountry"][SiteCode]; format: (v: number | null) => string }> = [
    { label: "Clics organicos", key: "clicks", format: displayNumber },
    { label: "Impresiones", key: "impressions", format: displayNumber },
    { label: "CTR promedio", key: "ctr", format: displayPercent },
  ];
  return metricDefs.map(({ label, key, format }) => {
    const values = configs.map((config) => {
      const raw = data[config.code]?.[key] ?? null;
      return { code: config.code, name: config.name, raw, value: format(raw) };
    });
    return { metric: label, values, leader: pickLeader(values) };
  });
}

function pickLeader(values: Array<{ name: string; raw: number | null }>): string {
  const valid = values.filter((v): v is { name: string; raw: number } => v.raw !== null);
  if (!valid.length) return "Sin datos";
  const max = Math.max(...valid.map((v) => v.raw));
  const winners = valid.filter((v) => v.raw === max);
  return winners.length > 1 ? "Empate" : winners[0].name;
}

function emptyGsc(message: string): GscData {
  return {
    live: false,
    error: message.includes("error") || message.includes("API"),
    message,
    clicks: null,
    impressions: null,
    ctr: null,
    position: null,
    pages: [],
    trends: [],
    byCountry: emptyCountryData(),
  };
}

function emptyCountryData(): GscData["byCountry"] {
  return Object.fromEntries(
    SITE_REGISTRY.map((entry) => [entry.code, { clicks: null, impressions: null, ctr: null }])
  ) as GscData["byCountry"];
}

function sourceStatus(data: { live: boolean; error?: boolean }): SourceStatus["status"] {
  if (data.live) return "live";
  if (data.error) return "error";
  return "pending";
}

function displayNumber(value: number | null) {
  return value === null ? "Sin datos" : formatNumber(value);
}

function displayPercent(value: number | null) {
  return value === null ? "Sin datos" : `${value.toFixed(2)}%`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("es-CO").format(Math.round(value));
}

function isCountry(value: unknown): value is CountryCode {
  return value === "all" || SITE_REGISTRY.some((entry) => entry.code === value);
}

function isChannel(value: unknown): value is Channel {
  return value === "all" || value === "blog" || value === "programs" || value === "campaigns";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// =====================================================================
// New data loaders (DB-first with live API fallback)
// =====================================================================

type Ga4DashboardSection = {
  live: boolean;
  error?: boolean;
  message: string;
  totals: { sessions: number | null; organic_sessions: number | null; conversions: number | null };
  byDomain: Array<{ domain: string; sessions: number | null; organic_sessions: number | null; conversions: number | null; date: string | null; source_origin: "db" | "live" | "missing" }>;
  series: Array<{ date: string; sessions: number; organic_sessions: number; conversions: number }>;
  reality: {
    notes: string[];
    acquisition_sessions: number | null;
    organic_acquisition_sessions: number | null;
    operational_sessions: number | null;
    byDomain: Array<{
      domain: string;
      propertyId: string | null;
      hostFilter: string;
      acquisition_sessions: number | null;
      organic_acquisition_sessions: number | null;
      operational_sessions: number | null;
      top_acquisition_pages: string[];
      top_operational_pages: string[];
      source_origin: "live" | "missing";
      note: string;
    }>;
  };
};

async function loadGa4(configs: CountryConfig[]): Promise<Ga4DashboardSection> {
  if (!await getRuntimeVariable("GOOGLE_REFRESH_TOKEN")) {
    return {
      live: false,
      message: "Falta GOOGLE_REFRESH_TOKEN.",
      totals: { sessions: null, organic_sessions: null, conversions: null },
      byDomain: [],
      series: [],
      reality: { notes: [], acquisition_sessions: null, organic_acquisition_sessions: null, operational_sessions: null, byDomain: [] },
    };
  }
  const byDomain: Ga4DashboardSection["byDomain"] = [];
  const realityByDomain: Ga4DashboardSection["reality"]["byDomain"] = [];
  const seriesMap = new Map<string, { sessions: number; organic_sessions: number; conversions: number }>();
  let totalsSessions = 0;
  let totalsOrganic = 0;
  let totalsConv = 0;
  let totalsAcquisition = 0;
  let totalsOrganicAcquisition = 0;
  let totalsOperational = 0;
  let anyRealityData = false;
  let anyData = false;
  const errors: string[] = [];
  const realityNotes = [
    "GA4 se interpreta con filtro por host para aislar cada dominio publicado.",
    "El trafico de Portal / Q10 se muestra como operativo y no se mezcla con adquisicion SEO.",
  ];

  for (const config of configs) {
    if (!config.ga4PropertyId) {
      byDomain.push({ domain: config.domain, sessions: null, organic_sessions: null, conversions: null, date: null, source_origin: "missing" });
      realityByDomain.push({
        domain: config.domain,
        propertyId: null,
        hostFilter: config.domain,
        acquisition_sessions: null,
        organic_acquisition_sessions: null,
        operational_sessions: null,
        top_acquisition_pages: [],
        top_operational_pages: [],
        source_origin: "missing",
        note: "Sin propiedad GA4 configurada para este dominio.",
      });
      continue;
    }
    // Try DB first
    const cached = await getLatestTrafficSnapshot(config.domain, "ga4").catch(() => null);
    if (cached) {
      byDomain.push({ domain: config.domain, sessions: cached.sessions, organic_sessions: cached.organic_sessions, conversions: cached.conversions, date: cached.date, source_origin: "db" });
      totalsSessions += cached.sessions ?? 0;
      totalsOrganic += cached.organic_sessions ?? 0;
      totalsConv += cached.conversions ?? 0;
      anyData = true;
      const trend = await getTrafficTrend(config.domain, "ga4", 30).catch(() => []);
      for (const row of trend) {
        const key = row.date;
        const existing = seriesMap.get(key) ?? { sessions: 0, organic_sessions: 0, conversions: 0 };
        existing.sessions += row.sessions ?? 0;
        existing.organic_sessions += row.organic_sessions ?? 0;
        existing.conversions += row.conversions ?? 0;
        seriesMap.set(key, existing);
      }
    } else {
      // DB empty -> live
      try {
        const property = config.ga4PropertyId.startsWith("properties/") ? config.ga4PropertyId : `properties/${config.ga4PropertyId}`;
        const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
        const hostExpression = ga4HostNameExpression(config.domain);
        const [total, organic, conversionsResult] = await Promise.all([
          ga4Post(`/${property}:runReport`, {
            dateRanges: [{ startDate: yesterday, endDate: yesterday }],
            metrics: [{ name: "sessions" }],
            dimensionFilter: hostExpression,
          }) as Promise<{ rows?: Array<{ metricValues?: Array<{ value: string }> }> }>,
          ga4Post(`/${property}:runReport`, {
            dateRanges: [{ startDate: yesterday, endDate: yesterday }],
            metrics: [{ name: "sessions" }],
            dimensionFilter: ga4AndExpression(
              hostExpression,
              ga4ExactStringExpression("sessionDefaultChannelGroup", "Organic Search")
            ),
          }) as Promise<{ rows?: Array<{ metricValues?: Array<{ value: string }> }> }>,
          ga4Post(`/${property}:runReport`, {
            dateRanges: [{ startDate: yesterday, endDate: yesterday }],
            metrics: [{ name: "eventCount" }],
            dimensionFilter: ga4AndExpression(
              hostExpression,
              {
                filter: {
                  fieldName: "eventName",
                  inListFilter: { values: [...GA4_CONVERSION_EVENT_NAMES] },
                },
              }
            ),
          }) as Promise<{ rows?: Array<{ metricValues?: Array<{ value: string }> }> }>,
        ]);
        const totalMv = total.rows?.[0]?.metricValues ?? [];
        const organicMv = organic.rows?.[0]?.metricValues ?? [];
        const convMv = conversionsResult.rows?.[0]?.metricValues ?? [];
        const sessions = totalMv[0] ? Number(totalMv[0].value) : 0;
        const organicSessions = organicMv[0] ? Number(organicMv[0].value) : 0;
        const conversions = convMv[0] ? Number(convMv[0].value) : 0;
        byDomain.push({ domain: config.domain, sessions, organic_sessions: organicSessions, conversions, date: yesterday, source_origin: "live" });
        totalsSessions += sessions;
        totalsOrganic += organicSessions;
        totalsConv += conversions;
        anyData = true;
      } catch (error) {
        errors.push(`${config.domain}: ${error instanceof Error ? error.message : "GA4 error"}`);
        byDomain.push({ domain: config.domain, sessions: null, organic_sessions: null, conversions: null, date: null, source_origin: "missing" });
      }
    }

    try {
      const reality = await loadGa4RealityBreakdown(config);
      realityByDomain.push(reality);
      totalsAcquisition += reality.acquisition_sessions ?? 0;
      totalsOrganicAcquisition += reality.organic_acquisition_sessions ?? 0;
      totalsOperational += reality.operational_sessions ?? 0;
      anyRealityData = anyRealityData || reality.source_origin === "live";
    } catch (error) {
      realityByDomain.push({
        domain: config.domain,
        propertyId: config.ga4PropertyId,
        hostFilter: config.domain,
        acquisition_sessions: null,
        organic_acquisition_sessions: null,
        operational_sessions: null,
        top_acquisition_pages: [],
        top_operational_pages: [],
        source_origin: "missing",
        note: error instanceof Error ? error.message : "No se pudo clasificar el trafico de GA4 por landing page.",
      });
    }
  }

  const series = [...seriesMap.entries()].map(([date, v]) => ({ date, ...v })).sort((a, b) => a.date.localeCompare(b.date));
  if (configs.some((config) => config.code === "co")) {
    realityNotes.push("En Colombia, la lectura operativa identifica landings tipo /portal-estudiantes y accesos Q10 como trafico de alumnos actuales.");
  }

  return {
    live: anyData,
    error: errors.length > 0 && !anyData,
    message: anyData ? (errors.length ? `Datos parciales. ${errors.join(" | ")}` : "Datos reales disponibles.") : (errors.join(" | ") || "Sin datos GA4 todavia."),
    totals: { sessions: anyData ? totalsSessions : null, organic_sessions: anyData ? totalsOrganic : null, conversions: anyData ? totalsConv : null },
    byDomain,
    series,
    reality: {
      notes: realityNotes,
      acquisition_sessions: anyRealityData ? totalsAcquisition : null,
      organic_acquisition_sessions: anyRealityData ? totalsOrganicAcquisition : null,
      operational_sessions: anyRealityData ? totalsOperational : null,
      byDomain: realityByDomain,
    },
  };
}

type Ga4LandingRow = { page: string; sessions: number };

async function loadGa4RealityBreakdown(config: CountryConfig) {
  const property = config.ga4PropertyId?.startsWith("properties/") ? config.ga4PropertyId : `properties/${config.ga4PropertyId}`;
  const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
  const hostExpression = ga4HostNameExpression(config.domain);

  const [allLandingPages, organicLandingPages] = await Promise.all([
    runGa4LandingPageSessions(property, yesterday, hostExpression),
    runGa4LandingPageSessions(
      property,
      yesterday,
      ga4AndExpression(hostExpression, ga4ExactStringExpression("sessionDefaultChannelGroup", "Organic Search")) ?? hostExpression
    ),
  ]);

  const allSplit = splitOperationalTraffic(allLandingPages);
  const organicSplit = splitOperationalTraffic(organicLandingPages);

  return {
    domain: config.domain,
    propertyId: config.ga4PropertyId,
    hostFilter: config.domain,
    acquisition_sessions: allSplit.acquisition,
    organic_acquisition_sessions: organicSplit.acquisition,
    operational_sessions: allSplit.operational,
    top_acquisition_pages: allSplit.topAcquisitionPages,
    top_operational_pages: allSplit.topOperationalPages,
    source_origin: "live" as const,
    note: allSplit.operational > 0
      ? "Incluye separacion operativa de portal/Q10 basada en landing pages del ultimo dia."
      : "Todo el trafico del ultimo dia se interpreta como adquisicion web para este host.",
  };
}

async function runGa4LandingPageSessions(property: string, date: string, dimensionFilter: NonNullable<Parameters<typeof ga4AndExpression>[0]>) {
  const result = await ga4Post(`/${property}:runReport`, {
    dateRanges: [{ startDate: date, endDate: date }],
    dimensions: [{ name: "landingPagePlusQueryString" }],
    metrics: [{ name: "sessions" }],
    dimensionFilter,
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    limit: 100,
  }) as { rows?: Array<{ dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }> };

  return (result.rows ?? []).map((row) => ({
    page: row.dimensionValues?.[0]?.value ?? "(unknown)",
    sessions: Number(row.metricValues?.[0]?.value ?? 0),
  })).filter((row) => row.sessions > 0);
}

function splitOperationalTraffic(rows: Ga4LandingRow[]) {
  let acquisition = 0;
  let operational = 0;
  const acquisitionPages: Ga4LandingRow[] = [];
  const operationalPages: Ga4LandingRow[] = [];

  for (const row of rows) {
    if (isOperationalLandingPage(row.page)) {
      operational += row.sessions;
      operationalPages.push(row);
      continue;
    }
    acquisition += row.sessions;
    acquisitionPages.push(row);
  }

  return {
    acquisition,
    operational,
    topAcquisitionPages: acquisitionPages.slice(0, 3).map((row) => row.page),
    topOperationalPages: operationalPages.slice(0, 3).map((row) => row.page),
  };
}

function isOperationalLandingPage(page: string) {
  return isOperationalTrafficPath(page);
}

function isOperationalTrafficPath(value: string) {
  const normalized = value.toLowerCase();
  return [
    "/portal-estudiantes",
    "acceso-q10",
    "/q10",
    "portal/q10",
    "portalestudiantes",
    "prematricula",
    "calendario-academico",
    "atencion-al-estudiante",
    "login",
  ].some((pattern) => normalized.includes(pattern));
}

type ClaritySection = {
  live: boolean;
  error?: boolean;
  degraded?: boolean;
  message: string;
  deadClicks: number | null;
  rageClicks: number | null;
  excessiveScroll: number | null;
  quickbackClick: number | null;
};

async function loadClarity(): Promise<ClaritySection> {
  if (!await getRuntimeVariable("CLARITY_API_TOKEN")) {
    return { live: false, message: "Falta CLARITY_API_TOKEN.", deadClicks: null, rageClicks: null, excessiveScroll: null, quickbackClick: null };
  }
  try {
    const result = await clarityRequest("/project-live-insights", { numOfDays: "1" }) as Array<{ metricName?: string; information?: Array<{ name?: string; value?: number }> }>;
    const metrics: Record<string, number> = {};
    for (const m of result ?? []) {
      const key = (m.metricName ?? "").trim();
      const total = (m.information ?? []).reduce((acc, item) => acc + Number(item.value ?? 0), 0);
      if (key) metrics[key] = total;
    }
    return {
      live: true,
      message: "Datos reales (ultimo dia).",
      deadClicks: metrics["DeadClickCount"] ?? null,
      rageClicks: metrics["RageClickCount"] ?? null,
      excessiveScroll: metrics["ExcessiveScroll"] ?? null,
      quickbackClick: metrics["QuickbackClick"] ?? null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Clarity no respondio.";
    const isTransientUpstream = /Clarity API error 5\d\d:/.test(message);
    const isRateLimited = /Clarity API error 429:|Exceeded daily limit/i.test(message);
    return {
      live: false,
      error: !isTransientUpstream && !isRateLimited,
      degraded: isTransientUpstream || isRateLimited,
      message: isRateLimited
        ? "Microsoft Clarity alcanzó su límite diario; se reintentará en la próxima actualización."
        : isTransientUpstream
          ? "Servicio externo temporalmente inestable."
          : message,
      deadClicks: null, rageClicks: null, excessiveScroll: null, quickbackClick: null,
    };
  }
}

type BacklinksSection = {
  live: boolean;
  error?: boolean;
  message: string;
  byDomain: Array<{ domain: string; total: number | null; referring_domains: number | null; rank: number | null; spam_score: number | null; date: string | null; source_origin: "db" | "live" | "missing" }>;
  trend: Array<{ date: string; domain: string; total: number | null; referring_domains: number | null }>;
};

async function loadBacklinksSection(configs: CountryConfig[]): Promise<BacklinksSection> {
  if (!await getRuntimeVariable("DATAFORSEO_LOGIN")) {
    return { live: false, message: "Falta DATAFORSEO_LOGIN.", byDomain: [], trend: [] };
  }
  const byDomain: BacklinksSection["byDomain"] = [];
  const trend: BacklinksSection["trend"] = [];
  let anyData = false;
  const errors: string[] = [];

  for (const config of configs) {
    const cached = await getLatestBacklinks(config.domain).catch(() => null);
    if (cached) {
      byDomain.push({ domain: config.domain, total: cached.total_backlinks, referring_domains: cached.referring_domains, rank: cached.rank, spam_score: cached.spam_score, date: cached.snapshot_date, source_origin: "db" });
      anyData = true;
      const series = await getBacklinksTrend(config.domain, 12).catch(() => []);
      for (const row of series) trend.push({ date: row.snapshot_date, domain: row.domain, total: row.total_backlinks, referring_domains: row.referring_domains });
      continue;
    }
    // No DB row yet -> live (cheap, ~$0.02)
    try {
      const result = await post("/backlinks/summary/live", { target: config.domain, include_subdomains: true }) as { tasks?: Array<{ status_code: number; status_message: string; result?: Array<{ backlinks?: number; referring_domains?: number; rank?: number; backlinks_spam_score?: number }> }> };
      const task = result.tasks?.[0];
      if (task && task.status_code === 20000) {
        const sum = task.result?.[0] ?? {};
        byDomain.push({ domain: config.domain, total: sum.backlinks ?? null, referring_domains: sum.referring_domains ?? null, rank: sum.rank ?? null, spam_score: sum.backlinks_spam_score ?? null, date: new Date().toISOString().slice(0, 10), source_origin: "live" });
        anyData = true;
      } else {
        byDomain.push({ domain: config.domain, total: null, referring_domains: null, rank: null, spam_score: null, date: null, source_origin: "missing" });
        if (task?.status_message) errors.push(`${config.domain}: ${task.status_message}`);
      }
    } catch (error) {
      errors.push(`${config.domain}: ${error instanceof Error ? error.message : "Backlinks error"}`);
      byDomain.push({ domain: config.domain, total: null, referring_domains: null, rank: null, spam_score: null, date: null, source_origin: "missing" });
    }
  }

  return {
    live: anyData,
    error: !anyData && errors.length > 0,
    message: anyData ? (errors.length ? `Datos parciales. ${errors.join(" | ")}` : "Datos reales disponibles.") : (errors.join(" | ") || "Sin datos de backlinks."),
    byDomain,
    trend,
  };
}

type LlmVisibilitySection = SeoDashboardData["ai_visibility"] & {};

async function loadLlmVisibilitySection(configs: CountryConfig[]): Promise<NonNullable<SeoDashboardData["ai_visibility"]>> {
  const byDomain: Array<{ domain: string; chat_gpt_mentions: number | null; google_mentions: number | null; date: string | null }> = [];
  let anyData = false;
  for (const config of configs) {
    const rows = await getLatestLlmVisibility(config.domain).catch(() => []);
    if (rows.length === 0) {
      byDomain.push({ domain: config.domain, chat_gpt_mentions: null, google_mentions: null, date: null });
      continue;
    }
    const chat = rows.find((r) => r.platform === "chat_gpt");
    const google = rows.find((r) => r.platform === "google");
    byDomain.push({
      domain: config.domain,
      chat_gpt_mentions: chat?.mentions_count ?? null,
      google_mentions: google?.mentions_count ?? null,
      date: rows[0]?.snapshot_date ?? null,
    });
    if (chat || google) anyData = true;
  }
  return {
    by_domain: byDomain,
    has_data: anyData,
    note: anyData
      ? "Datos historicos de LLM visibility cargados desde la DB."
      : "Sin snapshots de LLM visibility todavia. Corre el cron weekly el lunes o usa snapshot_run_now con tasks=['llm'].",
  };
}

async function loadHistorySummary(configs: CountryConfig[]): Promise<Array<{ domain: string; total_tracked: number; top3: number; top10: number; avg_position: number | null; snapshot_date: string }>> {
  const out: Array<{ domain: string; total_tracked: number; top3: number; top10: number; avg_position: number | null; snapshot_date: string }> = [];
  for (const config of configs) {
    const r = await getLatestDomainRankings(config.domain).catch(() => null);
    if (r) {
      out.push({ domain: config.domain, total_tracked: r.total_tracked, top3: r.top3, top10: r.top10, avg_position: r.avg_position, snapshot_date: r.snapshot_date });
    }
  }
  return out;
}
