import { deepseekChat } from "./deepseek-client.js";
import { opusChat } from "./opus-client.js";
import { buildBrandContext, DEEPSEEK_SYSTEM, OPUS_SYSTEM_TEMPLATE } from "./prompts.js";
import { mapQueriesBulk } from "./keyword-mapper.js";
import {
  loadSiteContexts,
  collectGscOpportunities,
  collectGscMovers,
  collectBacklinksSnapshot,
  collectRankingsSnapshot,
  collectLlmVisibility,
  collectTrafficTrend,
  collectSitemapStatus,
} from "./data-collectors.js";
import { upsertProposedTasks, ProposedTask, startAgentRun, finishAgentRun } from "../backlog-store.js";
import { getRuntimeVariable } from "../runtime-config.js";
import { generateHeuristicTasks, CollectorPayload } from "./heuristic-tasks.js";

type DeepSeekSummary = {
  domain: string;
  signals: unknown;
};

function safeJson<T = unknown>(text: string): T | null {
  // Strip markdown fences if present
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/m, "").trim();
  }
  try { return JSON.parse(cleaned) as T; } catch { return null; }
}

async function deepseekSummarize(domain: string, payload: unknown): Promise<DeepSeekSummary> {
  const userPrompt = `Domain: ${domain}\n\nData (JSON):\n${JSON.stringify(payload, null, 2)}\n\nGenera un resumen estructurado en JSON con las observaciones más relevantes para SEO accionable. Identifica patrones, gaps, riesgos. Sé específico (keywords/URLs literales). Máximo 30 observaciones.`;
  const result = await deepseekChat([
    { role: "system", content: DEEPSEEK_SYSTEM },
    { role: "user", content: userPrompt },
  ], { json_mode: true, max_tokens: 4096 });
  const parsed = safeJson(result.text);
  return { domain, signals: parsed ?? { observations: [], _raw_text_truncated: result.text.slice(0, 1000) } };
}

export type AgentRunResult = {
  proposed: number;
  inserted: number;
  updated: number;
  skipped: number;
  cost_usd: number;
  stats: unknown;
  status: "ok" | "partial" | "failed";
  errors: unknown[];
};

