// Read-only snapshot of the dnamusic.edu.co Next.js repo. Pulled via the GitHub
// REST API and cached in Postgres for 24h. The agent uses this to ground
// suggestions in the real codebase: route inventory, redirect rules, sitemap
// content. Without it the agent hallucinates slugs.
//
// Required runtime variables:
//   REPO_GITHUB_OWNER         e.g. "dnamusic2026"
//   REPO_GITHUB_NAME          e.g. "frontend_web_page"
//   REPO_GITHUB_BRANCH        default "main"
//   REPO_GITHUB_TOKEN         classic PAT (scope: repo) or fine-grained PAT
//                             with Contents: Read on the target repo.
//
// If any required variable is missing we return null so the agent can run
// without grounding (degraded mode).

import { neon } from "@neondatabase/serverless";
import { getRuntimeVariable } from "../runtime-config.js";

export type RepoRedirectRule = {
  from: string;
  to: string | null;
  status: number;
};

export type RepoSnapshot = {
  owner: string;
  name: string;
  branch: string;
  fetched_at: string;
  commit_sha: string;
  routes: string[];
  redirects: RepoRedirectRule[];
  sitemap_routes: string[];
  data_files: Record<string, string[]>;
  raw: {
    sredirects_excerpt?: string;
    sitemap_excerpt?: string;
  };
};

const CACHE_TTL_HOURS = 24;
let memoCache: { snapshot: RepoSnapshot; loaded_at: number } | null = null;

function getSql() {
  if (!process.env.DATABASE_URL) return null;
  return neon(process.env.DATABASE_URL);
}

async function ensureSnapshotTable(): Promise<void> {
  const sql = getSql();
  if (!sql) return;
  await sql`
    create table if not exists seo_repo_snapshot (
      id bigserial primary key,
      owner text not null,
      name text not null,
      branch text not null,
      commit_sha text not null,
      fetched_at timestamptz not null default now(),
      payload jsonb not null
    )
  `;
  await sql`create index if not exists seo_repo_snapshot_lookup on seo_repo_snapshot (owner, name, branch, fetched_at desc)`;
}

type GhTreeEntry = { path: string; type: "blob" | "tree"; sha: string };

async function ghGet<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "dataforseo-mcp-agent",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub ${res.status} ${res.statusText} on ${url}: ${body.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

async function ghGetText(url: string, token: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.raw",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "dataforseo-mcp-agent",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub ${res.status} on ${url}: ${body.slice(0, 300)}`);
  }
  return res.text();
}

