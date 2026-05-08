import { gscPost } from "../gsc-client.js";
import { ga4Post } from "../ga4-client.js";
import { getPersistenceSql, ensurePersistenceSchema } from "../persistence-store.js";
import { getRuntimeVariable } from "../runtime-config.js";

type SiteConfig = {
  domain: string;
  gscProperty: string;
  ga4PropertyId: string | null;
};

async function loadSiteConfigs(): Promise<SiteConfig[]> {
  const configs: SiteConfig[] = [];
  const co = await getRuntimeVariable("DNA_DOMAIN_CO");
  const coSite = await getRuntimeVariable("DNA_SITE_CO");
  const coProp = await getRuntimeVariable("GA4_PROPERTY_ID_CO") ?? await getRuntimeVariable("GA4_PROPERTY_ID");
  if (co && coSite) configs.push({ domain: co, gscProperty: coSite, ga4PropertyId: coProp ?? null });

  const mx = await getRuntimeVariable("DNA_DOMAIN_MX");
  const mxSite = await getRuntimeVariable("DNA_SITE_MX");
  const mxProp = await getRuntimeVariable("GA4_PROPERTY_ID_MX");
  if (mx && mxSite) configs.push({ domain: mx, gscProperty: mxSite, ga4PropertyId: mxProp ?? null });

  const lta = await getRuntimeVariable("DNA_DOMAIN_LTA");
  const ltaSite = await getRuntimeVariable("DNA_SITE_LTA");
  const ltaProp = await getRuntimeVariable("GA4_PROPERTY_ID_LTA");
  if (lta && ltaSite) configs.push({ domain: lta, gscProperty: ltaSite, ga4PropertyId: ltaProp ?? null });

  return configs;
}

async function captureGscDay(site: SiteConfig, date: string): Promise<{ clicks: number; impressions: number; ctr: number; position: number } | null> {
  const result = await gscPost(`/sites/${encodeURIComponent(site.gscProperty)}/searchAnalytics/query`, {
    startDate: date,
    endDate: date,
    rowLimit: 1,
    type: "web",
  }) as { rows?: Array<{ clicks: number; impressions: number; ctr: number; position: number }> };
  const row = result.rows?.[0];
  return row ?? null;
}

async function captureGa4Day(propertyId: string, date: string): Promise<{ sessions: number; organic_sessions: number; conversions: number } | null> {
  const property = propertyId.startsWith("properties/") ? propertyId : `properties/${propertyId}`;
  const totalRes = await ga4Post(`/${property}:runReport`, {
    dateRanges: [{ startDate: date, endDate: date }],
    metrics: [{ name: "sessions" }, { name: "conversions" }],
  }) as { rows?: Array<{ metricValues?: Array<{ value: string }> }> };
  const total = totalRes.rows?.[0]?.metricValues ?? [];

  const organicRes = await ga4Post(`/${property}:runReport`, {
    dateRanges: [{ startDate: date, endDate: date }],
    metrics: [{ name: "sessions" }],
    dimensions: [{ name: "sessionDefaultChannelGroup" }],
    dimensionFilter: { filter: { fieldName: "sessionDefaultChannelGroup", stringFilter: { value: "Organic Search", matchType: "EXACT" } } },
  }) as { rows?: Array<{ metricValues?: Array<{ value: string }> }> };
  const organic = organicRes.rows?.[0]?.metricValues?.[0]?.value;

  return {
    sessions: Number(total[0]?.value ?? 0),
    organic_sessions: organic ? Number(organic) : 0,
    conversions: Number(total[1]?.value ?? 0),
  };
}

export async function captureTraffic(snapshotDate: string): Promise<{ ok: number; failed: number; errors: Array<{ domain: string; source: string; error: string }> }> {
  const sql = getPersistenceSql();
  if (!sql) throw new Error("DATABASE_URL not configured");
  await ensurePersistenceSchema();

  const sites = await loadSiteConfigs();
  let ok = 0;
  const errors: Array<{ domain: string; source: string; error: string }> = [];

  for (const site of sites) {
    try {
      const gsc = await captureGscDay(site, snapshotDate);
      if (gsc) {
        await sql`
          insert into seo_traffic_daily (date, domain, source, clicks, impressions, ctr, position)
          values (${snapshotDate}, ${site.domain}, 'gsc', ${gsc.clicks}, ${gsc.impressions}, ${gsc.ctr}, ${gsc.position})
          on conflict (date, domain, source) do update set
            clicks = excluded.clicks, impressions = excluded.impressions,
            ctr = excluded.ctr, position = excluded.position, captured_at = now()
        `;
        ok++;
      }
    } catch (error) {
      errors.push({ domain: site.domain, source: "gsc", error: error instanceof Error ? error.message : "unknown" });
    }

    if (site.ga4PropertyId) {
      try {
        const ga4 = await captureGa4Day(site.ga4PropertyId, snapshotDate);
        if (ga4) {
          await sql`
            insert into seo_traffic_daily (date, domain, source, sessions, organic_sessions, conversions)
            values (${snapshotDate}, ${site.domain}, 'ga4', ${ga4.sessions}, ${ga4.organic_sessions}, ${ga4.conversions})
            on conflict (date, domain, source) do update set
              sessions = excluded.sessions, organic_sessions = excluded.organic_sessions,
              conversions = excluded.conversions, captured_at = now()
          `;
          ok++;
        }
      } catch (error) {
        errors.push({ domain: site.domain, source: "ga4", error: error instanceof Error ? error.message : "unknown" });
      }
    }
  }

  return { ok, failed: errors.length, errors };
}

export async function autoExpandUniverseFromGsc(daysBack: number = 7, perDomainLimit: number = 100): Promise<{ added: number; skipped: number }> {
  const sql = getPersistenceSql();
  if (!sql) throw new Error("DATABASE_URL not configured");
  await ensurePersistenceSchema();

  const sites = await loadSiteConfigs();
  const today = new Date();
  const start = new Date(today.getTime() - daysBack * 86400_000).toISOString().slice(0, 10);
  const end = today.toISOString().slice(0, 10);

  let added = 0;
  let skipped = 0;

  for (const site of sites) {
    const countryCode = site.domain.endsWith(".mx") ? "mx" : "co";
    const existing = await sql`select count(*)::int as c from seo_keyword_universe where domain = ${site.domain}` as Array<{ c: number }>;
    if ((existing[0]?.c ?? 0) >= perDomainLimit) continue;

    try {
      const result = await gscPost(`/sites/${encodeURIComponent(site.gscProperty)}/searchAnalytics/query`, {
        startDate: start,
        endDate: end,
        dimensions: ["query"],
        rowLimit: 25,
        type: "web",
      }) as { rows?: Array<{ keys?: string[]; impressions?: number; clicks?: number }> };
      const queries = (result.rows ?? []).filter((row) => Number(row.impressions ?? 0) >= 100);
      for (const row of queries) {
        const keyword = row.keys?.[0];
        if (!keyword) continue;
        const inserted = await sql`
          insert into seo_keyword_universe (keyword, domain, country_code, is_core, source)
          values (${keyword}, ${site.domain}, ${countryCode}, false, 'auto_gsc')
          on conflict (keyword, domain, country_code) do nothing
          returning id
        ` as Array<{ id: number }>;
        if (inserted.length) added++; else skipped++;
      }
    } catch (error) {
      // skip silently — site might not be verified or have data
    }
  }

  return { added, skipped };
}
