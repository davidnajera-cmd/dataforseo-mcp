# TASKS — Reposicionar el MCP frente al MCP oficial de DataForSEO

## Fuentes leídas

- Conversación actual del usuario (objetivo: convertir las 4 recomendaciones prácticas en tareas ejecutables).
- [CLAUDE.md](/Users/davidnajera/workspace/privado/mcp-servers/dataforseo-mcp/CLAUDE.md)
- [src/server.ts](/Users/davidnajera/workspace/privado/mcp-servers/dataforseo-mcp/src/server.ts)
- [src/bundles.ts](/Users/davidnajera/workspace/privado/mcp-servers/dataforseo-mcp/src/bundles.ts)
- Familias clave detectadas en `src/`:
  - `gsc_*`, `ga4_*`, `clarity_*`, `bing_*`
  - `history_*`, `snapshot_*`, `keyword_universe_*`
  - `brand_*`, `backlog_*`, `gbp_history_*`, `gbp_backfill_*`
  - `zernio_*`, `social_intel_*`, `apify_*`, `scrapegraph_*`
  - `serp_*`, `keywords_*`, `labs_google_*`, `backlinks_*`, `onpage_*`, `domain_*`, `content_analysis_*`, `ai_optimization_*`

## Objetivo

Ejecutar las cuatro recomendaciones prácticas derivadas del análisis estratégico:

1. **No reemplazar el MCP completo**: preservar la capa propia diferencial del negocio.
2. **Separar base vendor vs capa de negocio**: explicitar una arquitectura de dos capas.
3. **Mover primero lo más genérico**: empezar por las familias commodity de DataForSEO.
4. **Doblar la apuesta en lo que no te copian**: fortalecer lo multi-fuente, histórico, operativo y específico de DNA Music.

## Coverage Matrix

| Req | Fuente | Status | Task(s) | Verificación | Notes |
| --- | --- | --- | --- | --- | --- |
| R1 | Recomendación práctica #1 | ADAPT | T0.1, T0.2, T1.1, T4.1 | ADR aprobada, matriz de capacidades, docs actualizadas | Debe evitar una sustitución ciega del MCP actual |
| R2 | Recomendación práctica #2 | NEW | T1.1, T1.2, T1.3, T4.1 | Interfaces/contratos claros, bundles y docs reflejan capas | Separación explícita de vendor base vs capa negocio |
| R3 | Recomendación práctica #3 | NEW | T2.1, T2.2, T2.3, T2.4, T3.1 | Piloto migrado, parity checks, fallback/rollback | Empezar por familias commodity |
| R4 | Recomendación práctica #4 | ADAPT | T3.2, T3.3, T3.4, T4.2 | Dashboards/agent/social/history reforzados | Invertir donde sigue estando el diferencial |

---

## Fase 0 — Baseline y Decisiones

### T0.1 — Inventario oficial de capacidades DataForSEO vs repo actual [DONE]

**Fuente:** R1, R2, R3

**Objetivo:** Crear un inventario verificable que compare la superficie real del repo con la oferta actual del MCP oficial de DataForSEO y sus APIs AI Optimization, para clasificar cada familia en `mantener`, `migrar`, `deprecar`, `mejorar`.

**Qué hacer:**
- Catalogar familias y herramientas actuales a partir de [src/server.ts](/Users/davidnajera/workspace/privado/mcp-servers/dataforseo-mcp/src/server.ts) y [src/bundles.ts](/Users/davidnajera/workspace/privado/mcp-servers/dataforseo-mcp/src/bundles.ts).
- Crear una matriz en `docs/architecture/dataforseo-positioning.md`.
- Marcar dependencias directas de DataForSEO vs multi-fuente vs lógica de negocio.

**Archivos/áreas probables:**
- `docs/architecture/dataforseo-positioning.md`
- `src/server.ts`
- `src/bundles.ts`

**Reglas de negocio:**
- No clasificar como “commodity” ninguna familia que mezcle múltiples vendors o reglas de DNA Music.

