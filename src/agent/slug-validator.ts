// Validates that paths/slugs proposed by the agent actually exist in the
// dnamusic.edu.co repo. Without this the agent hallucinates slugs (e.g.
// "tecnico-egmm") that came from another catalog.
//
// Inputs:
//   - tasks: ProposedTask[] coming back from Opus / heuristics
//   - snapshot: RepoSnapshot loaded from GitHub
//
// For each task we scan the title + description + acceptance_criteria for
// path-like tokens (anything starting with /, like /programas/dj-profesional)
// and check:
//   1. Does it match a real route in the inventory?
//   2. Does it match a redirect rule (from or to)?
//   3. Is it a dynamic route pattern (/programas/[id])? — accept if the slug
//      portion exists in data_files.
//
// If a path doesn't match anything we attach a `slug_validation` warning
// to the task. Tasks with warnings are flagged with requires_human_review=true
// and risk_level escalated to "medium" so a human reviews before execution.

import type { RepoSnapshot } from "./repo-snapshot.js";
import type { ProposedTask } from "../backlog-store.js";

export type SlugValidationIssue = {
  task_signature_key: string;
  path: string;
  reason: "not_in_inventory" | "no_redirect" | "unknown_slug";
  suggestions: string[];   // closest matching routes by simple Levenshtein
};

export type SlugValidationResult = {
  enabled: boolean;
  total_paths_checked: number;
  total_paths_unknown: number;
  issues: SlugValidationIssue[];
  tasks_flagged: number;
};

// Pull every "/foo/bar" looking token from a piece of text. Tolerant of
// trailing punctuation, parentheses, code blocks. Excludes URLs (http://) and
// fragment-only paths (#section).
function extractPaths(text: string): string[] {
  if (!text) return [];
  const found = new Set<string>();
  // Match a path that starts with / and is followed by lowercase letters,
  // digits, hyphens, slashes. Bracketed segments [id] are allowed.
  const re = /(?<![:a-zA-Z0-9])\/(?:[a-z0-9\-]+(?:\/[a-z0-9\-\[\]]+)*)/g;
  for (const m of text.matchAll(re)) {
    const path = m[0];
    // Skip obviously non-route tokens.
    if (path === "/" || path.length > 200) continue;
    if (/\.(jpg|jpeg|png|gif|svg|webp|pdf|xml|json|zip|css|js|ts|tsx|mjs)$/i.test(path)) continue;
    found.add(path);
  }
  return Array.from(found);
}

// Strip dynamic params from a route pattern: /programas/[id] -> /programas
function routeBase(route: string): string {
  return route.replace(/\/\[[^\]]+\]/g, "");
}

// Simple Levenshtein for "did you mean" suggestions. Cheap because we only
// run it against ~200 routes when there's a mismatch.
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
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[al][bl];
}

function suggestClosest(path: string, candidates: string[], max = 3): string[] {
  return candidates
    .map((c) => ({ c, d: levenshtein(path, c) }))
    .sort((x, y) => x.d - y.d)
    .slice(0, max)
    .filter((x) => x.d <= Math.max(3, Math.floor(path.length * 0.3)))
    .map((x) => x.c);
}

// Does `path` match any concrete or dynamic route in the inventory?
function pathMatchesRoute(path: string, routes: string[]): boolean {
  if (routes.includes(path)) return true;
  // Dynamic match: /programas/dj-profesional matches /programas/[id]
  for (const route of routes) {
    if (!route.includes("[")) continue;
    const re = new RegExp(
      "^" + route.replace(/\[[^\]]+\]/g, "[a-z0-9\\-]+") + "$"
    );
    if (re.test(path)) return true;
  }
  return false;
}

function pathMatchesRedirect(path: string, snapshot: RepoSnapshot): boolean {
  return snapshot.redirects.some((r) => r.from === path || r.to === path);
}

export function validateTaskSlugs(tasks: ProposedTask[], snapshot: RepoSnapshot | null): SlugValidationResult {
  if (!snapshot) {
    return { enabled: false, total_paths_checked: 0, total_paths_unknown: 0, issues: [], tasks_flagged: 0 };
  }

  const issues: SlugValidationIssue[] = [];
  let totalChecked = 0;
  let totalUnknown = 0;
  const flaggedSignatures = new Set<string>();

  // Augment routes with route bases (so /programas matches /programas/[id])
  const routesPlusBases = Array.from(new Set([
    ...snapshot.routes,
    ...snapshot.routes.map(routeBase),
  ]));

  for (const task of tasks) {
    const corpus = [task.title, task.description, task.acceptance_criteria, task.rationale]
      .filter(Boolean)
      .join("\n");
    const paths = extractPaths(corpus);
    for (const path of paths) {
      totalChecked++;
      if (pathMatchesRoute(path, routesPlusBases)) continue;
      if (pathMatchesRedirect(path, snapshot)) continue;
      totalUnknown++;
      flaggedSignatures.add(task.signature_key);
      issues.push({
        task_signature_key: task.signature_key,
        path,
        reason: "not_in_inventory",
        suggestions: suggestClosest(path, snapshot.routes),
      });
    }
  }

  return {
    enabled: true,
    total_paths_checked: totalChecked,
    total_paths_unknown: totalUnknown,
    issues,
    tasks_flagged: flaggedSignatures.size,
  };
}

// Apply the validation result back onto the tasks: for each flagged task,
// set requires_human_review=true and bump risk_level to "medium" if it was
// "low" or unset. Append a slug_validation note to the rationale so the
// reviewer sees why.
export function applySlugValidationToTasks(
  tasks: ProposedTask[],
  result: SlugValidationResult,
): ProposedTask[] {
  if (!result.enabled || result.issues.length === 0) return tasks;
  const issuesBySig = new Map<string, SlugValidationIssue[]>();
  for (const issue of result.issues) {
    const list = issuesBySig.get(issue.task_signature_key) ?? [];
    list.push(issue);
    issuesBySig.set(issue.task_signature_key, list);
  }

  return tasks.map((task) => {
    const issues = issuesBySig.get(task.signature_key);
    if (!issues || issues.length === 0) return task;
    const summary = issues
      .map((i) => {
        const sug = i.suggestions.length > 0 ? ` (sugerencias: ${i.suggestions.join(", ")})` : "";
        return `- ${i.path} no existe en el repo${sug}`;
      })
      .join("\n");
    const note = `\n\n[slug_validation] Caminos no encontrados en el repositorio dnamusic.edu.co:\n${summary}\nRevisar antes de ejecutar — pueden ser slugs de otro catalogo.`;
    return {
      ...task,
      requires_human_review: true,
      risk_level: task.risk_level === "high" ? task.risk_level : "medium",
      rationale: (task.rationale ?? "") + note,
    };
  });
}
