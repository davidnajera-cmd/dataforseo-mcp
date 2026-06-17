# Backlinks and OnPage Family Review

## Scope

- `backlinks_*`
- `onpage_*`

## Why this is second-wave, not first-wave

Even though these are commodity-like families, they are more entangled locally:

- backlink snapshots feed history
- on-page workflows feed audits and synchronous helper routes
- dashboards and playbooks already assume current behavior

## Migration posture

| Area | Decision | Reason |
| --- | --- | --- |
| raw backlink summary/listing calls | `migrar` | provider-shaped and portable |
| backlink time-series persistence | `mantener` | local history remains the real product layer |
| raw on-page live analysis | `migrar` | generic crawl/audit surface |
| synchronous on-page orchestration | `mantener` | local wrapper is workflow value, not just transport |

## Required compatibility review

- snapshot payload compatibility
- dashboard consumers of backlink summaries
- any local assumptions around polling and crawl completion

## Rollback note

Do not switch history or cron jobs first. Start with opt-in parity checks on raw calls.