**Done cuando:**
- Existe una tabla por familia con decisión inicial: `mantener / migrar / deprecar / mejorar`.
- La tabla referencia módulos reales del repo.

**Verificación:**
- `rg -n "mantener|migrar|deprecar|mejorar" docs/architecture/dataforseo-positioning.md`
- Revisión manual de que todas las familias principales de `src/server.ts` aparezcan en la matriz.

**Riesgos/rollback:**
- Riesgo: mezclar “acceso a DataForSEO” con “valor del producto”.  
  Mitigación: separar explícitamente vendor base vs capa negocio en la matriz.

### T0.2 — ADR: no reemplazar el MCP propio, sino reposicionarlo [DONE]

**Fuente:** R1

**Objetivo:** Dejar por escrito una decisión arquitectónica de alto nivel: este repo no se reemplaza por el MCP oficial de DataForSEO; se reposiciona como capa integrada, operativa y específica de DNA Music.

**Qué hacer:**
- Redactar un ADR corto con contexto, decisión, alternativas descartadas y consecuencias.
- Explicar qué queda como commodity externo y qué queda como valor propio.

**Archivos/áreas probables:**
- `docs/architecture/adr-001-dataforseo-official-mcp-positioning.md`

**Done cuando:**
- El ADR existe y deja clara la decisión de arquitectura.
- Incluye tradeoffs y criterios de migración.

**Verificación:**
- `test -f docs/architecture/adr-001-dataforseo-official-mcp-positioning.md`
- `rg -n "no reemplazar|reposicionar|vendor base|capa de negocio" docs/architecture/adr-001-dataforseo-official-mcp-positioning.md`

**Riesgos/rollback:**
- Riesgo: seguir añadiendo wrappers duplicados por inercia.  
  Mitigación: usar el ADR como gate para nuevas features DataForSEO-only.

---

## Fase 1 — Separar Base Vendor vs Capa de Negocio

### T1.1 — Diseñar contratos de “vendor base” y “business layer” [DONE]

**Fuente:** R2

**Objetivo:** Introducir una separación conceptual y técnica entre familias commodity (SERP, Labs, backlinks, AI Optimization) y familias diferenciadoras (GSC, GA4, Clarity, backlog, social, brand, history).

**Qué hacer:**
- Definir en docs qué módulos pertenecen a cada capa.
- Proponer contratos/adapters para acceder a SEO data genérica sin acoplar el resto del sistema al proveedor.
- Identificar puntos de entrada en `tools.ts`, `tools-serpapi.ts`, `tools-gsc.ts`, `tools-history.ts`, etc.

**Archivos/áreas probables:**
- `docs/architecture/layers.md`
- `src/server.ts`
- `src/tools.ts`

**Reglas de negocio:**
- Las capas de negocio no deben depender de detalles de payload vendor-specific cuando se pueda normalizar.

**Done cuando:**
- Existe un documento de capas con lista de módulos por capa.
- Hay una propuesta explícita de interfaces/abstracciones para vendor base.

**Verificación:**
- `rg -n "vendor base|business layer|normalization|adapter" docs/architecture/layers.md`

**Riesgos/rollback:**
- Riesgo: abstracción prematura que complique el código.  
  Mitigación: limitar la abstracción a familias claramente duplicables/migrables.

### T1.2 — Etiquetar bundles y documentación según la nueva separación [DONE]

**Fuente:** R2

**Objetivo:** Hacer visible en la documentación y bundles qué herramientas son base commodity y cuáles son diferenciales.

**Qué hacer:**
- Ajustar textos en [CLAUDE.md](/Users/davidnajera/workspace/privado/mcp-servers/dataforseo-mcp/CLAUDE.md) para explicar la nueva postura.
- Revisar si `research`, `seo`, `agent`, `pauta` necesitan notas sobre herramientas commodity vs business-specific.
- Añadir en docs una recomendación de uso por bundle.

**Archivos/áreas probables:**
- `CLAUDE.md`
- `src/bundles.ts`

**Done cuando:**
- La documentación deja claro qué bundles son más vendor-driven y cuáles son más operativos.

