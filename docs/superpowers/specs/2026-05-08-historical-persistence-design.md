# Historical persistence pipeline

**Fecha:** 2026-05-08
**Autor:** David + Claude

## Problema

El SEO MCP responde preguntas en vivo ("¿dónde rankea X ahora?") pero no puede responder tendencias ("¿cómo evolucionó en 12 semanas?", "¿cuándo perdimos esa posición?"). Sin historia no hay estrategia, sólo diagnóstico.

## Solución

Pipeline ETL diario que captura snapshots time-series en Neon Postgres (mismo DB ya conectado) y tools MCP que leen ese histórico.

## Decisiones aprobadas

- **Universe**: 25 keywords × 3 sitios = 75 totales.
- **Tier**: 5 core/sitio (15 totales) chequeo diario; 20 no-core/sitio (60 totales) semanal.
- **Sitios**: dnamusic.edu.co (CO), dnamusic.mx (MX), latiendadeaudio.com (CO).
- **Cron**: Una sola función diaria; rama interna por día de semana (lunes = tareas semanales).
- **Costo objetivo**: ~$73/mes.

## Schema (5 tablas nuevas)

```sql
-- Universe de keywords trackeados
seo_keyword_universe (
  id bigserial primary key,
  keyword text not null,
  domain text not null,            -- dnamusic.edu.co | dnamusic.mx | latiendadeaudio.com
  country_code text not null,      -- co | mx
  is_core boolean not null default false,
  intent text,                     -- informational | commercial | transactional | navigational
  source text not null default 'manual',  -- manual | auto_gsc
  added_at timestamptz not null default now(),
  last_checked_at timestamptz,
  active boolean not null default true,
  unique(keyword, domain, country_code)
);

-- Rankings diarios (para core) y semanales (para no-core)
seo_keyword_rankings (
  id bigserial primary key,
  snapshot_date date not null,
  keyword_id bigint references seo_keyword_universe(id),
  domain text not null,
  position numeric,                -- null = no rankeando en top 100
  url_ranking text,
  search_volume integer,
  serp_features jsonb,             -- {featured_snippet: bool, ai_overview: bool, ...}
  captured_at timestamptz not null default now()
);
create index on seo_keyword_rankings (keyword_id, snapshot_date desc);
create index on seo_keyword_rankings (domain, snapshot_date desc);

-- Backlinks weekly summary
seo_backlink_snapshots (
  id bigserial primary key,
  snapshot_date date not null,
  domain text not null,
  total_backlinks integer,
  referring_domains integer,
  referring_main_domains integer,
  broken_backlinks integer,
  rank integer,
  spam_score integer,
  top_anchors jsonb,               -- [{anchor, count}, ...]
  top_referring_domains jsonb,
  captured_at timestamptz not null default now(),
  unique(snapshot_date, domain)
);

-- LLM visibility weekly
seo_llm_visibility (
  id bigserial primary key,
  snapshot_date date not null,
  target_type text not null,       -- domain | keyword
  target_value text not null,
  platform text not null,          -- chat_gpt | google
  mentions_count integer,
  ai_search_volume integer,
  top_sources jsonb,
  captured_at timestamptz not null default now()
);
create index on seo_llm_visibility (target_value, snapshot_date desc);

-- Traffic daily (GSC + GA4)
seo_traffic_daily (
  id bigserial primary key,
  date date not null,
  domain text not null,
  source text not null,            -- gsc | ga4
  clicks integer,
  impressions integer,
  ctr numeric,
  position numeric,
  sessions integer,
  organic_sessions integer,
  conversions integer,
  metrics_extra jsonb,             -- catch-all for source-specific fields
  captured_at timestamptz not null default now(),
  unique(date, domain, source)
);
create index on seo_traffic_daily (domain, date desc);
```

## Captura — módulos

```
src/snapshots/
  capture-rankings.ts    -- usa labs_google_ranked_keywords + serp_google_organic_live
  capture-backlinks.ts   -- usa backlinks_summary
  capture-llm.ts         -- usa ai_optimization_llm_mentions_search
  capture-traffic.ts     -- GSC searchAnalytics + GA4 runReport
  index.ts               -- orquestador
```

Cada módulo es idempotente sobre `snapshot_date + (keyword_id|domain|target_value)`. Si falla a mitad del run, reintentar al día siguiente no duplica.

## Cron endpoint

`api/cron/snapshot.ts`:

- Auth: header `Authorization: Bearer <CRON_SECRET>` (Vercel firma sus crons).
- Lógica:
  - Siempre: `capture-traffic` (todos los dominios) + `capture-rankings` (sólo `is_core=true`).
  - Si `dayOfWeek === 1` (lunes UTC): además `capture-rankings` no-core + `capture-backlinks` + `capture-llm` + auto-expand universe.

`vercel.json` cron:
```json
{
  "crons": [
    { "path": "/api/cron/snapshot", "schedule": "0 6 * * *" }
  ]
}
```

## Auto-expansion del universe

Lunes, después de capturar traffic GSC del último 7 días: para cada dominio, las top 10 queries con `impressions > 100` que aún no estén en `seo_keyword_universe` se agregan con `source='auto_gsc'`, `is_core=false`, `active=true`. Tope: 100 keywords/dominio (no se autoagrega más allá de eso).

## Tools MCP nuevas (`tools-history.ts`)

| Tool | Params | Retorna |
|---|---|---|
| `history_keyword_ranking` | keyword, domain, days (default 30) | array `{date, position, url_ranking, search_volume, serp_features}` |
| `history_backlinks` | domain, weeks (default 12) | array `{date, total_backlinks, referring_domains, ...}` |
| `history_llm_visibility` | target_value, target_type, weeks (default 12) | array por plataforma |
| `history_traffic` | domain, days (default 30), source? | array `{date, clicks, impressions, ...}` |
| `keyword_universe_list` | domain?, country_code?, is_core?, source? | rows |
| `keyword_universe_add` | keywords[], domain, country_code, is_core?, intent? | inserted_count |
| `keyword_universe_remove` | id o (keyword, domain, country_code) | ok |
| `keyword_universe_toggle_core` | id, is_core | ok |
| `snapshot_run_now` | task: rankings_core\|rankings_full\|backlinks\|llm\|traffic\|all | manual trigger del cron (admin token) |

## Variables runtime nuevas

- `CRON_SECRET` — secreto para validar requests de Vercel cron.

## Error handling

- Cada captura está aislada: si rankings falla, traffic continúa.
- Errores se loguean a una tabla `seo_snapshot_runs` (run_id, started_at, ended_at, status, errors jsonb) para diagnóstico.
- Si DataForSEO devuelve 40204 (sin Backlinks subscription), captura registra "skipped" y no falla todo.

## Out of scope

- Dashboard visual de tendencias (eso vive en otro repo).
- Alertas (cuando una keyword cae N posiciones). Se puede agregar después como tool `alerts_check`.
- Comparativas entre dominios (cross-domain queries vienen "for free" como queries SQL ad-hoc).

## Plan de implementación

1. Schema + migration helper.
2. Universe management tools (los 4) — sin captura aún, validar que el flujo de manage funciona.
3. Capture rankings (más complejo, paga DataForSEO real). Test manual primero.
4. Capture traffic (GSC + GA4).
5. Capture backlinks (simple, $0.02 cada uno).
6. Capture LLM mentions.
7. Cron endpoint con CRON_SECRET.
8. History query tools.
9. Seed universe con 5 keywords core × 3 sitios = 15 iniciales.
10. Documentar en CLAUDE.md.
