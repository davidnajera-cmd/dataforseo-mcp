# AI Visibility Roadmap

## Goal

Turn AI visibility into a decision system, not just a bundle of raw LLM calls.

## Current assets in repo

- `ai_optimization_llm_mentions_search`
- `ai_optimization_llm_mentions_top_domains`
- live LLM response tools
- `history_llm_visibility`
- weekly snapshot capture via `src/snapshots/capture-llm.ts`

## Missing concepts to add

### 1. AI search volume as a ranking opportunity signal

Use AI search volume to answer:

- which prompts matter most
- where we are absent on high-demand AI queries
- which themes deserve dedicated content or FAQ assets

### 2. Fan-out queries as expansion logic

Use fan-out queries to answer:

- what hidden retrieval questions LLMs branch into
- which support pages or FAQ sections are missing
- where the brand needs adjacent topical authority

### 3. Citation-share analytics

Move from "mentions count" to:

- high-volume prompts with zero presence
- prompts where competitors dominate citations
- prompts where DNA appears but with weak or outdated cited URLs

## Proposed persistence evolution

### Option A - Extend `seo_llm_visibility`

Add nullable fields:

- `fan_out_queries jsonb`
- `ai_search_volume numeric`
- `citation_share numeric`

Pros: simple migration  
Cons: mixes prompt-level and aggregate concepts

### Option B - Add dedicated tables

- `seo_llm_prompt_opportunities`
- `seo_llm_fan_out_queries`

Pros: cleaner analytics model  
Cons: more migration work

Recommendation: start with **Option B** if implementation begins, because fan-out is a one-to-many relationship and deserves its own structure.

## Dashboard implications

Add modules like:

- top AI opportunity prompts by search volume
- competitor citation leaders by topic
- fan-out query clusters missing content coverage
- AI visibility trend with demand overlay

## Agent implications

New task patterns:

- "High AI demand, zero citation share"
- "Fan-out cluster missing FAQ coverage"
- "LLM cites outdated or weak page"