export async function runAgent(): Promise<AgentRunResult> {
  const runId = await startAgentRun().catch(() => -1);
  const errors: unknown[] = [];
  let totalCost = 0;
  const stats: Record<string, unknown> = {};

  try {
    const sites = await loadSiteContexts();
    if (sites.length === 0) throw new Error("No site contexts found (DNA_DOMAIN_* missing)");

    // 1. Collect raw data per site (in parallel within site, sequential across to avoid rate limit)
    const rawPerSite: Record<string, unknown> = {};
    for (const site of sites) {
      try {
        const [opportunities, movers, backlinks, rankings, llm, traffic, sitemaps] = await Promise.all([
          collectGscOpportunities(site).catch(() => []),
          collectGscMovers(site).catch(() => ({ gainers: [], losers: [] })),
          collectBacklinksSnapshot(site).catch(() => ({ source: "missing" as const, data: null, anchors: null })),
          collectRankingsSnapshot(site).catch(() => null),
          collectLlmVisibility(site).catch(() => []),
          collectTrafficTrend(site, 28).catch(() => ({ gsc: [], ga4: [] })),
          collectSitemapStatus(site).catch(() => null),
        ]);

        // Annotate top GSC queries with the DNA Music academic catalog mapper.
        // Only for dnamusic.edu.co (CO catalog). Other sites get null annotations.
        const annotateQueries = site.domain === "dnamusic.edu.co";
        const annotatedOpportunities = annotateQueries
          ? opportunities.map((o, i) => i < 30 ? { ...o, mapping: mapQueriesBulk([o.query])[0] } : o)
          : opportunities;
        const annotatedMovers = annotateQueries
          ? {
              gainers: movers.gainers.map((g) => ({ ...g, mapping: mapQueriesBulk([g.query])[0] })),
              losers: movers.losers.map((l) => ({ ...l, mapping: mapQueriesBulk([l.query])[0] })),
            }
          : movers;

        rawPerSite[site.domain] = {
          domain: site.domain,
          country: site.countryCode,
          uses_dna_catalog: annotateQueries,
          gsc_opportunities: annotatedOpportunities,
          gsc_movers_60d: annotatedMovers,
          backlinks: backlinks.data,
          backlinks_anchors: backlinks.anchors,
          rankings_snapshot: rankings,
          llm_visibility: llm,
          traffic_trend_28d: traffic,
          sitemaps,
        };
      } catch (error) {
        errors.push({ stage: "collect", domain: site.domain, error: error instanceof Error ? error.message : "unknown" });
      }
    }
    stats.collected_sites = Object.keys(rawPerSite);

    // 1.5 Heuristic tasks (rule-based, no LLM, cheap, deterministic).
    // Insert directly to backlog AND pass to Opus as context so it does not duplicate.
    const heuristicTasksPerSite: Record<string, ProposedTask[]> = {};
    let heuristicTotal: ProposedTask[] = [];
    for (const [domain, payload] of Object.entries(rawPerSite)) {
      try {
        const tasks = generateHeuristicTasks(payload as CollectorPayload);
        heuristicTasksPerSite[domain] = tasks;
        heuristicTotal = heuristicTotal.concat(tasks);
      } catch (error) {
        errors.push({ stage: "heuristic", domain, error: error instanceof Error ? error.message : "unknown" });
      }
    }
    let heuristicUpsert = { inserted: 0, updated: 0, skipped: 0 };
    if (heuristicTotal.length > 0) {
      try {
        heuristicUpsert = await upsertProposedTasks(heuristicTotal);
      } catch (error) {
        errors.push({ stage: "heuristic_upsert", error: error instanceof Error ? error.message : "unknown" });
      }
    }
    stats.heuristic_tasks_count = heuristicTotal.length;
    stats.heuristic_inserted = heuristicUpsert.inserted;
    stats.heuristic_updated = heuristicUpsert.updated;
    stats.heuristic_skipped = heuristicUpsert.skipped;

    // 2. DeepSeek per site (parallel)
    const deepResults = await Promise.all(
      Object.entries(rawPerSite).map(async ([domain, payload]) => {
        try {
          const summary = await deepseekSummarize(domain, payload);
          return summary;
        } catch (error) {
          errors.push({ stage: "deepseek", domain, error: error instanceof Error ? error.message : "unknown" });
          return { domain, signals: { error: "deepseek_failed" } } as DeepSeekSummary;
        }
      })
    );
    stats.deepseek_summaries = deepResults.length;
    const deepseekCost = await deepseekTotalCost(deepResults).catch(() => 0);
    totalCost += deepseekCost;
    stats.deepseek_cost_usd = deepseekCost;

    // 3. Opus orchestration
    const maxTasksRaw = await getRuntimeVariable("AGENT_MAX_TASKS_PER_RUN");
    const maxTasks = Number(maxTasksRaw ?? 10);
    const systemPrompt = OPUS_SYSTEM_TEMPLATE(maxTasks, buildBrandContext(true));
    const summariesPayload = deepResults.map((r) => ({ domain: r.domain, signals: r.signals }));
    const heuristicSummary = Object.entries(heuristicTasksPerSite).map(([domain, list]) => ({
      domain,
      heuristic_tasks_already_inserted: list.map((t) => ({ signature_key: t.signature_key, title: t.title, category: t.category, impact_score: t.impact_score, difficulty_score: t.difficulty_score, confidence_score: t.confidence_score })),
    }));
    const userPrompt = `RESÚMENES DE DEEPSEEK (datos ya clasificados por sitio):\n\n${JSON.stringify(summariesPayload, null, 2)}\n\nTAREAS HEURÍSTICAS YA INSERTADAS (no las repitas):\n${JSON.stringify(heuristicSummary, null, 2)}\n\nGenera el array JSON de tareas accionables ADICIONALES — las que el heurístico no detecta porque requieren juicio estratégico (cross-source patterns, brand strategy, contenido creativo, decisiones de priorización compleja). Máximo ${maxTasks}, scoring 0-100 obligatorio en impact/difficulty/confidence, evidencia numérica concreta.`;

    let proposedTasks: ProposedTask[] = [];
    try {
      const opusResult = await opusChat(systemPrompt, userPrompt, { max_tokens: 8000 });
      totalCost += opusResult.cost_usd;
      stats.opus_cost_usd = opusResult.cost_usd;
      stats.opus_input_tokens = opusResult.usage.input_tokens;
      stats.opus_output_tokens = opusResult.usage.output_tokens;
      const parsed = safeJson<unknown[]>(opusResult.text);
      if (!Array.isArray(parsed)) throw new Error("Opus did not return a JSON array");
      proposedTasks = parsed
        .filter((t): t is ProposedTask => isValidTask(t))
        .slice(0, maxTasks);
    } catch (error) {
      errors.push({ stage: "opus", error: error instanceof Error ? error.message : "unknown" });
    }
    stats.opus_proposed_tasks = proposedTasks.length;

    // 4. Dedup + insert (Opus-proposed tasks — heuristic ones already inserted in step 1.5)
    const opusUpsert = proposedTasks.length
      ? await upsertProposedTasks(proposedTasks)
      : { inserted: 0, updated: 0, skipped: 0 };

    const totalProposed = proposedTasks.length + heuristicTotal.length;
    const totalInserted = opusUpsert.inserted + heuristicUpsert.inserted;
    const totalUpdated = opusUpsert.updated + heuristicUpsert.updated;
    const totalSkipped = opusUpsert.skipped + heuristicUpsert.skipped;

    const status: "ok" | "partial" | "failed" = errors.length === 0 ? "ok" : (totalProposed > 0 ? "partial" : "failed");
    if (runId > 0) {
      await finishAgentRun(runId, status, {
        proposed: totalProposed,
        inserted: totalInserted,
        updated: totalUpdated,
        skipped: totalSkipped,
        cost_usd: totalCost,
        stats,
        errors: errors.length ? errors : null,
      });
    }
    return { proposed: totalProposed, inserted: totalInserted, updated: totalUpdated, skipped: totalSkipped, cost_usd: totalCost, stats, status, errors };
  } catch (error) {
    errors.push({ stage: "pipeline", error: error instanceof Error ? error.message : "unknown" });
    if (runId > 0) {
      await finishAgentRun(runId, "failed", { proposed: 0, inserted: 0, updated: 0, skipped: 0, cost_usd: totalCost, stats, errors });
    }
    return { proposed: 0, inserted: 0, updated: 0, skipped: 0, cost_usd: totalCost, stats, status: "failed", errors };
  }
}

function isValidTask(t: unknown): boolean {
  if (!t || typeof t !== "object") return false;
  const r = t as Record<string, unknown>;
  return typeof r.signature_key === "string"
    && typeof r.title === "string"
    && typeof r.description === "string"
    && typeof r.domain === "string"
    && typeof r.category === "string"
    && typeof r.priority === "string"
    && typeof r.rationale === "string";
}

async function deepseekTotalCost(_results: DeepSeekSummary[]): Promise<number> {
  // The deepseek client returns cost per call, but we don't expose it via the wrapper above.
  // Conservative estimate: 0.01 USD per site summary call.
  // (We could refactor to surface per-call cost; for now this is a small fraction of Opus cost.)
  return 0.01 * _results.length;
}
