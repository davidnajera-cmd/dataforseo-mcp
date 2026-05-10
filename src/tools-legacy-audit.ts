// Single-call legacy URL redirect audit. Combines Wayback Machine + Backlinks
// + the configured repo snapshot (routes + sredirects) into ONE atomic tool
// that returns the redirect gap with proposed destinations.
//
// Replaces a typical 50+ tool call orchestration that agents were doing
// (and timing out on after hours). All work happens server-side within a
// hard time budget. Returns partial results with a `partial: true` flag if
// budget is exceeded — never hangs.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { post as dataforseoPost } from "./dataforseo-client.js";
import { loadRepoSnapshot, type RepoRedirectRule, type RepoSnapshot } from "./agent/repo-snapshot.js";

const CDX_URL = "https://web.archive.org/cdx/search/cdx";

function formatResult(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

// ============================================================================
// HELPERS
// ============================================================================

function normalizePath(input: string, domain: string): string | null {
  try {
    let u: URL;
    if (input.startsWith("http://") || input.startsWith("https://")) {
      u = new URL(input);
    } else {
      u = new URL(`https://${domain}${input.startsWith("/") ? input : "/" + input}`);
    }
    if (!u.hostname.includes(domain.replace(/^www\./, ""))) return null;
    let p = u.pathname;
    // Strip trailing slash except root
    if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
    // Lowercase
    p = p.toLowerCase();
    // Skip non-page assets and WordPress internals
    if (/\.(jpg|jpeg|png|gif|svg|webp|ico|css|js|woff|woff2|ttf|map|xml|json|pdf|mp4|mp3|zip|kml)$/i.test(p)) return null;
    if (p.startsWith("/wp-content/") || p.startsWith("/wp-includes/") || p.startsWith("/wp-json/") || p.startsWith("/wp-admin/")) return null;
    // Skip RSS/feed paths (every WP page has /feed/ — pure noise for redirect audit)
    if (p.endsWith("/feed") || p.endsWith("/comments/feed") || p.includes("/feed/")) return null;
    // Skip WP soft-trash slugs and orphan numbered slugs
    if (p.includes("__trashed") || /-\d+\/?$/.test(p) || /^\/\d+-?\d*$/.test(p)) return null;
    // Skip WP date archives (/2015/12/10, /2016/06, /2021)
    if (/^\/\d{4}(\/\d{1,2}){0,2}\/?$/.test(p)) return null;
    // Skip WP pagination (/page/2, /blog/page/5)
    if (/\/page\/\d+\/?$/.test(p)) return null;
    // Skip WP author/category/tag archives (often noise; team can request explicitly if needed)
    if (/^\/(author|category|tag)\//.test(p)) return null;
    return p;
  } catch {
    return null;
  }
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const al = a.length, bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;
  const dp: number[][] = Array.from({ length: al + 1 }, () => new Array(bl + 1).fill(0));
  for (let i = 0; i <= al; i++) dp[i][0] = i;
  for (let j = 0; j <= bl; j++) dp[0][j] = j;
  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[al][bl];
}

// Token-overlap similarity between two paths (e.g. /historia-del-scratch vs /experiencia/blog/historia-scratch)
function pathSimilarity(a: string, b: string): number {
  const toks = (s: string) => new Set(s.split(/[/\-_]/).filter((t) => t.length > 2));
  const A = toks(a), B = toks(b);
  if (A.size === 0 || B.size === 0) return 0;
  let intersect = 0;
  for (const t of A) if (B.has(t)) intersect++;
  return intersect / Math.max(A.size, B.size);
}

// For a legacy path, find the best matching destination from current routes.
function proposeDestination(legacy: string, currentRoutes: string[], redirects: RepoRedirectRule[]): { dest: string | null; confidence: number; method: string } {
  // 1. Already covered by a redirect rule? (covered routes are skipped before this,
  //    so reaching here means truly uncovered)
  // 2. Exact match in routes (different case)
  const exact = currentRoutes.find((r) => r.toLowerCase() === legacy);
  if (exact) return { dest: exact, confidence: 1.0, method: "exact_match" };

  // 3. Find best token-overlap match among static routes (skip dynamic [param] routes)
  const staticRoutes = currentRoutes.filter((r) => !r.includes("["));
  let best: { route: string; sim: number } | null = null;
  for (const route of staticRoutes) {
    const sim = pathSimilarity(legacy, route);
    if (sim > 0 && (!best || sim > best.sim)) best = { route, sim };
  }
  if (best && best.sim >= 0.5) return { dest: best.route, confidence: Math.min(0.9, best.sim), method: "token_overlap" };

  // 4. Fallback to closest Levenshtein on the LAST path segment.
  // Require segment length >=5 to avoid false positives like /2015 → /sedes
  // and require the match to be a substantial fraction of the segment length.
  const lastSeg = (p: string) => p.split("/").filter(Boolean).pop() ?? p;
  const legSeg = lastSeg(legacy);
  if (legSeg.length >= 5 && !/^\d+$/.test(legSeg)) {
    let levBest: { route: string; dist: number } | null = null;
    for (const route of staticRoutes) {
      const rSeg = lastSeg(route);
      if (rSeg.length < 4) continue;  // skip too-short route segments
      const dist = levenshtein(legSeg, rSeg);
      if (!levBest || dist < levBest.dist) levBest = { route, dist };
    }
    // Stricter threshold: max 25% edit distance (was 40%)
    if (levBest && levBest.dist <= Math.max(2, Math.floor(legSeg.length * 0.25))) {
      return { dest: levBest.route, confidence: 0.5, method: "fuzzy_segment" };
    }
  }

  // 5. Topical bucket suggestion based on path prefix
  if (/^\/(que-es|como-|guia-|tutorial-)/.test(legacy)) return { dest: "/experiencia/blog", confidence: 0.4, method: "topic_blog_inferred" };
  if (legacy.includes("dj")) return { dest: "/programas/dj-profesional", confidence: 0.4, method: "topic_dj_inferred" };
  if (legacy.includes("produccion") || legacy.includes("productor")) return { dest: "/programas/productor-audio", confidence: 0.4, method: "topic_production_inferred" };
  if (legacy.includes("sede") || legacy.includes("ciudad") || /\/(bogota|medellin|cali|barranquilla|pereira)/.test(legacy)) {
    return { dest: "/sedes", confidence: 0.4, method: "topic_sede_inferred" };
  }

  return { dest: null, confidence: 0.0, method: "no_match" };
}

// ============================================================================
// FETCHERS WITH TIME-BUDGET AWARENESS
// ============================================================================

async function fetchWaybackPaths(domain: string, opts: { from?: string; to?: string; limit: number; deadline_ms: number }): Promise<{ paths: string[]; hit_limit: boolean; attempts: number }> {
  // Use matchType=domain to scope to all subdomains. No collapse=urlkey
  // (makes CDX run a full-result-set dedup that routinely times out).
  // No filter or fl — those occasionally trigger 503 on overloaded CDX.
  // Apply both filters client-side after fetch.
  const params = new URLSearchParams({
    url: domain,
    matchType: "domain",
    output: "json",
    limit: String(opts.limit),
  });
  if (opts.from) params.set("from", opts.from);
  if (opts.to) params.set("to", opts.to);

  // Wayback CDX is notoriously flaky — implement a small retry with backoff.
  const maxAttempts = 3;
  let lastError = "";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const remaining = opts.deadline_ms - (attempt - 1) * 2000;
    if (remaining < 2000) {
      lastError = `budget_exhausted_after_${attempt - 1}_attempts`;
      break;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1000, remaining));
    try {
      const res = await fetch(`${CDX_URL}?${params.toString()}`, {
        headers: { "User-Agent": "dataforseo-mcp/1.0 (legacy audit)" },
        signal: controller.signal,
      });
      if (!res.ok) {
        lastError = `Wayback CDX ${res.status}`;
        // Retry only on 5xx (server-side issue)
        if (res.status >= 500 && attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 1500 * attempt));
          continue;
        }
        throw new Error(lastError);
      }
      const text = await res.text();
      const rows = text.trim() ? JSON.parse(text) as string[][] : [];
      const [header, ...data] = rows;
      if (!header) return { paths: [], hit_limit: false, attempts: attempt };
      const urlIdx = header.indexOf("original");
      const statusIdx = header.indexOf("statuscode");
      if (urlIdx < 0) return { paths: [], hit_limit: false, attempts: attempt };
      const seen = new Set<string>();
      for (const row of data) {
        // Filter for 200-only client-side (CDX server-side filter sometimes 503s)
        if (statusIdx >= 0 && row[statusIdx] !== "200") continue;
        const original = row[urlIdx];
        const p = normalizePath(original, domain);
        if (p) seen.add(p);
      }
      return { paths: Array.from(seen), hit_limit: data.length >= opts.limit, attempts: attempt };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 1500 * attempt));
        continue;
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(lastError || "wayback_failed_all_retries");
}

