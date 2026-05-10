# Market Research Agent — Design

Status: design approved 2026-05-09. Implementation B1 + B2 in this session, B3 later.

## Goal

Convert the MCP into a deep market research strategist for DNA Music. Input: open-ended strategic question (e.g. "what's the opportunity for DNA in Cali?"). Output: structured strategic brief grounded in live data + accumulated history.

## Core architecture

```
question
   ↓
classify (Opus) — what is being asked?
   ↓
plan (Opus) — which tools, in what order, expected cost
   ↓
[user approves plan, optionally edits]
   ↓
execute (parallel where safe) — calls tools, persists each observation
   │
   │  ←  reuse layer: skip tool call if a recent observation
   │      with same args exists within the tool's TTL
   ↓
synthesize (Opus) — produces 7-section structured brief
   ↓
quality gate (Opus self-critique) — checks rigor, refines if fails
   ↓
persist brief + linked observations
   ↓
return to user (JSON + markdown render)
```

## Persistence layer (memory, NOT cache)

**Every research run ALWAYS calls tools live.** The Postgres layer never replaces a live call. Its job is to provide **historical context and delta tracking** — what changed since last reading.

This is intentional. SEO/market data shifts by the hour; a "cached recommendation" is exactly the wrong recipe. The freshness contract baked into the MCP server applies here too: tool results are live data at the moment of the call.

What the persistence layer does provide:
1. **Delta tracking** — for every live call, look up the most recent prior observation with matching args; compute what changed (rank moved from 5 to 3, traffic up 12%, new competitor appeared).
2. **Time-series** — same args called over weeks/months produce a trend that the synthesizer can cite.
3. **Entity registry** — accumulated knowledge about competitors, keywords, sedes, hashtags — answers "what do we know about X?" instantly without re-research.
4. **Evidence trail** — every claim in a brief links to the observation that supports it (with timestamp).

Cost implication: each brief runs at full live price (~$2-5). The Apify free tier ($5/mo) bounds us to ~2-3 briefs/month. Scaling requires Apify Starter ($49/mo). This is the explicit tradeoff you chose: freshness over cost optimization.

### `seo_research_briefs`

One row per brief. Stores the question, approved plan, executed observations, synthesized output, and metadata.

```sql
create table seo_research_briefs (
  id bigserial primary key,
  question text not null,
  question_classification jsonb not null,   -- { type, entities[], depth, language }
  domain_scope text[],                       -- e.g. ['dnamusic.edu.co']
  geo_scope text[],                          -- e.g. ['CO', 'Bogota']
  parent_brief_id bigint references seo_research_briefs(id),
  plan jsonb not null,                       -- { steps: [{ tool, args, why, expected_cost_usd }], total_cost_usd }
  plan_approved boolean not null default false,
  plan_approved_at timestamptz,
  plan_approved_by text,
  observation_ids bigint[],                  -- FK array into seo_research_observations
  brief jsonb,                               -- the final structured brief (7 sections)
  brief_markdown text,                       -- rendered markdown for UI
  quality_gate jsonb,                        -- self-critique result + refinement count
  status text not null default 'planning',   -- planning | awaiting_approval | running | completed | failed
  cost_usd numeric,
  llm_input_tokens integer,
  llm_output_tokens integer,
  apify_runs integer,
  errors jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  requested_by text                          -- user identifier (defaults to 'system' for cron-driven)
);
```

### `seo_research_observations`

One row per tool call. The atomic unit of evidence. Reuse layer reads from here.

```sql
create table seo_research_observations (
  id bigserial primary key,
  tool_name text not null,
  args_hash text not null,                   -- sha256 of canonical args JSON for dedup lookup
  args jsonb not null,                       -- the original args
  result jsonb not null,                     -- the tool's response
  result_summary text,                       -- short summary written by Opus during synthesis (for embedding/search later)
  cost_usd numeric,
  freshness_ttl_seconds integer not null,    -- per-tool TTL — how long this observation is reusable
  expires_at timestamptz generated always as (captured_at + (freshness_ttl_seconds || ' seconds')::interval) stored,
  captured_at timestamptz not null default now(),
  brief_id bigint references seo_research_briefs(id),    -- which brief produced this
  reused_from_brief_id bigint references seo_research_briefs(id)  -- if it was reused, which brief originally created it
);
create index seo_research_obs_lookup on seo_research_observations (tool_name, args_hash, expires_at desc);
create index seo_research_obs_recency on seo_research_observations (captured_at desc);
```

