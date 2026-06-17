# SERP and Labs Family Review

## In-scope families

- `serp_*`
- `keywords_*`
- `labs_google_*`

## Why these move early

- they are the most commodity-like SEO primitives in the repo
- they are useful in many workflows, but they are not the product moat on their own
- the official DataForSEO MCP is positioned exactly around first-party access to this kind of data

## Priority breakdown

### Tier 1 - Migrate first

- `serp_google_organic_live`
- `serp_google_ai_mode_live`
- `keywords_google_search_volume_live`
- `labs_google_keyword_ideas`
- `labs_google_keyword_overview`
- `labs_google_search_intent`
- `labs_google_competitors_domain`

These are high-value and broadly generic.

### Tier 2 - Migrate after parity proves clean

- deeper SERP variants
- historical SERP endpoints
- niche keyword endpoints with lower usage

### Tier 3 - Keep wrapped until explicitly needed

- lower-frequency convenience wrappers that do not justify migration churn yet

## Safeguards

- keep internal normalized shape for any family used by agent or dashboards
- benchmark cost/latency before rerouting any hot path
- preserve existing bundle expectations