// Returns:
//   bl_total[path] — total backlinks (broken + live) pointing at the path
//   bl_broken[path] — broken backlinks specifically (target returned 4xx/5xx)
// The broken set is the real "URLs leaking equity" signal — they are by
// definition NOT covered by an existing redirect. The total set is also useful
// because the audit's existing-redirect filter handles dedup against current
// routes.
async function fetchBacklinkTargets(domain: string, opts: { limit: number; deadline_ms: number }): Promise<{ totals: Map<string, number>; broken: Map<string, number>; total_fetched: number; broken_fetched: number }> {
  const totals = new Map<string, number>();
  const broken = new Map<string, number>();

  // Two parallel fetches: all backlinks (with url_to) + broken backlinks (with url_to)
  const [allResult, brokenResult] = await Promise.allSettled([
    dataforseoPost("/backlinks/backlinks/live", {
      target: domain,
      include_subdomains: true,
      limit: opts.limit,
      mode: "as_is",
      order_by: ["rank,desc"],
    }) as Promise<{ tasks?: Array<{ result?: Array<{ items?: Array<{ url_to?: string }> }> }> }>,
    dataforseoPost("/backlinks/broken_backlinks/live", {
      target: domain,
      include_subdomains: true,
      limit: opts.limit,
    }) as Promise<{ tasks?: Array<{ result?: Array<{ items?: Array<{ url_to?: string }> }> }> }>,
  ]);

  let totalFetched = 0;
  let brokenFetched = 0;

  if (allResult.status === "fulfilled") {
    const items = allResult.value.tasks?.[0]?.result?.[0]?.items ?? [];
    totalFetched = items.length;
    for (const it of items) {
      const path = it.url_to ? normalizePath(it.url_to, domain) : null;
      if (!path) continue;
      totals.set(path, (totals.get(path) ?? 0) + 1);
    }
  }
  if (brokenResult.status === "fulfilled") {
    const items = brokenResult.value.tasks?.[0]?.result?.[0]?.items ?? [];
    brokenFetched = items.length;
    for (const it of items) {
      const path = it.url_to ? normalizePath(it.url_to, domain) : null;
      if (!path) continue;
      broken.set(path, (broken.get(path) ?? 0) + 1);
    }
  }
  return { totals, broken, total_fetched: totalFetched, broken_fetched: brokenFetched };
}