### `seo_research_entities`

Registry of distinct entities the system has researched (brands, keywords, places, URLs). Lets us answer "what do we know about X?" instantly.

```sql
create table seo_research_entities (
  id bigserial primary key,
  entity_type text not null,                 -- brand | competitor | keyword | url | sede | program | hashtag
  canonical_name text not null,              -- normalized lowercase
  display_name text,
  aliases text[],
  mention_count integer not null default 1,  -- how many briefs touched this entity
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  metadata jsonb,                            -- { domain, location, related_programs, etc. }
  unique (entity_type, canonical_name)
);
```

## Delta lookback windows per tool family

For every live call, the agent looks up the most recent prior observation with matching args within a "delta lookback window". This window defines what counts as a meaningful comparison ("position changed since last reading 3 days ago" vs "position changed since 6 months ago — too far back to compare directly"). The window is per tool family, set when the observation is persisted.

| Tool family | Lookback | Why this window |
|---|---|---|
| `gsc_search_analytics_query`, `gsc_keyword_opportunities` | 7d | Daily aggregates; week-over-week is the natural comparison |
| `gsc_url_inspection`, `gsc_sites_get` | 14d | Indexation state — meaningful change over weeks |
| `pagespeed_*`, `onpage_lighthouse_live` | 7d | Performance scores per deploy cadence |
| `schema_validate_url`, `schema_extract_url` | 30d | Schema rarely changes; compare against month-old baseline |
| `http_headers_inspect`, `redirect_chain_check` | 7d | Status code/redirect changes |
| `serp_google_organic_live`, `serpapi_*` | 7d | SERP positions — week-over-week is standard SEO cadence |
| `labs_google_*` (keyword ideas, competitors) | 30d | Slow-moving DataForSEO Labs data |
| `backlinks_*` | 30d | Backlinks index refreshes weekly; month gives meaningful delta |
| `ai_optimization_*_live` | 14d | LLM responses non-deterministic but month-over-month patterns useful |
| `local_google_maps_scraper`, `web_content_crawler` | 30d | Maps listings + site content move slowly |
| `social_tiktok_*`, `social_instagram_scraper` | 7d | Social activity moves fast, week is right window |
| `market_news_monitor` | 14d | News stories evolve over weeks |
| `market_reddit_intelligence` | 30d | Subreddit conversations slow-moving |
| `keyword_universe_*`, `brand_*` | 90d | Catalog reference data |
| `history_*` | n/a | Already historical |

**This is NOT a TTL for reuse.** The lookback is for delta computation only. The agent ALWAYS makes the live call; the prior observation is read for comparison purposes.

## Question classification

Opus first classifies the question to inform the planner. Categories:

- `competitive_landscape` — who competes, where, how
- `market_opportunity` — gaps, geo expansion, niche
- `customer_voice` — sentiment, objections, dudas
- `category_trend` — search demand evolution, seasonality
- `pauta_intelligence` — what creatives/messaging are competitors running
- `brand_audit` — how is OUR brand performing vs market
- `topic_research` — content opportunity for a specific theme

Each category has a planner template that picks default tools. Opus can override based on question specifics.

## Pipeline stages

### Stage 1: classify

Input: question text + recent context (3 most recent briefs as background).
Output: `{ type, entities, depth, language, geo_scope }`.

### Stage 2: plan

Input: classification + tool catalog.
Output: ordered list of tool calls with args + expected cost.
Cost = `Σ tool_cost_estimate(tool_name, args)`. Estimates baked into a static map.

### Stage 3: approval gate

If endpoint called with `auto_approve=true`, skip. Otherwise return plan, wait for user to approve/edit. POST `/api/research/approve_plan` with brief_id + edits.

### Stage 4: execute

