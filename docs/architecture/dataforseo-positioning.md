# DataForSEO Positioning Matrix

Last updated: 2026-06-17

## Source inputs

- Local repo surface from `src/server.ts`, `src/bundles.ts`, `src/tools*.ts`, dashboard modules, agent modules, and persistence modules
- Official DataForSEO MCP documentation:
  - Remote endpoint and install surface: https://dataforseo.com/model-context-protocol
  - AI Optimization product surface: https://dataforseo.com/apis/ai-optimization-api
  - LLM Mentions live endpoint: https://docs.dataforseo.com/v3/ai_optimization-llm_mentions-search-live/
  - Fan-out workflow guidance: https://dataforseo.com/blog/fan-out-queries-the-hidden-layer-of-ai-search-you-need-to-optimize-for

## Decision labels

- `mantener`: keep here as business-layer capability
- `migrar`: move toward official DataForSEO MCP or a provider adapter first
- `deprecar`: phase out because the value is duplicated and not strategic
- `mejorar`: keep here, but strengthen because it is part of the moat

## Family matrix

| Family | Local modules / evidence | Primary dependency | Layer | Decision | Why |
| --- | --- | --- | --- | --- | --- |
| `serp_*` | `src/tools.ts`, `src/server.ts` | DataForSEO | Vendor base | `migrar` | Generic provider-shaped search retrieval; useful but low moat by itself |
| `keywords_*` | `src/tools.ts` | DataForSEO | Vendor base | `migrar` | Valuable keyword primitives, but not unique if official MCP already exposes them |
| `labs_google_*` | `src/tools.ts`, agent/research usage | DataForSEO | Vendor base | `migrar` | Strong candidate for parity-driven migration |
| `backlinks_*` | `src/tools.ts`, snapshots, dashboards | DataForSEO | Vendor base + persistence coupling | `migrar` | Commodity data family, but migration must protect downstream history and snapshots |
| `onpage_*` | `src/tools.ts`, workflow wrappers | DataForSEO | Vendor base | `migrar` | Generic crawl/audit family, suitable for migration after parity |
| `domain_*` | `src/tools.ts` | DataForSEO | Vendor base | `deprecar` | Useful but peripheral; keep only if still used by workflows |
| `content_analysis_*` | `src/tools.ts` | DataForSEO | Vendor base | `deprecar` | Tactical, low integration depth today |
| `ai_optimization_*` | `src/tools.ts`, `src/tools-playbook.ts`, `src/snapshots/capture-llm.ts` | DataForSEO | Vendor base with product upside | `migrar` + `mejorar` | Raw calls are commodity; analytics, persistence, and AI visibility product are not |
| `gsc_*` | `src/tools-gsc.ts`, dashboards, agent, playbooks | Google Search Console | Business layer | `mejorar` | Real verified-property access is part of the operating moat |
| `ga4_*` | `src/tools-ga4.ts`, agent collectors | Google Analytics | Business layer | `mejorar` | Critical for conversion-aware prioritization |
| `clarity_*` | `src/tools-clarity.ts`, dashboards, playbooks | Microsoft Clarity | Business layer | `mejorar` | Differentiates dashboards with UX evidence, not just SEO metrics |
| `bing_*` | `src/tools-bing.ts` | Bing Webmaster Tools | Business layer | `mantener` | Real property access plus submission workflows stay useful |
| `schema_*`, `http_*`, `redirect_*`, `wayback_*`, `log_*` | dedicated local wrappers | mixed public sources | Business support layer | `mantener` | Lightweight utilities that support diagnosis and audits |
| `history_*`, `snapshot_*`, `keyword_universe_*` | `src/tools-history.ts`, `src/persistence-store.ts`, `src/snapshots/*` | Neon/Postgres + cron | Business layer | `mejorar` | This is one of the clearest moats: trend, memory, and low-cost repeat analysis |
| `backlog_*`, `agent_runs_*` | `src/tools-backlog.ts`, `src/agent/*` | local DB + LLM logic | Business layer | `mejorar` | Converts data into prioritized work; not replaceable by vendor endpoints |
| `brand_*` | `src/tools-brand-knowledge.ts`, agent prompts | internal business logic | Business layer | `mejorar` | DNA Music-specific interpretation layer |
| `gbp_history_*`, `gbp_backfill_*` | `src/tools-google-business-history.ts`, `src/google-business-store.ts` | Google Business + persistence | Business layer | `mejorar` | Strong local SEO and reputation moat |
| `zernio_*`, `social_intel_*` | social tools, social dashboard | Zernio + scraper inputs | Business layer | `mejorar` | Needed for the second pillar beyond SEO |
| `apify_*`, `scrapegraph_*`, `adlib_*` | research/growth wrappers | Apify / ScrapeGraph / ad libraries | Business layer | `mantener` | Not core SEO primitives, but strong research and market-intel extensions |
| `seo_workflow_playbook`, `market_*` | local playbooks and research | multi-source | Business layer | `mejorar` | High leverage synthesis layer for operators and agents |

## Summary call

The official DataForSEO MCP should become a **lower-cost base for generic SEO data access**, not a replacement for this repo.

The local repo should keep owning:

- verified platform access
- multi-source synthesis
- persistence
- workflow automation
- dashboards
- brand-specific decision logic
