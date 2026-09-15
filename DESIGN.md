# Design

Extracted from `public/styles.css` + `public/index.html` (vanilla JS SPA, no framework — `public/app.js` drives a single `index.html` shell).

## Visual Theme

Light-only (`color-scheme: light`), warm off-white surface, single purple accent, editorial/data-dense product feel. Status color trio (live/pending/error/degraded) is the dominant semantic system — most panels report a data-source health state before showing a metric.

## Color

```
--bg: #faf9f6            body background (warm off-white)
--surface: #fffefe       card/panel background
--surface-soft: #f5f1eb  hover/active surfaces
--surface-muted: #f8f5f0 muted panel backgrounds (op tiles, empty states)
--ink: #342f29           primary text
--muted: #736d64         secondary text
--muted-soft: #8c867d    tertiary text
--line: #e8e0d5          borders
--line-strong: #d7cebf   stronger borders
--accent: #6d4cc2        brand purple (links, active nav, bars)
--accent-strong: #5b3aa6 active nav text
--accent-soft: #f3eefc   accent tint background
--accent-2: #138a72      "live" / success green-teal
--warn: #9c6a14 / --warn-soft: #f8efdd
--danger: #b55257 / --danger-soft: #f7e5e6
```

Body/secondary text (`#4f4a42`, `#69717c`, `#39414d`) is hardcoded in several component rules instead of referencing `--ink`/`--muted` tokens — inconsistent but all pass 4.5:1 on the light surfaces in use.

## Typography

`Geist, ui-sans-serif, system-ui, ...`. Scale: `--text-2xs` 11px → `--text-3xl` 28px. Headline sizes use `clamp()` (`.verdict`: 28–36px, `.command-value`: 28–40px) with tight negative letter-spacing (-0.02 to -0.03em) — within the -0.04em floor.

## Radii & Elevation

`--r-xs` 3px → `--r-xl` 14px. Cards mostly `--r-lg` (10px) or a literal 14px. Shadows are used sparingly (`--shadow` only on the mobile sidebar overlay); most cards rely on a 1px `--line` border instead of shadow — a deliberate flat, editorial choice, not an oversight.

## Layout

CSS Grid throughout: `.shell` is a 240px sidebar + fluid content grid. Content modules (`.command-deck`, `.signal-rail`, `.insight-matrix`, `.metric-grid`) are fixed-column grids (`repeat(4, ...)`) that collapse to 2 then 1 column at 1180px/860px. Newer "Phase 2" modules (social, executive, backlog) correctly use `repeat(auto-fit, minmax(...))` — the older modules don't, which is why they need explicit breakpoints the newer ones don't.

## Components

- **Status system**: `.status-chip` / `.source-dot` / `.insight-priority` / `.benchmark-bar span` all share one 4-state vocabulary — `live` (teal), `pending` (amber), `error` (red), `degraded` (grey) — reused consistently across SEO, social, and backlog modules. This is the dashboard's core "is this data trustworthy" signal; any fix must preserve this vocabulary rather than inventing a new one.
- **Cards** (`.metric`, `.insight-card`, `.command-card`, `.signal-card`, `.social-*-card`): border + radius, no shadow, `.primary`/`.accent` variants get a subtle diagonal gradient wash.
- **Kanban** (`.kanban-col`, `.task-card`): task-card left border width (4px) encodes priority (baja/media/alta) — semantic, not decorative.
- **Empty state** (`.empty-state`): dashed border, centered, on `--surface-muted` — used when a panel has no data.
- **Modal** (`.task-modal`): fixed overlay + centered `.modal-content`, closes via `.modal-close`.

## Responsive

Breakpoints at 1180px, 860px (sidebar becomes an off-canvas overlay, topbar/status-row restack), 720px, 1024px/1280px for the backlog board. `data-sidebar="closed"` attribute on `.shell` drives the collapsed state.

## Known inconsistencies to fix opportunistically (not urgent)

- Text-color values are split between CSS custom properties and hardcoded hex (`#4f4a42`, `#69717c`, `#39414d`, `#444`) that duplicate `--muted`/`--ink` at slightly different values — harmless visually but makes a future theme change (e.g. dark mode) touch dozens of rules instead of the token block.
