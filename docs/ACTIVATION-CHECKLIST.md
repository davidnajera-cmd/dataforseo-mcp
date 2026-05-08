# Activation checklist — credenciales pendientes

Estado al **2026-05-08** después del deploy de las tools nuevas (Bing, Wayback, Schema, HTTP utils, Logs, sync crawl).

Las tools de código ya están listas. Lo que falta para que **todas** respondan es cargar credenciales. Esto NO se puede hacer desde el código — hay que generarlas en cada proveedor.

## 1. DataForSEO Backlinks (PAGO — bloquea 11 tools)

**Síntoma:** las tools `backlinks_*` devuelven `Access denied`.

**Solución:**

1. Login en https://app.dataforseo.com/
2. Ir a **Subscription** (top-right) o https://app.dataforseo.com/billing
3. Activar el módulo **Backlinks** (~$50/mes en plan Standard, ver tabla de pricing actualizada).
4. Esperar ~5 minutos a que propague.
5. Verificar con: llamar `backlinks_summary` con `target: "dnamusic.edu.co"`.

Tools que se desbloquean: `backlinks_summary`, `backlinks_list`, `backlinks_referring_domains`, `backlinks_anchors`, `backlinks_history`, `backlinks_competitors`, `backlinks_domain_intersection`, `backlinks_bulk_ranks`, `backlinks_bulk_spam_score`, `backlinks_domain_pages`, `backlinks_timeseries_summary`.

## 2. Bing Webmaster Tools (GRATIS — desbloquea 8 tools nuevas)

**Síntoma:** las tools `bing_*` lanzan `BING_WEBMASTER_API_KEY is required`.

**Solución:**

1. Login en https://www.bing.com/webmasters/ con la cuenta Microsoft del dominio.
2. Si `dnamusic.edu.co` no está agregado: **Add a site** → pegar `https://www.dnamusic.edu.co/` → verificar via DNS o meta tag.
3. Settings (engranaje) → **API access** → copiar la API Key.
4. Cargar la key en runtime con admin endpoint:
   ```bash
   curl -X POST https://dataforseo-mcp-three.vercel.app/api/variables \
     -H "x-admin-token: $SEO_VARIABLES_ADMIN_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"name":"BING_WEBMASTER_API_KEY","value":"<paste-here>"}'
   ```
5. Verificar: llamar `bing_get_sites` (debe listar dnamusic.edu.co).

## 3. GA4 — confirmar Property ID (debería estar listo)

**Síntoma:** las tools `ga4_*` fallan o devuelven datos vacíos.

**Verificar:**

1. https://analytics.google.com/ → Admin → Property Settings → copiar **Property ID** (numérico, ej: `123456789`).
2. Revisar que `GA4_PROPERTY_ID` esté cargado en runtime:
   ```bash
   curl https://dataforseo-mcp-three.vercel.app/api/variables \
     -H "x-admin-token: $SEO_VARIABLES_ADMIN_TOKEN"
   ```
3. Si falta, cargarlo igual que Bing (paso 4 arriba).
4. Verificar que el OAuth refresh token tenga scope `analytics.readonly`.

## 4. Google Search Console — confirmar property

**Síntoma:** las tools `gsc_*` devuelven `403` o lista vacía.

**Verificar:**

1. La property `https://dnamusic.edu.co/` (o `sc-domain:dnamusic.edu.co`) debe estar verificada en https://search.google.com/search-console/.
2. La cuenta del OAuth refresh token debe ser **Owner** o **Full user** de la property.
3. Llamar `gsc_sites_list` para confirmar que aparece.
4. Si falta scope, regenerar refresh token con `https://www.googleapis.com/auth/webmasters.readonly`.

## 5. Microsoft Clarity — confirmar token

Ya cargado localmente (verificado en `.env.local`). Verificar en producción:

1. Llamar `clarity_traffic_overview` con `num_of_days: "1"`.
2. Si responde 401 → regenerar token en Clarity → Settings → Data Export.
3. Cargar nuevo token igual que Bing (paso 4 arriba).
4. Recordar: máximo **10 llamadas/día por proyecto**.

## 6. PageSpeed — confirmar API key

Ya cargado localmente. Verificar:

1. Llamar `pagespeed_analyze_url` con `url: "https://www.dnamusic.edu.co/"`.
2. Si falla → https://console.cloud.google.com/apis/credentials → activar **PageSpeed Insights API** y crear API key.

## 7. Ahrefs / Semrush — SKIP por ahora

Decisión del 2026-05-08: skip credenciales pagas (Ahrefs Enterprise + Semrush Business cuestan >$500/mes c/u). Las tools `ahrefs_site_explorer` y `semrush_api_report` quedan en código pero no se usan hasta que se activen las suscripciones.

---

## Endpoint admin para cargar variables

```bash
# Listar
curl https://dataforseo-mcp-three.vercel.app/api/variables \
  -H "x-admin-token: $SEO_VARIABLES_ADMIN_TOKEN"

# Setear
curl -X POST https://dataforseo-mcp-three.vercel.app/api/variables \
  -H "x-admin-token: $SEO_VARIABLES_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"VARIABLE_NAME","value":"<value>"}'

# Borrar
curl -X DELETE "https://dataforseo-mcp-three.vercel.app/api/variables?name=VARIABLE_NAME" \
  -H "x-admin-token: $SEO_VARIABLES_ADMIN_TOKEN"
```

`SEO_VARIABLES_ADMIN_TOKEN` está en `.env.local`. GET es público (lista variables con `configured: true/false`, sin valores); POST/DELETE requieren el header `x-admin-token`.
