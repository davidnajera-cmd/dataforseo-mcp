# ADR-001 - Reposition this repo relative to the official DataForSEO MCP

- Status: Accepted
- Date: 2026-06-17

## Context

The official DataForSEO MCP now exposes a broad, maintained, first-party surface for generic DataForSEO access. At the same time, this repository has grown far beyond provider passthrough:

- Google Search Console and Google platform access
- GA4 and Clarity
- historical persistence and snapshots
- executive and social dashboards
- backlog/agent prioritization
- Google Business history
- Zernio and social intelligence
- DNA Music brand knowledge

If we keep treating this repo as "the DataForSEO MCP", we risk duplicating generic wrappers indefinitely and underinvesting in the parts that actually differentiate the product.

## Decision

We will **not replace** this repository with the official DataForSEO MCP.

We will instead reposition the architecture into:

1. a **vendor base** for generic SEO/search data, where the official DataForSEO MCP can increasingly be used directly or through adapters
2. a **business layer** that remains in this repository and compounds value through cross-source synthesis, persistence, and DNA Music operating workflows

## Consequences

### Positive

- Less maintenance on commodity wrappers
- Clearer product moat
- Easier parity testing for provider migrations
- Better roadmap discipline

### Negative

- We now need explicit migration checklists and parity tooling
- Some families are coupled to dashboards and snapshots, so migration cannot be impulsive
- Docs and bundle framing must be updated to avoid mixed messaging

## Rejected alternatives

### Replace the repo with the official DataForSEO MCP

Rejected because it would drop or weaken:

- GSC/GA4/Clarity integration
- persistence and trend history
- backlog/agent workflows
- Google Business history
- social intelligence
- DNA Music-specific playbooks

### Keep expanding local wrappers with no architectural split

Rejected because it encourages duplicate maintenance on capabilities that are no longer strategic.

## Migration criteria

A provider-shaped family can move toward the official DataForSEO MCP only if:

- parity is proven on response shape and key metrics
- cost and latency are understood
- rollback is documented
- downstream dashboards, snapshots, and agents remain stable
