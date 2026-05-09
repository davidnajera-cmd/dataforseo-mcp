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
  collectGa4ConversionEvents,
} from "./data-collectors.js";
import { upsertProposedTasks, ProposedTask, startAgentRun, finishAgentRun, applyAutoBlock, markStaleTasks, countPendingTasks } from "../backlog-store.js";
import { getRuntimeVariable } from "../runtime-config.js";
import { generateHeuristicTasks, CollectorPayload } from "./heuristic-tasks.js";
import { pushTasksToSlack } from "../slack-sync.js";
import { findQ10Violations } from "./q10-classifier.js";
import { loadRepoSnapshot, type RepoSnapshot } from "./repo-snapshot.js";
import { validateTaskSlugs, applySlugValidationToTasks } from "./slug-validator.js";

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

    // 0. Load repo snapshot (best-effort). If missing, agent runs in degraded
    // mode without slug validation — the runtime variables for GitHub may not
    // be configured yet.
    let repoSnapshot: RepoSnapshot | null = null;
    try {
      repoSnapshot = await loadRepoSnapshot();
      stats.repo_snapshot = repoSnapshot
        ? { commit_sha: repoSnapshot.commit_sha, routes: repoSnapshot.routes.length, redirects: repoSnapshot.redirects.length, sitemap_routes: repoSnapshot.sitemap_routes.length }
        : { status: "not_configured" };
    } catch (error) {
      errors.push({ stage: "repo_snapshot", error: error instanceof Error ? error.message : "unknown" });
      stats.repo_snapshot = { status: "failed" };
    }

    // 1. Collect raw data per site (in parallel within site, sequential across to avoid rate limit)
    const rawPerSite: Record<string, unknown> = {};
    for (const site of sites) {
      try {
        const [opportunities, movers, backlinks, rankings, llm, traffic, sitemaps, ga4Conversions] = await Promise.all([
          collectGscOpportunities(site).catch(() => []),
          collectGscMovers(site).catch(() => ({ gainers: [], losers: [] })),
          collectBacklinksSnapshot(site).catch(() => ({ source: "missing" as const, data: null, anchors: null })),
          collectRankingsSnapshot(site).catch(() => null),
          collectLlmVisibility(site).catch(() => []),
          collectTrafficTrend(site, 28).catch(() => ({ gsc: [], ga4: [] })),
          collectSitemapStatus(site).catch(() => null),
          collectGa4ConversionEvents(site).catch(() => ({ configured: false, message: "ga4 collector failed", total_events_28d: 0, total_seo_conversions_28d: 0, events: [], by_landing_page: [] })),
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
          ga4_conversions: ga4Conversions,
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
    const maxNewInsertsRaw = await getRuntimeVariable("AGENT_MAX_NEW_INSERTS_PER_RUN");
    const baseMaxNewInserts = Number(maxNewInsertsRaw ?? 12);
    // Dynamic cap: if backlog already has >200 pendientes, the agent should
    // refresh existing tasks instead of inflating. Drop cap to 5 automatically.
    const pendingCount = await countPendingTasks().catch(() => 0);
    const maxNewInserts = pendingCount > 200 ? Math.min(baseMaxNewInserts, 5) : baseMaxNewInserts;
    stats.pending_at_run_start = pendingCount;
    stats.cap_max_new_inserts = maxNewInserts;
    stats.cap_reason = pendingCount > 200 ? "backlog_>200_auto_throttle" : "default_cap";
    // Validate heuristic-task slugs against the repo inventory before upsert.
    // Heuristics rarely invent paths (they read from data) but a missing route
    // is a useful signal that flags a task for human review.
    if (heuristicTotal.length > 0 && repoSnapshot) {
      const validation = validateTaskSlugs(heuristicTotal, repoSnapshot);
      stats.slug_validation_heuristic = {
        checked: validation.total_paths_checked,
        unknown: validation.total_paths_unknown,
        flagged: validation.tasks_flagged,
      };
      if (validation.tasks_flagged > 0) {
        const annotated = applySlugValidationToTasks(heuristicTotal, validation);
        // Replace the in-memory list AND the per-site map so what we hand to
        // Opus reflects the corrected metadata.
        heuristicTotal = annotated;
        for (const [domain, list] of Object.entries(heuristicTasksPerSite)) {
          heuristicTasksPerSite[domain] = list.map((t) => annotated.find((a) => a.signature_key === t.signature_key) ?? t);
        }
      }
    }

    let heuristicUpsert = { inserted: 0, updated: 0, skipped: 0, capped: 0 };
    if (heuristicTotal.length > 0) {
      try {
        heuristicUpsert = await upsertProposedTasks(heuristicTotal, { maxNewInserts });
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
    const repoContext = buildRepoContextString(repoSnapshot);
    const systemPrompt = OPUS_SYSTEM_TEMPLATE(maxTasks, buildBrandContext(true), repoContext);
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

      // Defensive: enforce Q10 business rule on Opus output. If a task targets
      // a Q10/portal page or has audience='estudiantes_actuales' but contains
      // banned commercial phrases (matricula, admision, captacion, etc.), drop
      // or clean it. We don't want Opus to leak commercial framing into Q10.
      const q10Stats = { rejected: 0, cleaned: 0 };
      proposedTasks = proposedTasks.flatMap((t) => {
        const looksQ10 = t.audience === "estudiantes_actuales" || t.intencion === "navegacional"
          || /q\s?10|portal[\s-]?estudiantes|plataforma[\s-]?dna|acceso[\s-]?q\s?10/i.test(t.title + " " + t.description);
        if (!looksQ10) return [t];
        const titleViolations = findQ10Violations(t.title);
        const descViolations = findQ10Violations(t.description);
        if (titleViolations.length > 0) {
          q10Stats.rejected++;
          return []; // drop entirely — title with banned phrase is too risky
        }
        if (descViolations.length > 0) {
          q10Stats.cleaned++;
          // Append a cleanup note instead of stripping — the team can see the warning.
          return [{ ...t, description: t.description + ` [WARN: revisar wording — palabras detectadas como comerciales en contexto Q10: ${descViolations.join(", ")}]` }];
        }
        return [t];
      });
      stats.q10_rejected_opus_tasks = q10Stats.rejected;
      stats.q10_cleaned_opus_tasks = q10Stats.cleaned;

      // Slug validation on Opus output. Opus is the one that hallucinates
      // slugs (heuristics are deterministic), so this is where it matters
      // most. Tasks with unknown paths get flagged human-review + medium risk
      // so they don't auto-execute downstream.
      if (proposedTasks.length > 0 && repoSnapshot) {
        const validation = validateTaskSlugs(proposedTasks, repoSnapshot);
        stats.slug_validation_opus = {
          checked: validation.total_paths_checked,
          unknown: validation.total_paths_unknown,
          flagged: validation.tasks_flagged,
          issues_sample: validation.issues.slice(0, 5),
        };
        if (validation.tasks_flagged > 0) {
          proposedTasks = applySlugValidationToTasks(proposedTasks, validation);
        }
      }
    } catch (error) {
      errors.push({ stage: "opus", error: error instanceof Error ? error.message : "unknown" });
    }
    stats.opus_proposed_tasks = proposedTasks.length;

    // 4. Dedup + insert (Opus-proposed tasks — heuristic ones already inserted in step 1.5)
    // Reserve insert budget already used by heuristics so we don't blow past the cap.
    const remainingNewInserts = Math.max(0, maxNewInserts - heuristicUpsert.inserted);
    const opusUpsert = proposedTasks.length
      ? await upsertProposedTasks(proposedTasks, { maxNewInserts: remainingNewInserts })
      : { inserted: 0, updated: 0, skipped: 0, capped: 0 };

    const totalProposed = proposedTasks.length + heuristicTotal.length;
    const totalInserted = opusUpsert.inserted + heuristicUpsert.inserted;
    const totalUpdated = opusUpsert.updated + heuristicUpsert.updated;
    const totalSkipped = opusUpsert.skipped + heuristicUpsert.skipped;

    // 4.5 Apply auto-block + stale annotations after the upsert so dependencies
    // resolved in this run flip the right rows.
    try {
      const autoBlock = await applyAutoBlock();
      const stale = await markStaleTasks(30);
      stats.auto_block = autoBlock;
      stats.stale_marked = stale.marked;
    } catch (error) {
      errors.push({ stage: "auto_block_or_stale", error: error instanceof Error ? error.message : "unknown" });
    }

    // 5. Outbound Slack sync (best-effort: errors do NOT fail the agent run).
    try {
      const slackOut = await pushTasksToSlack(50);
      stats.slack_out = slackOut;
      if (slackOut.failed > 0) {
        for (const e of slackOut.errors.slice(0, 5)) errors.push({ stage: "slack_outbound", ...e });
      }
    } catch (error) {
      errors.push({ stage: "slack_outbound", error: error instanceof Error ? error.message : "unknown" });
    }

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

// Build the repoContext string we inject into the Opus prompt. Caps the
// inventory at sane sizes so we don't blow the context window: routes are
// listed (canonical paths only, no dynamic noise), redirects shown as a sample
// of the most relevant ones, sitemap routes verbatim, and data-file slug sets
// summarized.
function buildRepoContextString(snapshot: RepoSnapshot | null): string | undefined {
  if (!snapshot) return undefined;
  const lines: string[] = [];
  lines.push(`Repo: ${snapshot.owner}/${snapshot.name} @ ${snapshot.branch} (commit ${snapshot.commit_sha.slice(0, 8)}, snapshot ${snapshot.fetched_at})`);
  const routesPreview = snapshot.routes.slice(0, 200);
  lines.push(`\nRutas reales (${snapshot.routes.length} total, primeras ${routesPreview.length}):`);
  lines.push(routesPreview.map((r) => `  ${r}`).join("\n"));
  if (snapshot.redirects.length > 0) {
    const redirectPreview = snapshot.redirects.slice(0, 60);
    lines.push(`\nRedirects en repo (${snapshot.redirects.length} total, muestra ${redirectPreview.length}):`);
    lines.push(redirectPreview.map((r) => `  ${r.from} → ${r.to ?? "(404)"} [${r.status}]`).join("\n"));
  }
  if (snapshot.sitemap_routes.length > 0) {
    lines.push(`\nRutas declaradas en app/sitemap.ts (${snapshot.sitemap_routes.length}):`);
    lines.push(snapshot.sitemap_routes.slice(0, 80).map((r) => `  ${r}`).join("\n"));
  }
  if (Object.keys(snapshot.data_files).length > 0) {
    lines.push(`\nSlugs de catálogo (src/data/*):`);
    for (const [file, slugs] of Object.entries(snapshot.data_files)) {
      lines.push(`  ${file}: ${slugs.slice(0, 30).join(", ")}${slugs.length > 30 ? `, ... (+${slugs.length - 30})` : ""}`);
    }
  }
  return lines.join("\n");
}

async function deepseekTotalCost(_results: DeepSeekSummary[]): Promise<number> {
  // The deepseek client returns cost per call, but we don't expose it via the wrapper above.
  // Conservative estimate: 0.01 USD per site summary call.
  // (We could refactor to surface per-call cost; for now this is a small fraction of Opus cost.)
  return 0.01 * _results.length;
}
