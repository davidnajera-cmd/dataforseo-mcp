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
    // Skip obviously non-page paths
    if (/\.(jpg|jpeg|png|gif|svg|webp|ico|css|js|woff|woff2|ttf|map|xml|json|pdf|mp4|mp3|zip)$/i.test(p)) return null;
    if (p.startsWith("/wp-content/") || p.startsWith("/wp-includes/") || p.startsWith("/wp-json/")) return null;
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

  // 4. Fallback to closest Levenshtein on the LAST path segment
  const lastSeg = (p: string) => p.split("/").filter(Boolean).pop() ?? p;
  const legSeg = lastSeg(legacy);
  let levBest: { route: string; dist: number } | null = null;
  for (const route of staticRoutes) {
    const rSeg = lastSeg(route);
    const dist = levenshtein(legSeg, rSeg);
    if (!levBest || dist < levBest.dist) levBest = { route, dist };
  }
  if (levBest && levBest.dist <= Math.max(3, Math.floor(legSeg.length * 0.4))) {
    return { dest: levBest.route, confidence: 0.5, method: "fuzzy_segment" };
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

async function fetchWaybackPaths(domain: string, opts: { from?: string; to?: string; limit: number; deadline_ms: number }): Promise<{ paths: string[]; hit_limit: boolean }> {
  // Use matchType=domain to scope to all subdomains in one query. Don't use
  // collapse=urlkey because it makes CDX run a full-result-set dedup which
  // routinely times out for active domains. Dedup client-side instead.
  const params = new URLSearchParams({
    url: domain,
    matchType: "domain",
    output: "json",
    limit: String(opts.limit),
    filter: "statuscode:200",
    fl: "original",  // ask for only the 'original' column to reduce transfer size
  });
  if (opts.from) params.set("from", opts.from);
  if (opts.to) params.set("to", opts.to);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, opts.deadline_ms));
  try {
    const res = await fetch(`${CDX_URL}?${params.toString()}`, {
      headers: { "User-Agent": "dataforseo-mcp/1.0 (legacy audit)" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Wayback CDX ${res.status}`);
    const text = await res.text();
    const rows = text.trim() ? JSON.parse(text) as string[][] : [];
    const [header, ...data] = rows;
    if (!header) return { paths: [], hit_limit: false };
    const urlIdx = header.indexOf("original");
    if (urlIdx < 0) return { paths: [], hit_limit: false };
    const seen = new Set<string>();
    for (const row of data) {
      const original = row[urlIdx];
      const p = normalizePath(original, domain);
      if (p) seen.add(p);
    }
    return { paths: Array.from(seen), hit_limit: data.length >= opts.limit };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchBacklinkTargets(domain: string, opts: { limit: number; deadline_ms: number }): Promise<{ targets: Map<string, number>; total_fetched: number }> {
  const map = new Map<string, number>();
  try {
    // DataForSEO returns items with `page` (URL) and `page_summary.backlinks` (count).
    // The optional order_by descending by backlinks makes high-equity pages come first.
    const result = await dataforseoPost("/backlinks/domain_pages/live", {
      target: domain,
      include_subdomains: true,
      limit: opts.limit,
    }) as { tasks?: Array<{ result?: Array<{ items?: Array<{ page?: string; page_summary?: { backlinks?: number } }> }> }> };
    const items = result.tasks?.[0]?.result?.[0]?.items ?? [];
    for (const it of items) {
      const url = it.page;
      const path = url ? normalizePath(url, domain) : null;
      if (!path) continue;
      const count = typeof it.page_summary?.backlinks === "number" ? it.page_summary.backlinks : 0;
      map.set(path, (map.get(path) ?? 0) + count);
    }
    return { targets: map, total_fetched: items.length };
  } catch {
    return { targets: map, total_fetched: 0 };
  }
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

      // 3. Backlinks — only if budget remains
      let backlinkTargets = new Map<string, number>();
      if (Date.now() < deadline - 5000) {
        try {
          const bl = await fetchBacklinkTargets(cleanTarget, {
            limit: max_backlink_pages ?? 200,
            deadline_ms: deadline - Date.now(),
          });
          backlinkTargets = bl.targets;
          stats.backlinks_pages_fetched = bl.total_fetched;
        } catch (err) {
          errors.push(`backlinks: ${err instanceof Error ? err.message : "unknown"}`);
        }
      } else {
        errors.push("backlinks_skipped_budget");
      }
      stats.elapsed_ms_after_backlinks = Date.now() - start;

      // 4. Build universe + coverage
      const universe = new Set<string>([...waybackPaths, ...backlinkTargets.keys()]);

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
      const gap: Array<{ path: string; source: string; bl_count: number; propuesta_destino: string | null; confidence: number; method: string }> = [];

      const inBacklinks = backlinkTargets;
      const inWayback = new Set(waybackPaths);
      const routesForMatching = Array.from(new Set([...snap.routes, ...snap.sitemap_routes]));

      for (const path of universe) {
        if (isCovered(path)) continue;
        const blCount = inBacklinks.get(path) ?? 0;
        if (blCount < minBl) continue;
        const source = inBacklinks.has(path) && inWayback.has(path) ? "both"
          : inBacklinks.has(path) ? "backlinks"
          : "wayback";
        const proposal = proposeDestination(path, routesForMatching, snap.redirects);
        if (proposal.confidence < minConf) continue;
        gap.push({
          path,
          source,
          bl_count: blCount,
          propuesta_destino: proposal.dest,
          confidence: Number(proposal.confidence.toFixed(2)),
          method: proposal.method,
        });
      }

      // Sort: by source priority (both > backlinks > wayback), then bl_count desc, then confidence desc
      const sourceRank = { both: 0, backlinks: 1, wayback: 2 } as const;
      gap.sort((a, b) =>
        (sourceRank[a.source as keyof typeof sourceRank] ?? 9) - (sourceRank[b.source as keyof typeof sourceRank] ?? 9)
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
