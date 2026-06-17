# DataForSEO Family Migration Checklist

Use this before moving any family from local wrappers to the official DataForSEO MCP or another adapter path.

## 1. Scope

- Family named and bounded
- Tools in scope listed explicitly
- Downstream consumers identified:
  - dashboards
  - snapshots
  - agents
  - playbooks
  - external clients

## 2. Functional parity

- Required parameters mapped
- Required response fields mapped
- Error modes compared
- Pagination/depth/limit behavior compared
- Freshness assumptions documented

## 3. Shape parity

- Internal normalized schema defined
- Current implementation mapped to normalized schema
- Target implementation mapped to normalized schema
- Any missing fields documented with impact

## 4. Cost and latency

- Current estimated cost captured
- Target estimated cost captured
- Latency measured on the same sample calls
- Rate-limit differences documented

## 5. Safety

- No production-facing route changes without rollback
- No snapshot or persistence job updated without compatibility review
- No user-facing bundle changes without client impact review

## 6. Verification

- `node scripts/validate-provider-parity.mjs --family <family> --dry-run`
- targeted smoke checks for the changed family
- `npm run build`
- `git diff --check`

## 7. Rollback

- Previous implementation path named
- Revert steps documented
- Runtime toggle or code rollback path identified

## 8. Go / no-go gate

Only migrate when:

- parity is acceptable
- no critical field is lost
- downstream consumers are covered
- rollback is clear
