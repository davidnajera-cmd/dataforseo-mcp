# Product

## Register

product

## Users

DNA Music's marketing team (Colombia, América/Bogotá timezone) — non-engineers who need to know, at a glance, whether the brand's organic search performance is healthy across markets (CO primarily, plus AR/MX expansion) and what to do next. They check this during regular work planning, not deep SEO analysis sessions; they need answers, not raw vendor payloads.

## Product Purpose

A live SEO tracking dashboard that turns the DataForSEO MCP's underlying data (GSC, GA4, Clarity, Bing, backlinks, AI visibility, social/reputation) into decisions: what's losing visibility, what's compounding, what to fix next. It exists because the raw vendor tools are correct but not actionable on their own — per `docs/dashboard-differentiation.md`, "a premium dashboard should help a growth lead decide what to do next, not just expose one vendor's payload." Success is the marketing team trusting the numbers (freshness, no dead states) and acting on the "next best actions" surfaced, without needing an engineer to interpret it.

## Brand Personality

Executive confidence and clarity. Serious, decisive, no noise — reads like a briefing that already knows what to do, not a data explorer. Avoid gamified/SaaS-cute treatment; avoid a firehose of every available metric.

## Anti-references

- Vendor-centric raw payload dumps (the explicit anti-pattern named in `docs/dashboard-differentiation.md`) — tables of every DataForSEO field with no synthesis or prioritization.
- Generic analytics-tool chrome (unlabeled charts, no "so what", metrics with no threshold/comparison to say if they're good or bad).
- Silent failure: a metric or module going blank/stale without the user being told data is missing, cached, or delayed.

## Design Principles

- Decisions over data: every module should answer "what should the team do next," not just display a number.
- Freshness must be visible and honest: cached/stale data should say so (see the project's Freshness Contract in CLAUDE.md — GSC/PageSpeed/Lighthouse/etc. are time-sensitive; historical `history_*` data is intentionally a snapshot).
- One truth per metric: when the same signal appears in multiple modules (e.g. clicks in Executive Overview and in SEO), it must not silently disagree.
- Fail loud, fail helpful: broken/missing upstream data (GSC auth, Apify billing, Clarity's 10-calls/day cap) should surface as a clear inline state, not a blank chart or a raw stack trace.
- Colombia-first framing: dates, "today/this week," and default market context anchor to América/Bogotá per project convention.

## Accessibility & Inclusion

WCAG AA: body text ≥4.5:1 contrast, large text ≥3:1, full keyboard navigability, visible focus states. Must be usable on mobile (marketing team checks it off-desktop), not just a desktop-only layout.
