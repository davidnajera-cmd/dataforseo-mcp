import { post } from "../dataforseo-client.js";
import { getPersistenceSql, ensurePersistenceSchema } from "../persistence-store.js";

type BacklinksSummary = {
  target?: string;
  rank?: number;
  backlinks?: number;
  backlinks_spam_score?: number;
  broken_backlinks?: number;
  referring_domains?: number;
  referring_main_domains?: number;
};

type SummaryResponse = {
  status_code: number;
  tasks?: Array<{
    status_code: number;
    status_message: string;
    result?: BacklinksSummary[];
  }>;
};

async function fetchSummary(domain: string): Promise<BacklinksSummary> {
  const response = await post("/backlinks/summary/live", { target: domain, include_subdomains: true }) as SummaryResponse;
  const task = response.tasks?.[0];
  if (!task || task.status_code !== 20000) {
    throw new Error(task?.status_message ?? "Backlinks summary failed");
  }
  return task.result?.[0] ?? {};
}

async function fetchAnchors(domain: string): Promise<Array<{ anchor: string; backlinks: number }>> {
  const response = await post("/backlinks/anchors/live", { target: domain, limit: 10, mode: "as_is", include_subdomains: true }) as {
    tasks?: Array<{ result?: Array<{ items?: Array<{ anchor?: string; backlinks?: number }> }> }>;
  };
  return (response.tasks?.[0]?.result?.[0]?.items ?? []).map((item) => ({ anchor: String(item.anchor ?? ""), backlinks: Number(item.backlinks ?? 0) }));
}

async function fetchTopReferringDomains(domain: string): Promise<Array<{ domain: string; backlinks: number; rank: number }>> {
  const response = await post("/backlinks/referring_domains/live", { target: domain, limit: 10, include_subdomains: true, order_by: ["backlinks,desc"] }) as {
    tasks?: Array<{ result?: Array<{ items?: Array<{ domain?: string; backlinks?: number; rank?: number }> }> }>;
  };
  return (response.tasks?.[0]?.result?.[0]?.items ?? []).map((item) => ({
    domain: String(item.domain ?? ""),
    backlinks: Number(item.backlinks ?? 0),
    rank: Number(item.rank ?? 0),
  }));
}

export async function captureBacklinks(domains: string[], snapshotDate: string): Promise<{ ok: number; failed: number; errors: Array<{ domain: string; error: string }> }> {
  const sql = getPersistenceSql();
  if (!sql) throw new Error("DATABASE_URL not configured");
  await ensurePersistenceSchema();

  let ok = 0;
  const errors: Array<{ domain: string; error: string }> = [];

  for (const domain of domains) {
    try {
      const summary = await fetchSummary(domain);
      const [anchors, refDomains] = await Promise.all([
        fetchAnchors(domain).catch(() => []),
        fetchTopReferringDomains(domain).catch(() => []),
      ]);
      await sql`
        insert into seo_backlink_snapshots (snapshot_date, domain, total_backlinks, referring_domains, referring_main_domains, broken_backlinks, rank, spam_score, top_anchors, top_referring_domains)
        values (${snapshotDate}, ${domain},
          ${summary.backlinks ?? null}, ${summary.referring_domains ?? null}, ${summary.referring_main_domains ?? null},
          ${summary.broken_backlinks ?? null}, ${summary.rank ?? null}, ${summary.backlinks_spam_score ?? null},
          ${JSON.stringify(anchors)}::jsonb, ${JSON.stringify(refDomains)}::jsonb)
        on conflict (snapshot_date, domain) do update set
          total_backlinks = excluded.total_backlinks,
          referring_domains = excluded.referring_domains,
          referring_main_domains = excluded.referring_main_domains,
          broken_backlinks = excluded.broken_backlinks,
          rank = excluded.rank,
          spam_score = excluded.spam_score,
          top_anchors = excluded.top_anchors,
          top_referring_domains = excluded.top_referring_domains,
          captured_at = now()
      `;
      ok++;
    } catch (error) {
      errors.push({ domain, error: error instanceof Error ? error.message : "unknown" });
    }
  }

  return { ok, failed: errors.length, errors };
}
