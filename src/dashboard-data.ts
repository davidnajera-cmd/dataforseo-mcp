import { post } from "./dataforseo-client.js";
import { gscPost } from "./gsc-client.js";
import { ga4Post } from "./ga4-client.js";
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
} from "./persistence-store.js";

export type CountryCode = "all" | "co" | "mx" | "lta";
export type Timeframe = "monthly" | "weekly";
export type Channel = "all" | "blog" | "programs" | "campaigns";

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
  colombia: string;
  mexico: string;
  lta: string;
  leader: "Colombia" | "Mexico" | "La Tienda de Audio" | "Empate" | "Sin datos";
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
  status: "live" | "pending" | "error";
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

const DEFAULT_FILTERS: DashboardFilters = {
  country: "all",
  timeframe: "monthly",
  channel: "all",
  startDate: "2026-04-01",
  endDate: "2026-04-28",
};

type SiteCode = "co" | "mx" | "lta";

type CountryConfig = {
  code: SiteCode;
  name: "Colombia" | "Mexico" | "La Tienda de Audio";
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
  return {
    country: isCountry(input.country) ? input.country : DEFAULT_FILTERS.country,
    timeframe: input.timeframe === "weekly" ? "weekly" : "monthly",
    channel: isChannel(input.channel) ? input.channel : DEFAULT_FILTERS.channel,
    startDate: input.startDate || DEFAULT_FILTERS.startDate,
    endDate: input.endDate || DEFAULT_FILTERS.endDate,
  };
}