// ============================================================================
// REGISTRATION
// ============================================================================

export function registerLegacyAuditTools(server: McpServer) {
  server.tool(
    "seo_legacy_redirect_audit",
    "Atomic audit: cross-references Wayback Machine + DataForSEO Backlinks + the configured Next.js repo snapshot (routes + redirects) to find legacy URLs that 404 today but should redirect. Returns a ranked list of gap URLs with proposed destinations + confidence scores. Replaces ~50 individual tool orchestration calls with ONE atomic call (~20-40s, hard 60s budget). Use this when investigating post-migration redirect coverage instead of running wayback + backlinks separately and merging by hand.",
    {
      target: z.string().describe("Domain to audit (e.g. 'dnamusic.edu.co')"),
      wayback_from: z.string().optional().describe("YYYYMMDD lower bound for snapshots. Default: 4 years ago (captures WordPress era)."),
      wayback_to: z.string().optional().describe("YYYYMMDD upper bound. Default: 6 months ago (excludes current Next.js era to avoid noise)."),
      max_wayback_paths: z.number().int().positive().max(5000).optional().describe("Hard cap on unique Wayback paths considered. Default 1000."),
      max_backlink_pages: z.number().int().positive().max(1000).optional().describe("Hard cap on backlink-target pages fetched. Default 200."),
      min_bl_count: z.number().int().min(0).optional().describe("Skip gap URLs with fewer than this many backlinks. Default 0 (include all)."),
      min_confidence: z.number().optional().describe("Filter output to only items above this confidence threshold (0-1). Default 0 (return all)."),
      budget_seconds: z.number().int().positive().max(180).optional().describe("Hard time budget for the whole audit. Default 60. Past this, return partial results with hit_budget=true."),
    },
    async ({ target, wayback_from, wayback_to, max_wayback_paths, max_backlink_pages, min_bl_count, min_confidence, budget_seconds }) => {
      const start = Date.now();
      const budgetMs = (budget_seconds ?? 60) * 1000;
      const deadline = start + budgetMs;
      const cleanTarget = target.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");

      const errors: string[] = [];
      const stats: Record<string, unknown> = {};

      // 1. Repo snapshot — fast (cached 24h)
      let snapshot: RepoSnapshot | null = null;
      try {
        snapshot = await loadRepoSnapshot();
      } catch (err) {
        errors.push(`repo_snapshot: ${err instanceof Error ? err.message : "unknown"}`);
      }
      if (!snapshot) {
        return { content: [{ type: "text" as const, text: formatResult({ error: "repo_snapshot_not_configured", hint: "Set REPO_GITHUB_* runtime variables before running this audit. Without a routes+redirects inventory, the gap can't be computed." }) }] };
      }
      const snap: RepoSnapshot = snapshot;  // narrow once for the closures below
      stats.repo_commit = snap.commit_sha.slice(0, 8);
      stats.repo_routes_count = snap.routes.length;
      stats.repo_redirects_count = snap.redirects.length;

      // 2. Wayback paths
      const fromDefault = new Date(Date.now() - 4 * 365 * 86400000).toISOString().slice(0, 10).replace(/-/g, "");
      const toDefault = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10).replace(/-/g, "");
      let waybackPaths: string[] = [];
      let waybackHitLimit = false;
      try {
        const wb = await fetchWaybackPaths(cleanTarget, {
          from: wayback_from ?? fromDefault,
          to: wayback_to ?? toDefault,
          limit: max_wayback_paths ?? 1000,
          deadline_ms: deadline - Date.now(),
        });
        waybackPaths = wb.paths;
        waybackHitLimit = wb.hit_limit;
      } catch (err) {
        errors.push(`wayback: ${err instanceof Error ? err.message : "unknown"}`);
      }
      stats.wayback_unique_paths = waybackPaths.length;
      stats.wayback_hit_limit = waybackHitLimit;
      stats.elapsed_ms_after_wayback = Date.now() - start;

      // 3. Backlinks — only if budget remains. Fetches BOTH all-backlinks
      // and broken-backlinks in parallel for max signal.
      let backlinkTotals = new Map<string, number>();
      let backlinkBroken = new Map<string, number>();
      if (Date.now() < deadline - 5000) {
        try {
          const bl = await fetchBacklinkTargets(cleanTarget, {
            limit: max_backlink_pages ?? 200,
            deadline_ms: deadline - Date.now(),
          });
          backlinkTotals = bl.totals;
          backlinkBroken = bl.broken;
          stats.backlinks_total_fetched = bl.total_fetched;
          stats.backlinks_broken_fetched = bl.broken_fetched;
          stats.backlinks_unique_targets = bl.totals.size;
          stats.backlinks_unique_broken_targets = bl.broken.size;
        } catch (err) {
          errors.push(`backlinks: ${err instanceof Error ? err.message : "unknown"}`);
        }
      } else {
        errors.push("backlinks_skipped_budget");
      }
      stats.elapsed_ms_after_backlinks = Date.now() - start;

      // 4. Build universe + coverage. Broken backlinks are guaranteed gaps
      // (Google says these URLs 4xx today) so we include them regardless of
      // other signals.
      const universe = new Set<string>([
        ...waybackPaths,
        ...backlinkTotals.keys(),
        ...backlinkBroken.keys(),
      ]);

      const coveredRoutes = new Set(snap.routes.map((r) => r.toLowerCase().replace(/\/$/, "")));
      // Add route bases (so /programas covers /programas/[id] dynamic)
      for (const r of snap.routes) {
        const base = r.replace(/\/\[[^\]]+\].*$/, "").toLowerCase();
        if (base) coveredRoutes.add(base);
      }
      const coveredRedirects = new Set(snap.redirects.map((r) => r.from.toLowerCase().replace(/\/$/, "")));

      function isCovered(path: string): boolean {
        if (coveredRoutes.has(path) || coveredRedirects.has(path)) return true;
        // Dynamic-route match: /programas/dj-profesional matches /programas/[id]
        for (const r of snap.routes) {
          if (!r.includes("[")) continue;
          const re = new RegExp("^" + r.replace(/\[[^\]]+\]/g, "[a-z0-9\\-]+").toLowerCase() + "$");
          if (re.test(path)) return true;
        }
        return false;
      }

      // 5. Compute gap + propose destinations
      const minBl = min_bl_count ?? 0;
      const minConf = min_confidence ?? 0;
      const gap: Array<{ path: string; source: string; bl_count: number; broken_bl_count: number; propuesta_destino: string | null; confidence: number; method: string }> = [];

      const inWayback = new Set(waybackPaths);
      const routesForMatching = Array.from(new Set([...snap.routes, ...snap.sitemap_routes]));

      for (const path of universe) {
        if (isCovered(path)) continue;
        const blCount = backlinkTotals.get(path) ?? 0;
        const brokenCount = backlinkBroken.get(path) ?? 0;
        // Filter by min_bl_count against the union (counts both signal types)
        if (Math.max(blCount, brokenCount) < minBl) continue;
        // Source priority: broken backlinks = strongest signal (Google confirmed
        // 4xx today), then "both" sources, then individual signals.
        const source = brokenCount > 0 ? "broken_backlinks"
          : (blCount > 0 && inWayback.has(path)) ? "both"
          : blCount > 0 ? "backlinks"
          : "wayback";
        const proposal = proposeDestination(path, routesForMatching, snap.redirects);
        if (proposal.confidence < minConf) continue;
        gap.push({
          path,
          source,
          bl_count: blCount,
          broken_bl_count: brokenCount,
          propuesta_destino: proposal.dest,
          confidence: Number(proposal.confidence.toFixed(2)),
          method: proposal.method,
        });
      }

      // Sort: broken_backlinks > both > backlinks > wayback, then broken count, then bl_count, then confidence
      const sourceRank = { broken_backlinks: 0, both: 1, backlinks: 2, wayback: 3 } as const;
      gap.sort((a, b) =>
        (sourceRank[a.source as keyof typeof sourceRank] ?? 9) - (sourceRank[b.source as keyof typeof sourceRank] ?? 9)
        || b.broken_bl_count - a.broken_bl_count
        || b.bl_count - a.bl_count
        || b.confidence - a.confidence
      );

      const elapsed = Date.now() - start;
      const hitBudget = elapsed > budgetMs;

      const summary = {
        target: cleanTarget,
        elapsed_ms: elapsed,
        budget_ms: budgetMs,
        hit_budget: hitBudget,
        partial: hitBudget || waybackHitLimit || errors.length > 0,
        stats,
        gap_count: gap.length,
        gap_by_source: {
          broken_backlinks: gap.filter((g) => g.source === "broken_backlinks").length,
          both: gap.filter((g) => g.source === "both").length,
          backlinks: gap.filter((g) => g.source === "backlinks").length,
          wayback: gap.filter((g) => g.source === "wayback").length,
        },
        high_confidence_count: gap.filter((g) => g.confidence >= 0.7).length,
        no_match_count: gap.filter((g) => g.propuesta_destino === null).length,
        items: gap,
        errors: errors.length > 0 ? errors : undefined,
      };
      return { content: [{ type: "text" as const, text: formatResult(summary) }] };
    }
  );
}
