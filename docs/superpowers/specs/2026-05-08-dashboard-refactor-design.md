# Dashboard refactor — DB-first

**Fecha:** 2026-05-08
**Decisión:** Opción B (reescribir leyendo de DB histórica, fallback a live API).

## Problema

`src/dashboard-data.ts` actual hace 3 fetches en vivo en cada request (GSC, DataForSEO Labs, PageSpeed). No usa la persistencia que acabamos de construir. Solo soporta CO+MX (LTA queda fuera). Ignora 7 fuentes activadas (GA4, Clarity, Backlinks, LLM, Bing, SerpAPI, history tables).

## Diseño

### Estrategia de datos

Para cada sección del dashboard:

1. **Query Postgres history primero.** Si hay rows recientes (último snapshot), usar.
2. **Fallback a live API.** Si DB vacía (cron aún no corrió), llamar API directo.
3. **Backfill on-demand.** Cada live call escribe a la tabla histórica para que la próxima visita sea desde DB.

Eventualmente (después de unos días de cron) todo viene de DB → dashboard rápido y barato.

### Cambios en types

```ts
type CountryCode = "all" | "co" | "mx" | "lta"  // <- agregar lta
```

### Helpers nuevos en persistence-store.ts

- `getLatestTrafficSnapshot(domain, source)` → último row de `seo_traffic_daily`
- `getTrafficTrend(domain, source, days)` → series de fechas para chart
- `getLatestRankingsByDomain(domain)` → último ranking de cada keyword
- `getRankingBucketsTrend(domain, days)` → top3/top10/top100 counts por día
- `getLatestBacklinks(domain)` → último row de `seo_backlink_snapshots`
- `getBacklinksTrend(domain, weeks)` → series semanales
- `getLatestLlmVisibility(target_value)` → últimas mentions por plataforma

### Refactor de dashboard-data.ts

`SeoDashboardData` mantiene el mismo shape para no romper frontend, pero agrega nuevos campos opcionales:

```ts
type SeoDashboardData = {
  // ... existing fields
  ai_visibility?: {        // <- nuevo
    chat_gpt_mentions: number | null;
    google_ai_mentions: number | null;
    domains_in_top_sources: string[];
  };
  backlinks?: {            // <- nuevo
    total: number | null;
    referring_domains: number | null;
    rank: number | null;
    spam_score: number | null;
    trend: Array<{date, total, referring_domains}>;
  };
  bing?: {                 // <- nuevo
    queries_count: number | null;  // Bing los presenta agregados
    indexed_pages: number | null;
  };
  ga4?: {                  // <- nuevo, llena el panel "Leads"
    sessions: number | null;
    organic_sessions: number | null;
    conversions: number | null;
    series: Array<{date, sessions, conversions}>;
  };
  clarity?: {              // <- nuevo, llena panel técnico
    dead_clicks: number | null;
    rage_clicks: number | null;
    excessive_scroll: number | null;
  };
};
```

### Country config

`getCountryConfig(country)` se extiende para `"lta"`:
- `DNA_DOMAIN_LTA`, `DNA_SITE_LTA`, `DNA_LOCATION_LTA`, `GA4_PROPERTY_ID_LTA`

`collectSeoDashboardData` cuando `filters.country === "all"` ahora itera sobre los 3 sitios.

## Phase 2 (separado)

Frontend updates: nuevos paneles `Visibilidad AI`, `Backlinks Health`, actualización de `Salud Técnica` (Clarity), `Leads` (GA4 conversions), filtro LTA.

## Out of scope

- SerpAPI — no se integra al dashboard, queda como tool ad-hoc.
- Bing query stats detallado — solo aggregates por ahora (la API devuelve por mes, no por día).
- Dashboard mensual/semanal con vista propia — siguen mostrando lo mismo que overview pero filtrando timeframe.
