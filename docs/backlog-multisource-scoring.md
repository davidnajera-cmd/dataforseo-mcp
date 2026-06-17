# Backlog Multi-Source Scoring Proposal

## Goal

Make backlog prioritization reflect growth reality, not only SEO vendor signals.

## Current scoring fields

Already present in `src/backlog-store.ts`:

- `impact_score`
- `difficulty_score`
- `confidence_score`
- `opportunity_score`

## Proposed source contributions

### GSC

- clicks lost
- impressions available
- ranking opportunity
- CTR underperformance

### GA4

- SEO-attributed conversion evidence
- landing pages with sessions but no conversion events
- measurement gaps that lower confidence

### Clarity

- rage clicks
- dead clicks
- scroll depth failure
- UX friction on landing pages with SEO traffic

### AI visibility

- high AI demand with no citations
- competitor citation dominance
- outdated cited pages

### Social / Zernio

- repeated objections in comments
- content themes with strong engagement
- creator/campaign learnings that can feed SEO content

### Google Business

- review topic deterioration
- location-level performance changes
- local intent queries not covered by landing pages

## Scoring guideline

Use a visible formula family, not a black box:

- `impact_score`: expected upside on traffic or measurable conversions
- `difficulty_score`: delivery effort + cross-team dependencies
- `confidence_score`: evidence strength across sources
- `opportunity_score`: blended priority; keep auditable

## Suggested rule additions

1. boost tasks where GSC opportunity also maps to GA4 conversion evidence
2. boost tasks where Clarity shows friction on organic landing pages
3. create a dedicated AI visibility task when AI search volume is high and citation share is zero
4. create content tasks when social comment themes align with search demand gaps
