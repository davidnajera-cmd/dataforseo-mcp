# SEO MCP — Cierre de gaps detectados por claude.ai

**Fecha:** 2026-05-08
**Autor:** David + Claude

## Contexto

Claude.ai detectó al usar el SEO MCP que faltan capacidades concretas. Tras revisar el código se confirmó que la mayoría de "conectores faltantes" (GSC, GA4, Clarity, Ahrefs/Semrush) ya están implementados y solo necesitan credenciales. Los gaps de **código real** son seis:

1. Bing Webmaster Tools
2. Wayback Machine
3. Validador de schema markup
4. Verificación de redirect chain ad-hoc para una URL
5. Análisis de log files
6. Wrapper síncrono que orqueste el crawl async de OnPage

Más una activación de cuenta (no-código): suscripción Backlinks en DataForSEO.

## Decisiones

- **Patrón:** una tool por gap (atómicas), siguiendo el estilo del resto del MCP (159 tools atómicas existentes).
- **Estructura:** archivos `tools-<area>.ts` y `<area>-client.ts` cuando hay HTTP/auth propio.
- **Registro:** todas las nuevas tools se registran en [`src/server.ts`](../../../src/server.ts).
- **Credenciales:** se agregan a `RUNTIME_VARIABLE_SPECS` en [`src/runtime-config.ts`](../../../src/runtime-config.ts) para que se administren igual que las demás (Neon DB encriptada o env var fallback).

## Tools nuevas

### Bing Webmaster Tools (`tools-bing.ts` + `bing-client.ts`)

Auth: API key en query string (`apikey=...`), no OAuth.

| Tool | Endpoint Bing | Descripción |
|---|---|---|
| `bing_get_sites` | `GetUserSites` | Lista propiedades verificadas |
| `bing_get_query_stats` | `GetQueryStats` | Clicks/impressions por query |
| `bing_get_page_stats` | `GetPageStats` | Mismas métricas por página |
| `bing_get_crawl_stats` | `GetCrawlStats` | Errores de crawl, indexación |
| `bing_submit_url` | `SubmitUrl` | Envío manual (cuota 10k/día) |

Credencial nueva: `BING_WEBMASTER_API_KEY`.

### Wayback Machine (`tools-wayback.ts`, sin client — fetch directo)

API pública, sin auth.

| Tool | API | Descripción |
|---|---|---|
| `wayback_get_snapshots` | CDX `/cdx/search/cdx` | Lista snapshots de URL en rango de fechas |
| `wayback_get_closest` | `/wayback/available` | Snapshot más cercano a una fecha |
| `wayback_diff_snapshots` | `/web/<ts>/<url>` | Compara HTML entre dos snapshots |

### Schema validator (`tools-schema.ts`)

| Tool | Descripción |
|---|---|
| `schema_validate_url` | Validator de schema.org (POST `validator.schema.org/validate`) |
| `schema_extract_url` | Extrae JSON-LD/Microdata parseando HTML del URL |

### HTTP utils (`tools-http-utils.ts`)

| Tool | Descripción |
|---|---|
| `redirect_chain_check` | Sigue 30x manualmente, devuelve cada hop con status, location, latency. Max 10 hops. |
| `http_headers_inspect` | Devuelve headers + status sin seguir redirects |

### Log file analyzer (`tools-logs.ts`)

| Tool | Descripción |
|---|---|
| `log_file_analyze` | Parsea Common Log Format / Combined. Reporta top 404s, top user agents, distribución de status, top URLs por hits. Acepta texto raw o URL pública. |

### Sync crawl wrapper (extiende `tools-seo-workflows.ts`)

| Tool | Descripción |
|---|---|
| `onpage_full_crawl_sync` | Llama `task_post`, hace poll cada 30s, espera hasta `max_wait_seconds` (default 300, max 600), trae `summary` + `pages`. Si timeout, devuelve `task_id` para consultar después. |

## Activación Backlinks DataForSEO

NO es código. Se agregan instrucciones a un README al final del repo. Resumen: login en `app.dataforseo.com` → Subscription → activar módulo Backlinks. Costo aproximado $50/mes en plan Standard. Una vez activado, las 11 tools `backlinks_*` que ya existen empiezan a responder.

## Error handling

Mismo patrón que el resto del MCP: `throw new Error("<API> error <status>: <body>")`. El SDK MCP lo convierte a respuesta de error.

## Testing

No hay tests automatizados en el repo. Validación manual via Vercel preview. Sin script de smoke test inicialmente — se evalúa después.

## Out of scope

- Ahrefs/Semrush API keys (usuario decidió skip por costo).
- Tests automatizados.
- Visualización de resultados de crawl en UI propia.
