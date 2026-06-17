# Transition Checklist

## Go / no-go checklist by migration wave

### Before any wave

- family scope is documented
- parity checklist completed
- rollback path documented
- affected bundles identified
- dashboards/agents/history consumers reviewed

### Before runtime switch

- parity harness run
- target smoke calls pass
- `npm run build` passes
- `git diff --check` passes
- docs updated

### After switch

- relevant smoke tools checked
- dashboards inspected if affected
- snapshot/cron impact reviewed
- logs monitored

## Observability

- compare error rates before and after
- compare latency on critical calls
- compare cost profile for repeated workflows
- note any field-loss regressions immediately

## Rollback

- revert code path to previous implementation
- restore previous bundle routing if changed
- rerun smoke calls

## No-go triggers

- missing critical fields in normalized output
- higher cost with no maintenance benefit
- breakage in snapshots, history, or dashboards
- unclear rollback
