# DNA Music Growth Intelligence MCP

This project is the integrated growth intelligence layer behind DNA Music's SEO, social, reputation, and executive monitoring workflows.

## What it is

- A production MCP server with curated bundles for research, SEO, ad intelligence, and automation
- A multi-source data layer that combines DataForSEO, Google Search Console, GA4, Clarity, Bing, Zernio, Apify, ScrapeGraphAI, and internal persistence
- An operations layer with dashboards, historical snapshots, backlog automation, and brand-specific playbooks

## What it is not

This repo is **not** meant to compete head-on with the official DataForSEO MCP on generic provider access.

The current strategy is:

1. Keep **commodity SEO data** migration-ready:
   - SERP
   - Labs
   - Backlinks
   - OnPage
   - AI Optimization raw endpoints
2. Double down on **differentiated workflows**:
   - real GSC and Google platform access
   - executive dashboards
   - historical persistence
   - backlog/agent prioritization
   - social intelligence
   - Google Business history
   - DNA Music brand logic

## Current architectural framing

- **Vendor base**: provider-shaped SEO/search capabilities where the official DataForSEO MCP can increasingly become the default base.
- **Business layer**: the multi-source, persistent, decision-oriented layer that remains specific to DNA Music.

See:

- [docs/architecture/dataforseo-positioning.md](docs/architecture/dataforseo-positioning.md)
- [docs/architecture/layers.md](docs/architecture/layers.md)
- [docs/architecture/adr-001-dataforseo-official-mcp-positioning.md](docs/architecture/adr-001-dataforseo-official-mcp-positioning.md)

## Tooling

- Build: `npm run build`
- Local HTTP dev server: `npm run dev`
- Local MCP dev server: `npm run dev:mcp`
- Google Business backfill helper: `npm run backfill:google-business`

## Validation helpers

- General MCP validation: `node scripts/validate-mcp-tools.mjs`
- Provider parity harness: `node scripts/validate-provider-parity.mjs --help`

## Deployment

- Primary target: Vercel
- Build command: `npm run build`
- HTTP entrypoints and cron jobs are defined in [vercel.json](vercel.json)