For each step:
1. Compute `args_hash` (canonical JSON SHA256).
2. **ALWAYS make the live call.** The agent never skips a live call based on prior data — that's lazy and produces stale recommendations in this domain.
3. Persist the new observation with timestamp + cost + brief_id.
4. **Delta lookup:** query `seo_research_observations` where `tool_name = X AND args_hash = Y AND captured_at > now() - lookback_window AND id != current_id`. Pick newest.
5. If a prior observation exists, compute delta (numeric: subtract; categorical: `changed | unchanged`; text: structural diff summary). Attach delta to the current observation as `delta_vs_prior`.
6. If no prior observation: this is a first-time read; the synthesizer will note that.

Parallelism: tools that don't depend on each other run concurrently (e.g. all GSC queries, all Apify queries within rate limits).

**Anti-laziness rule (also baked into the agent's system prompt):** the agent must NEVER write a recommendation citing only prior-observation data. Every claim must be grounded in an observation made during THIS run. Prior observations exist purely to surface deltas and trends.

### Stage 5: synthesize

Opus reads all observations + entity context + classification → produces the 7-section brief:

1. **Demanda** — search volume, intent mix, trajectory
2. **Oferta** — competitor landscape with named players
3. **Voz del cliente** — citas literales de TikTok/IG/reviews/Reddit
4. **Pauta competitiva** — creatives, mensajes, frecuencia
5. **PR y backlinks** — partnerships y medios
6. **AI visibility** — qué dicen los LLMs sobre el topic
7. **Gaps y oportunidades** — 3-5 acciones concretas con effort/impact

Each section cites specific observation IDs (so the UI can show evidence on hover).

### Stage 6: quality gate

Opus self-critiques against checklist:
- ¿Hay números literales en cada claim cuantitativa?
- ¿Se reconocen explícitamente data gaps?
- ¿Se evita lenguaje genérico ("podría", "tal vez")?
- ¿SEO conectado con pauta cuando aplica?
- ¿La voz del cliente cita texto literal, no parafraseo?

If fails on >2 criteria, refine once. Track refinement count in `quality_gate.refinement_count`.

### Stage 7: persist + return

Write brief to DB. Return `{ brief_id, brief_jsonb, brief_markdown, total_cost_usd, observations_reused, observations_new }`.

## Memory across briefs (parent_brief_id)

When the user asks "go deeper on Cali" after a national-scope brief:

1. New brief with `parent_brief_id = <previous>`.
2. Planner reads parent's observations and prefers REUSE over re-query for shared scope (any observation about national/general topic still applies to Cali drill-down).
3. New observations are added for Cali-specific tools.
4. Synthesizer references parent's findings explicitly when relevant.

## Cost ceiling

Default `max_cost_usd = 5.0` per brief. Hard cap. If plan estimate exceeds, planner trims (drops least-marginal tools). User can override via endpoint param.

Free tier Apify is $5/month — one big research can blow it. The reuse layer is critical to stay within budget over time.

## Endpoints

- `POST /api/research` — body: `{ question, parent_brief_id?, auto_approve?, max_cost_usd?, requested_by? }`. Returns `{ brief_id, plan, status }`. If `auto_approve=true`, fully runs and returns brief.
- `POST /api/research/approve_plan` — body: `{ brief_id, plan_edits? }`. Triggers execute → synthesize → quality_gate.
- `GET /api/research/list` — list of briefs, paginated. Filter by status, requested_by, geo_scope, time range.
- `GET /api/research/:id` — full brief.
- `GET /api/research/entities` — list of tracked entities, sorted by mention_count.

## What's NOT in scope for B1+B2

- UI dashboard panel "Research" with brief list, drill-down, re-run. (B3)
- Slack slash command `/research <question>`. (B3)
- Cron for periodic re-runs of saved questions. (B3)
- Embeddings on `result_summary` for semantic search across briefs. (Future)
- Multi-language briefs (English output for international audience). (Future)

## Open assumptions logged

- Opus cost ~$0.50-1.00 per brief synthesis (16k tokens). Sustainable at our cadence.
- Apify free tier $5/month covers ~5-10 briefs/month with reuse; will need paid plan ($49/mo Starter) for higher cadence.
- Quality gate adds ~$0.30 per refinement pass. Cap at 1 pass.