function treePathToRoute(p: string): string | null {
  if (!p.startsWith("app/")) return null;
  const isPageFile = /\/page\.(t|j)sx?$/.test(p) || p === "app/page.tsx" || p === "app/page.ts" || p === "app/page.jsx" || p === "app/page.js";
  if (!isPageFile) return null;
  let route = p.replace(/^app\//, "").replace(/\/page\.(t|j)sx?$/, "");
  if (route === "page.tsx" || route === "page.ts" || route === "page.jsx" || route === "page.js" || route === "") return "/";
  route = route.split("/").filter((seg) => !/^\(.*\)$/.test(seg)).join("/");
  if (/[@()]/.test(route)) return null;
  return "/" + route;
}

function parseRedirects(source: string): RepoRedirectRule[] {
  const rules: RepoRedirectRule[] = [];
  const re = /\{\s*from\s*:\s*(['"])([^'"]+)\1\s*,\s*to\s*:\s*(?:(['"])([^'"]+)\3|null)\s*(?:,\s*status\s*:\s*(\d+))?/g;
  for (const m of source.matchAll(re)) {
    rules.push({
      from: m[2],
      to: m[4] ?? null,
      status: m[5] ? Number(m[5]) : 301,
    });
  }
  return rules;
}

function parseSitemapRoutes(source: string): string[] {
  const routes = new Set<string>();
  const re = /(['"])(\/[a-z0-9\-/\[\]]+)\1/gi;
  for (const m of source.matchAll(re)) routes.add(m[2]);
  return Array.from(routes).sort();
}

async function collectDataFileSlugs(tree: GhTreeEntry[], owner: string, name: string, branch: string, token: string): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  const candidates = tree.filter((t) =>
    t.type === "blob" &&
    t.path.startsWith("src/data/") &&
    /\.(ts|js|json)$/.test(t.path)
  ).slice(0, 30);
  for (const entry of candidates) {
    try {
      const txt = await ghGetText(`https://api.github.com/repos/${owner}/${name}/contents/${entry.path}?ref=${branch}`, token);
      const slugs = new Set<string>();
      const re = /(?:id|slug)\s*:\s*(['"])([a-z0-9\-]+)\1/gi;
      for (const m of txt.matchAll(re)) slugs.add(m[2]);
      if (slugs.size > 0) {
        const key = entry.path.replace(/^src\/data\//, "").replace(/\.(ts|js|json)$/, "");
        out[key] = Array.from(slugs).sort();
      }
    } catch {
      // ignore individual file failures
    }
  }
  return out;
}

export async function getRepoSnapshotConfig(): Promise<{ owner: string; name: string; branch: string; token: string } | null> {
  const owner = await getRuntimeVariable("REPO_GITHUB_OWNER");
  const name = await getRuntimeVariable("REPO_GITHUB_NAME");
  const branch = (await getRuntimeVariable("REPO_GITHUB_BRANCH")) ?? "main";
  const token = await getRuntimeVariable("REPO_GITHUB_TOKEN");
  if (!owner || !name || !token) return null;
  return { owner, name, branch, token };
}

export async function loadRepoSnapshot(options: { force?: boolean } = {}): Promise<RepoSnapshot | null> {
  const cfg = await getRepoSnapshotConfig();
  if (!cfg) return null;

  if (!options.force && memoCache && Date.now() - memoCache.loaded_at < CACHE_TTL_HOURS * 3600 * 1000) {
    return memoCache.snapshot;
  }

  await ensureSnapshotTable();
  const sql = getSql();
  if (!options.force && sql) {
    const rows = await sql`
      select payload, fetched_at
      from seo_repo_snapshot
      where owner = ${cfg.owner} and name = ${cfg.name} and branch = ${cfg.branch}
        and fetched_at > now() - interval '24 hours'
      order by fetched_at desc
      limit 1
    ` as Array<{ payload: RepoSnapshot; fetched_at: string }>;
    if (rows.length > 0) {
      memoCache = { snapshot: rows[0].payload, loaded_at: Date.now() };
      return rows[0].payload;
    }
  }

  const branchInfo = await ghGet<{ commit: { sha: string } }>(`https://api.github.com/repos/${cfg.owner}/${cfg.name}/branches/${cfg.branch}`, cfg.token);
  const sha = branchInfo.commit.sha;
  const tree = await ghGet<{ tree: GhTreeEntry[]; truncated: boolean }>(`https://api.github.com/repos/${cfg.owner}/${cfg.name}/git/trees/${sha}?recursive=1`, cfg.token);

  const routes = tree.tree
    .filter((t) => t.type === "blob")
    .map((t) => treePathToRoute(t.path))
    .filter((r): r is string => r !== null);
  const uniqRoutes = Array.from(new Set(routes)).sort();

  let sredirectsText = "";
  let sitemapText = "";
  for (const path of ["src/sredirects.ts", "src/redirects.ts", "lib/redirects.ts"]) {
    try {
      sredirectsText = await ghGetText(`https://api.github.com/repos/${cfg.owner}/${cfg.name}/contents/${path}?ref=${cfg.branch}`, cfg.token);
      break;
    } catch { /* try next */ }
  }
  for (const path of ["app/sitemap.ts", "app/sitemap.js", "src/sitemap.ts"]) {
    try {
      sitemapText = await ghGetText(`https://api.github.com/repos/${cfg.owner}/${cfg.name}/contents/${path}?ref=${cfg.branch}`, cfg.token);
      break;
    } catch { /* try next */ }
  }

  const redirects = sredirectsText ? parseRedirects(sredirectsText) : [];
  const sitemapRoutes = sitemapText ? parseSitemapRoutes(sitemapText) : [];
  const dataFiles = await collectDataFileSlugs(tree.tree, cfg.owner, cfg.name, cfg.branch, cfg.token);

  const snapshot: RepoSnapshot = {
    owner: cfg.owner,
    name: cfg.name,
    branch: cfg.branch,
    fetched_at: new Date().toISOString(),
    commit_sha: sha,
    routes: uniqRoutes,
    redirects,
    sitemap_routes: sitemapRoutes,
    data_files: dataFiles,
    raw: {
      sredirects_excerpt: sredirectsText.slice(0, 4096),
      sitemap_excerpt: sitemapText.slice(0, 4096),
    },
  };

  if (sql) {
    await sql`
      insert into seo_repo_snapshot (owner, name, branch, commit_sha, payload)
      values (${cfg.owner}, ${cfg.name}, ${cfg.branch}, ${sha}, ${JSON.stringify(snapshot)}::jsonb)
    `;
    await sql`
      delete from seo_repo_snapshot
      where owner = ${cfg.owner} and name = ${cfg.name} and branch = ${cfg.branch}
        and id not in (
          select id from seo_repo_snapshot
          where owner = ${cfg.owner} and name = ${cfg.name} and branch = ${cfg.branch}
          order by fetched_at desc limit 5
        )
    `;
  }
  memoCache = { snapshot, loaded_at: Date.now() };
  return snapshot;
}

export function clearRepoSnapshotCache(): void {
  memoCache = null;
}