**Verificación:**
- `rg -n "commodity|business|vendor|bundle" CLAUDE.md src/bundles.ts`

**Riesgos/rollback:**
- Riesgo: sobrecargar docs operativas.  
  Mitigación: mantenerlo breve y accionable.

### T1.3 — Crear checklist de aceptación para migraciones de familia [DONE]

**Fuente:** R2, R3

**Objetivo:** Definir qué pruebas deben pasar antes de considerar una familia migrada al MCP oficial o a una abstracción de proveedor.

**Qué hacer:**
- Definir criterios de parity funcional, costo, latencia, errores, cobertura y rollback.
- Documentar cómo comparar resultados entre proveedor actual y proveedor objetivo.

**Archivos/áreas probables:**
- `docs/migrations/dataforseo-family-migration-checklist.md`

**Done cuando:**
- Existe checklist reutilizable para cualquier familia migrable.

**Verificación:**
- `test -f docs/migrations/dataforseo-family-migration-checklist.md`

**Riesgos/rollback:**
- Riesgo: migrar por moda sin parity suficiente.  
  Mitigación: checklist obligatorio antes de cambiar rutas críticas.

---

## Fase 2 — Mover Primero lo Más Genérico

### T2.1 — Piloto de migración: `ai_optimization_*` [DONE]

**Fuente:** R3

**Objetivo:** Usar `ai_optimization_*` como primera familia piloto para decidir si consumir la oferta oficial de DataForSEO o mantener wrappers actuales.

**Qué hacer:**
- Auditar todos los tools `ai_optimization_*`.
- Comparar cobertura actual vs MCP oficial / APIs oficiales nuevas (LLM Mentions, AI Search Volume, fan-out queries).
- Decidir por tool: mantener, adaptar, deprecar, reemplazar.

**Archivos/áreas probables:**
- `src/tools.ts`
- `docs/migrations/ai-optimization-family.md`

**Done cuando:**
- Existe decisión por tool dentro de `ai_optimization_*`.
- Se identifican gaps concretos frente a AI Search Volume/fan-out queries.

**Verificación:**
- `rg -n "ai_optimization_" src/tools.ts`
- `test -f docs/migrations/ai-optimization-family.md`

**Riesgos/rollback:**
- Riesgo: romper workflows actuales de AI visibility.  
  Mitigación: mantener fallback a implementación vigente hasta completar parity.

### T2.2 — Piloto de migración: `serp_*` y `labs_google_*` [DONE]

**Fuente:** R3

**Objetivo:** Evaluar si estas familias deben seguir viviendo como wrappers propios o si pasan a una capa de abstracción / proveedor oficial.

**Qué hacer:**
- Inventariar los tools de SERP/Labs más usados por dashboard, backlog y agente.
- Separar tools críticos de herramientas periféricas.
- Definir qué subset se migra primero y cuál queda encapsulado.

**Archivos/áreas probables:**
- `src/tools.ts`
- `docs/migrations/serp-labs-family.md`

**Done cuando:**
- Existe listado priorizado de tools `serp_*` y `labs_google_*` con destino definido.

**Verificación:**
- `rg -n "serp_|labs_google_" src/tools.ts`
- `test -f docs/migrations/serp-labs-family.md`

**Riesgos/rollback:**
- Riesgo: subir costo/latencia sin medirlo.  
  Mitigación: exigir benchmark antes de cualquier cambio runtime.

### T2.3 — Piloto de migración: `backlinks_*` y `onpage_*` [DONE]

**Fuente:** R3

**Objetivo:** Preparar la segunda ola de migración commodity, incluyendo revisión de cobertura, latencia y costo.

**Qué hacer:**
- Auditar herramientas de backlinks/on-page usadas por dashboards, snapshots y workflows.
- Identificar acoplamientos con persistencia local y cron.

**Archivos/áreas probables:**
- `src/tools.ts`
- `src/dashboard-data.ts`
- `src/persistence-store.ts`
- `docs/migrations/backlinks-onpage-family.md`

**Done cuando:**
- Hay plan de migración/fallback para backlinks y on-page sin afectar histórico.