export async function collectSeoDashboardData(input: Partial<DashboardFilters>): Promise<SeoDashboardData> {
  const filters = normalizeFilters(input);
  const countries = filters.country === "all" ? (["co", "mx", "lta"] as const) : ([filters.country] as const);
  const configs = await Promise.all(countries.map(getCountryConfig));
  const sources: SourceStatus[] = [];

  const [gsc, dataforseo, pagespeed, ga4, clarity, backlinksData, llmData, historyData] = await Promise.all([
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
      sources.push({ name: "Microsoft Clarity", status: data.live ? "live" : data.error ? "error" : "pending", message: data.message });
      return data;
    }),
    loadBacklinksSection(configs).then((data) => {
      sources.push({ name: "Backlinks (DataForSEO)", status: data.live ? "live" : data.error ? "error" : "pending", message: data.message });
      return data;
    }),
    loadLlmVisibilitySection(configs).then((data) => {
      sources.push({ name: "LLM Visibility (DataForSEO)", status: data.has_data ? "live" : "pending", message: data.note });
      return data;
    }),
    loadHistorySummary(configs),
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
      value: "No conectado",
      delta: null,
      detail: "No hay fuente CRM/lead real conectada todavia.",
      source: "Pendiente CRM",
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
    .filter((source) => source.status !== "live")
    .map((source) => `${source.name}: ${source.message}`);

  return {
    generatedAt: new Date().toISOString(),
    filters,
    overview: {
      verdict: hasGsc || hasKeywords || hasTechnical ? "Datos reales parciales" : "Sin datos reales suficientes",
      summary: pendingReasons.length
        ? `El tablero solo muestra fuentes reales. Pendiente: ${pendingReasons.join(" | ")}`
        : "Todas las metricas visibles provienen de fuentes reales conectadas.",
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
        { name: "Sesiones GA4", leads: ga4.totals.sessions, conversion: ga4.totals.conversions },
        { name: "Organico SEO", leads: ga4.totals.organic_sessions, conversion: null },
        { name: "WhatsApp", leads: null, conversion: null },
        { name: "Formulario", leads: null, conversion: null },
      ],
      opportunities: buildRealOpportunities(gsc, dataforseo, pagespeed),
    },
    comparison: buildComparison(gsc.byCountry),
    sources: sources.sort((a, b) => a.name.localeCompare(b.name)),
    ga4: {
      sessions: ga4.totals.sessions,
      organic_sessions: ga4.totals.organic_sessions,
      conversions: ga4.totals.conversions,
      by_domain: ga4.byDomain,
      series: ga4.series,
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
  if (country === "co") {
    return {
      code: "co",
      name: "Colombia",
      site: await getRuntimeVariable("DNA_SITE_CO") ?? "https://dnamusic.edu.co/",
      domain: await getRuntimeVariable("DNA_DOMAIN_CO") ?? "dnamusic.edu.co",
      canonicalUrl: await getRuntimeVariable("DNA_CANONICAL_URL") ?? "https://www.dnamusic.edu.co/",
      locationCode: Number(await getRuntimeVariable("DNA_LOCATION_CO") ?? 2170),
      published: true,
      ga4PropertyId: (await getRuntimeVariable("GA4_PROPERTY_ID_CO")) ?? (await getRuntimeVariable("GA4_PROPERTY_ID")) ?? null,
    };
  }
  if (country === "mx") {
    return {
      code: "mx",
      name: "Mexico",
      site: await getRuntimeVariable("DNA_SITE_MX") ?? "sc-domain:dnamusic.mx",
      domain: await getRuntimeVariable("DNA_DOMAIN_MX") ?? "dnamusic.mx",
      canonicalUrl: await getRuntimeVariable("DNA_CANONICAL_URL_MX") ?? "https://dnamusic.mx/",
      locationCode: Number(await getRuntimeVariable("DNA_LOCATION_MX") ?? 2484),
      published: (await getRuntimeVariable("DNA_MX_PUBLISHED")) === "true",
      ga4PropertyId: (await getRuntimeVariable("GA4_PROPERTY_ID_MX")) ?? null,
    };
  }
  // lta
  return {
    code: "lta",
    name: "La Tienda de Audio",
    site: await getRuntimeVariable("DNA_SITE_LTA") ?? "sc-domain:latiendadeaudio.com",
    domain: await getRuntimeVariable("DNA_DOMAIN_LTA") ?? "latiendadeaudio.com",
    canonicalUrl: await getRuntimeVariable("DNA_CANONICAL_URL_LTA") ?? "https://latiendadeaudio.com/",
    locationCode: Number(await getRuntimeVariable("DNA_LOCATION_LTA") ?? 2170),
    published: true,
    ga4PropertyId: (await getRuntimeVariable("GA4_PROPERTY_ID_LTA")) ?? null,
  };
}

async function loadSearchConsole(filters: DashboardFilters, configs: CountryConfig[]): Promise<GscData> {
  if (!await getRuntimeVariable("GOOGLE_CLIENT_ID") || !await getRuntimeVariable("GOOGLE_CLIENT_SECRET") || !await getRuntimeVariable("GOOGLE_REFRESH_TOKEN")) {
    return emptyGsc("Faltan credenciales de Google Search Console.");
  }

  const byCountry = emptyCountryData();
  const allPages: PageMetric[] = [];
  const trendMap = new Map<string, TrendPoint>();
  let clicks = 0;
  let impressions = 0;
  let weightedPosition = 0;
  let liveCount = 0;
  const errors: string[] = [];

  for (const config of configs) {
    if (!config.published && config.code === "mx") {
      errors.push("Mexico: sitio marcado como no publicado.");
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
        const existing = trendMap.get(point.label) ?? { label: point.label, organic: 0, leads: null, ctr: null };
        existing.organic += point.organic;
        existing.ctr = point.ctr;
        trendMap.set(point.label, existing);
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
    trends: [...trendMap.values()].sort((a, b) => a.label.localeCompare(b.label)),
    byCountry,
  };
}

async function loadSearchConsoleForConfig(filters: DashboardFilters, config: CountryConfig) {
  const attemptErrors: Array<{ site: string; error: unknown }> = [];

  for (const site of gscPropertyCandidates(config)) {
    try {
      const [summary, pages, trend] = await Promise.all([
        gscPost(`/sites/${encodeURIComponent(site)}/searchAnalytics/query`, {
          startDate: filters.startDate,
          endDate: filters.endDate,
          rowLimit: 1,
          type: "web",
        }),
        gscPost(`/sites/${encodeURIComponent(site)}/searchAnalytics/query`, {
          startDate: filters.startDate,
          endDate: filters.endDate,
          dimensions: ["page"],
          rowLimit: 20,
          type: "web",
        }),
        gscPost(`/sites/${encodeURIComponent(site)}/searchAnalytics/query`, {
          startDate: filters.startDate,
          endDate: filters.endDate,
          dimensions: ["date"],
          rowLimit: 1000,
          type: "web",
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
      .filter((config) => config.published || config.code !== "mx")
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
      message: error instanceof Error ? error.message : "PageSpeed no respondio.",
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
  return getRows(raw).map((row) => ({
    path: String(row.keys?.[0] ?? "/"),
    sessions: Number(row.clicks ?? 0),
    ctr: Number(row.ctr ?? 0) * 100,
    conversion: null,
    status: Number(row.ctr ?? 0) < 0.025 && Number(row.impressions ?? 0) > 100 ? "Optimizar" : "Sin historico",
  }));
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

function buildComparison(data: GscData["byCountry"]): CountryMetric[] {
  return [
    {
      metric: "Clics organicos",
      colombia: displayNumber(data.co.clicks),
      mexico: displayNumber(data.mx.clicks),
      lta: displayNumber(data.lta.clicks),
      leader: leader3(data.co.clicks, data.mx.clicks, data.lta.clicks),
    },
    {
      metric: "Impresiones",
      colombia: displayNumber(data.co.impressions),
      mexico: displayNumber(data.mx.impressions),
      lta: displayNumber(data.lta.impressions),
      leader: leader3(data.co.impressions, data.mx.impressions, data.lta.impressions),
    },
    {
      metric: "CTR promedio",
      colombia: displayPercent(data.co.ctr),
      mexico: displayPercent(data.mx.ctr),
      lta: displayPercent(data.lta.ctr),
      leader: leader3(data.co.ctr, data.mx.ctr, data.lta.ctr),
    },
  ];
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
  return {
    co: { clicks: null, impressions: null, ctr: null },
    mx: { clicks: null, impressions: null, ctr: null },
    lta: { clicks: null, impressions: null, ctr: null },
  };
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

function leader(a: number | null, b: number | null): "Colombia" | "Mexico" | "Empate" | "Sin datos" {
  if (a === null || b === null) return "Sin datos";
  if (a === b) return "Empate";
  return a > b ? "Colombia" : "Mexico";
}

function leader3(co: number | null, mx: number | null, lta: number | null): CountryMetric["leader"] {
  const entries: Array<["Colombia" | "Mexico" | "La Tienda de Audio", number | null]> = [
    ["Colombia", co], ["Mexico", mx], ["La Tienda de Audio", lta],
  ];
  const valid = entries.filter(([, v]) => v !== null) as Array<["Colombia" | "Mexico" | "La Tienda de Audio", number]>;
  if (valid.length === 0) return "Sin datos";
  const max = Math.max(...valid.map(([, v]) => v));
  const winners = valid.filter(([, v]) => v === max);
  if (winners.length > 1) return "Empate";
  return winners[0][0];
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("es-CO").format(Math.round(value));
}

function isCountry(value: unknown): value is CountryCode {
  return value === "all" || value === "co" || value === "mx";
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
};

async function loadGa4(configs: CountryConfig[]): Promise<Ga4DashboardSection> {
  if (!await getRuntimeVariable("GOOGLE_REFRESH_TOKEN")) {
    return { live: false, message: "Falta GOOGLE_REFRESH_TOKEN.", totals: { sessions: null, organic_sessions: null, conversions: null }, byDomain: [], series: [] };
  }
  const byDomain: Ga4DashboardSection["byDomain"] = [];
  const seriesMap = new Map<string, { sessions: number; organic_sessions: number; conversions: number }>();
  let totalsSessions = 0;
  let totalsOrganic = 0;
  let totalsConv = 0;
  let anyData = false;
  const errors: string[] = [];

  for (const config of configs) {
    if (!config.ga4PropertyId) {
      byDomain.push({ domain: config.domain, sessions: null, organic_sessions: null, conversions: null, date: null, source_origin: "missing" });
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
      continue;
    }
    // DB empty -> live
    try {
      const property = config.ga4PropertyId.startsWith("properties/") ? config.ga4PropertyId : `properties/${config.ga4PropertyId}`;
      const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
      const total = await ga4Post(`/${property}:runReport`, {
        dateRanges: [{ startDate: yesterday, endDate: yesterday }],
        metrics: [{ name: "sessions" }, { name: "conversions" }],
      }) as { rows?: Array<{ metricValues?: Array<{ value: string }> }> };
      const mv = total.rows?.[0]?.metricValues ?? [];
      const sessions = mv[0] ? Number(mv[0].value) : 0;
      const conversions = mv[1] ? Number(mv[1].value) : 0;
      byDomain.push({ domain: config.domain, sessions, organic_sessions: null, conversions, date: yesterday, source_origin: "live" });
      totalsSessions += sessions;
      totalsConv += conversions;
      anyData = true;
    } catch (error) {
      errors.push(`${config.domain}: ${error instanceof Error ? error.message : "GA4 error"}`);
      byDomain.push({ domain: config.domain, sessions: null, organic_sessions: null, conversions: null, date: null, source_origin: "missing" });
    }
  }

  const series = [...seriesMap.entries()].map(([date, v]) => ({ date, ...v })).sort((a, b) => a.date.localeCompare(b.date));
  return {
    live: anyData,
    error: errors.length > 0 && !anyData,
    message: anyData ? (errors.length ? `Datos parciales. ${errors.join(" | ")}` : "Datos reales disponibles.") : (errors.join(" | ") || "Sin datos GA4 todavia."),
    totals: { sessions: anyData ? totalsSessions : null, organic_sessions: anyData ? totalsOrganic : null, conversions: anyData ? totalsConv : null },
    byDomain,
    series,
  };
}

type ClaritySection = {
  live: boolean;
  error?: boolean;
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
    return {
      live: false,
      error: true,
      message: error instanceof Error ? error.message : "Clarity no respondio.",
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
