# Vendor Base vs Business Layer

## Intent

This document defines the architectural split used to evaluate changes in this repository.

## Layer 1 - Vendor base

Characteristics:

- mostly one-provider data access
- request/response shape is close to upstream provider payloads
- low business specificity
- should be swappable with official provider MCPs or adapters

Current families:

- `serp_*`
- `keywords_*`
- `labs_google_*`
- `backlinks_*`
- `onpage_*`
- `domain_*`
- `content_analysis_*`
- raw `ai_optimization_*`

Design rule:

- normalize only what is needed for downstream consumers
- do not let business workflows depend directly on provider quirks where an internal shape is cheap to define

## Layer 2 - Business layer

Characteristics:

- combines multiple sources
- stores historical state
- uses DNA Music naming, operating rules, or decision logic
- powers actions, not just retrieval

Current families:

- `gsc_*`
- `ga4_*`
- `clarity_*`
- `bing_*`
- `history_*`
- `snapshot_*`
- `keyword_universe_*`
- `backlog_*`
- `agent_runs_*`
- `brand_*`
- `gbp_history_*`
- `gbp_backfill_*`
- `zernio_*`
- `social_intel_*`
- `apify_*`
- `scrapegraph_*`
- dashboard/executive modules

## Adapter proposal

For families that may migrate, use an internal adapter contract like this:

```ts
type ProviderParityResult<T> = {
  provider: string;
  family: string;
  tool: string;
  latencyMs?: number;
  estimatedCostUsd?: number | null;
  normalized: T;
  raw?: unknown;
};
```

Use cases:

- compare current wrapper vs official MCP
- keep dashboards and agents consuming a stable shape
- make fallback and rollback predictable

## Bundle guidance

- `research`: mixed layer, good for market and GEO work
- `seo`: mixed layer, but many vendor-base families live here today
- `pauta`: mostly business-layer decision support
- `agent`: business-layer bundle, should stay strongly workflow-oriented
- `full`: internal power bundle only