**Verificación:**
- `rg -n "backlinks_|onpage_" src`

**Riesgos/rollback:**
- Riesgo: romper snapshots e histórico.  
  Mitigación: no tocar jobs/snapshots sin plan de compatibilidad de payload.

### T2.4 — Crear harness de parity para familias commodity [DONE]

**Fuente:** R3

**Objetivo:** Tener un validador que compare respuestas de familias commodity entre la ruta actual y la ruta objetivo.

**Qué hacer:**
- Extender el concepto de `scripts/validate-mcp-tools.mjs` o crear un harness específico de parity.
- Soportar comparación de: respuesta, shape, errores, latencia y costo aproximado.

**Archivos/áreas probables:**
- `scripts/validate-provider-parity.mjs`
- `scripts/validate-mcp-tools.mjs`

**Done cuando:**
- Existe un script reproducible para correr parity checks en una familia piloto.

**Verificación:**
- `node scripts/validate-provider-parity.mjs --help`
- `git diff --check`

**Riesgos/rollback:**
- Riesgo: falsas equivalencias por comparar payloads distintos sin normalizar.  
  Mitigación: comparar sobre un esquema interno común.

---

## Fase 3 — Doblar la Apuesta en lo Diferencial

### T3.1 — Reforzar AI visibility propia con AI Search Volume y fan-out queries [DONE]

**Fuente:** R4

**Objetivo:** Llevar el módulo de AI visibility más allá de wrappers básicos y convertirlo en una capa analítica útil para DNA Music.

**Qué hacer:**
- Diseñar cómo incorporar AI Search Volume y fan-out queries al modelo actual de `history_llm_visibility` y dashboards.
- Decidir si se persisten nuevos campos/tablas o se adapta la persistencia existente.

**Archivos/áreas probables:**
- `src/persistence-store.ts`
- `src/dashboard-data.ts`
- `src/tools.ts`
- `docs/ai-visibility-roadmap.md`

**Done cuando:**
- Existe diseño técnico y de producto para incluir AI Search Volume/fan-out.

**Verificación:**
- `rg -n "llm_visibility|ai_search_volume|fan-out|fan out" src docs`

**Riesgos/rollback:**
- Riesgo: meter conceptos nuevos sin integrarlos al dashboard/agent.  
  Mitigación: exigir diseño de uso, no solo ingestion.

### T3.2 — Fortalecer el diferencial multi-fuente en dashboards ejecutivos [DONE]

**Fuente:** R4

**Objetivo:** Reforzar la narrativa y el producto donde este repo sí gana: visión ejecutiva que cruza SEO, social, business y reputación.

**Qué hacer:**
- Revisar `seo_dashboard`, `social_dashboard`, `executive_overview` para identificar módulos todavía demasiado vendor-centric.
- Proponer nuevas vistas o KPIs combinados (SEO + social + GBP + UX + backlog).

**Archivos/áreas probables:**
- `src/dashboard-data.ts`
- `src/social-dashboard-data.ts`
- `src/executive-overview-data.ts`
- `public/app.js`
- `public/index.html`

**Done cuando:**
- Existe backlog de mejoras del dashboard enfocadas en diferenciación multi-fuente.

**Verificación:**
- Revisión manual de módulos actuales y propuesta documentada en `docs/dashboard-differentiation.md`

**Riesgos/rollback:**
- Riesgo: dashboards llenos de datos sin orientación accionable.  
  Mitigación: priorizar KPIs y vistas para decisiones reales.

### T3.3 — Reforzar backlog y workflows con señales multi-fuente [DONE]

**Fuente:** R4

**Objetivo:** Hacer que el backlog/agent se alimente más explícitamente de señales combinadas y no solo de SEO vendor data.

**Qué hacer:**
- Revisar cómo `backlog_*` y el agent priorizan tareas.
- Diseñar reglas para cruzar GSC, GA4, Clarity, AI visibility, social y GBP en la priorización.

**Archivos/áreas probables:**
- `src/backlog-store.ts`
- `src/agent/`
- `src/tools-backlog.ts`
- `src/tools-playbook.ts`

**Done cuando:**
- Existe una propuesta de scoring/priorización multi-fuente para backlog y agent.

**Verificación:**
- `rg -n "impact_score|difficulty_score|opportunity_score|confidence_score" src/backlog-store.ts src/agent`

**Riesgos/rollback:**
- Riesgo: scoring demasiado opaco.  
  Mitigación: toda regla nueva debe quedar documentada y auditable.

### T3.4 — Reforzar social + research como segundo pilar del producto [DONE]

**Fuente:** R4

**Objetivo:** Tratar la capa social/research como parte del producto central y no como addon.

**Qué hacer:**
- Revisar continuidad entre `zernio_*`, `social_intel_*`, `apify_*` y dashboards.
- Definir mejoras orientadas a inteligencia accionable y feedback al backlog.

**Archivos/áreas probables:**
- `src/tools-zernio.ts`
- `src/tools-social-intelligence.ts`
- `src/tools-apify-growth.ts`
- `src/social-dashboard-data.ts`

**Done cuando:**
- Existe un plan de mejoras del módulo social integrado con decisiones SEO/brand.

**Verificación:**
- `rg -n "zernio_|social_intel_|apify_" src`

**Riesgos/rollback:**
- Riesgo: seguir teniendo módulos paralelos sin integración analítica.  
  Mitigación: conectar findings sociales con backlog y executive overview.

---

## Fase 4 — Documentación, Rollout y Go/No-Go

### T4.1 — Reescribir el framing del proyecto en docs y conexión MCP [DONE]

**Fuente:** R1, R2

**Objetivo:** Reposicionar el repo y su documentación pública para que deje de venderse mentalmente como “wrapper de DataForSEO” y se presente como plataforma integrada de crecimiento para DNA Music.

**Qué hacer:**
- Actualizar `CLAUDE.md` y docs raíz para reflejar la nueva postura.
- Explicar dónde entra el MCP oficial de DataForSEO dentro del stack.

**Archivos/áreas probables:**
- `CLAUDE.md`
- `docs/architecture/*.md`

**Done cuando:**
- La documentación describe el producto como capa integrada multi-fuente.

**Verificación:**
- `rg -n "DataForSEO wrapper|plataforma integrada|vendor base|DNA Music" CLAUDE.md docs`

**Riesgos/rollback:**
- Riesgo: dejar messaging híbrido/confuso.  
  Mitigación: unificar terminología en docs principales.

### T4.2 — Checklist de ejecución de la transición por fases [DONE]

**Fuente:** R1-R4

**Objetivo:** Tener un checklist final que permita ejecutar la transición sin perder funcionalidad crítica ni romper producción.

**Qué hacer:**
- Armar checklist go/no-go por familia.
- Incluir rollback, observabilidad y validaciones de producción.

**Archivos/áreas probables:**
- `docs/migrations/transition-checklist.md`

**Done cuando:**
- Existe checklist final con gates claros para ejecutar la transición.

**Verificación:**
- `test -f docs/migrations/transition-checklist.md`
- `rg -n "rollback|go/no-go|observability|parity" docs/migrations/transition-checklist.md`

**Riesgos/rollback:**
- Riesgo: transición parcial sin control de daños.  
  Mitigación: cada ola de migración debe tener fallback explícito.

---

## Riesgos clave descubiertos

- El repo ya mezcla varias propuestas de valor; sin una separación clara, cualquier migración al MCP oficial puede romper la capa diferencial.
- Familias commodity (`serp_*`, `labs_*`, `backlinks_*`, `ai_optimization_*`) son candidatas naturales a migración, pero hoy están acopladas a dashboards, snapshots y workflows.
- La diferenciación real no está en “acceder a DataForSEO” sino en combinar fuentes reales de operación, persistencia, backlog y contexto DNA Music.

## Primera tarea sugerida

**T0.1 — Inventario oficial de capacidades DataForSEO vs repo actual**  
Sin esa matriz, cualquier intento de migración o refuerzo del diferencial sería intuitivo y fácil de desalinear.
