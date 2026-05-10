// Market Research Agent pipeline.
//
// Stages:
//   1. classify  — Opus reads the question, returns { type, entities, depth, language, geo_scope }
//   2. plan      — Opus picks tools + args + expected cost (only from the curated registry)
//   3. (gate)    — user approves/edits the plan
//   4. execute   — for each step: live call → persist observation → compute delta vs prior
//   5. synthesize — Opus reads observations + deltas → 7-section structured brief
//   6. critique  — Opus self-checks rigor; one optional refinement pass
//   7. persist   — write brief + link observations
//
// The agent NEVER skips a live call based on prior data. Prior observations are
// loaded only to compute deltas and surface trends in the synthesis. This is
// enforced by the executor: every step calls the live tool, then looks up the
// prior matching observation for delta computation.

import { opusChat } from "./opus-client.js";
import { buildBrandContext } from "./prompts.js";
import { post as dataforseoPost, get as dataforseoGet } from "../dataforseo-client.js";
import { gscPost } from "../gsc-client.js";
import { runActorSync, getConfiguredActor } from "../apify-client.js";
import {
  ensureResearchSchema,
  createBrief,
  setBriefPlan,
  approveBriefPlan,
  completeBrief,
  failBrief,
  getBrief,
  findPriorObservation,
  persistObservation,
  annotateObservationSummary,
  recordEntity,
  computeDelta,
  canonicalArgsHash,
  lookbackDaysForTool,
  type ResearchClassification,
  type ResearchPlan,
  type ResearchPlanStep,
  type ResearchBriefBody,
  type ResearchBrief,
  type ResearchQualityGate,
} from "../research-store.js";

// ============================================================================
// TOOL REGISTRY — the curated subset of tools the agent can plan with
// ============================================================================

type ToolExecutor = (args: Record<string, unknown>) => Promise<{ result: unknown; cost_usd: number }>;

const TOOL_REGISTRY: Record<string, { executor: ToolExecutor; expected_cost_usd: number; description: string }> = {
  // --- GSC ---
  gsc_search_analytics_query: {
    expected_cost_usd: 0.0,
    description: "GSC search analytics: clicks/impressions/CTR/position grouped by chosen dimensions for a date range.",
    executor: async (args) => {
      const { site_url, ...rest } = args as { site_url: string; [k: string]: unknown };
      const result = await gscPost(`/sites/${encodeURIComponent(site_url)}/searchAnalytics/query`, rest);
      return { result, cost_usd: 0 };
    },
  },
  gsc_url_inspection: {
    expected_cost_usd: 0.0,
    description: "GSC URL Inspection: indexation state, noindex flags, canonical, last crawl. Per-URL.",
    executor: async (args) => {
      const result = await gscPost("/urlInspection/index:inspect", {
        inspectionUrl: (args as Record<string, unknown>).inspection_url,
        siteUrl: (args as Record<string, unknown>).site_url,
        languageCode: (args as Record<string, unknown>).language_code ?? "en-US",
      }, "searchconsole");
      return { result, cost_usd: 0 };
    },
  },

  // --- DataForSEO Labs (cheap, ~$0.01 per call) ---
  labs_google_keyword_ideas: {
    expected_cost_usd: 0.01,
    description: "Keyword ideas seeded from a query, with volume + difficulty.",
    executor: async (args) => {
      const result = await dataforseoPost("/dataforseo_labs/google/keyword_ideas/live", args);
      return { result, cost_usd: 0.01 };
    },
  },
  labs_google_keyword_overview: {
    expected_cost_usd: 0.01,
    description: "Keyword metrics (volume, CPC, difficulty) for a list of keywords.",
    executor: async (args) => {
      const result = await dataforseoPost("/dataforseo_labs/google/keyword_overview/live", args);
      return { result, cost_usd: 0.01 };
    },
  },
  labs_google_search_intent: {
    expected_cost_usd: 0.01,
    description: "Classifies search intent (informational/commercial/local/navigational) for keywords.",
    executor: async (args) => {
      const result = await dataforseoPost("/dataforseo_labs/google/search_intent/live", args);
      return { result, cost_usd: 0.01 };
    },
  },
  labs_google_competitors_domain: {
    expected_cost_usd: 0.01,
    description: "Top competitor domains for a target by keyword overlap.",
    executor: async (args) => {
      const result = await dataforseoPost("/dataforseo_labs/google/competitors_domain/live", args);
      return { result, cost_usd: 0.01 };
    },
  },
  labs_google_ranked_keywords: {
    expected_cost_usd: 0.02,
    description: "All keywords a domain ranks for with positions and volumes.",
    executor: async (args) => {
      const result = await dataforseoPost("/dataforseo_labs/google/ranked_keywords/live", args);
      return { result, cost_usd: 0.02 };
    },
  },
  labs_google_serp_competitors: {
    expected_cost_usd: 0.01,
    description: "Who appears in SERP for a list of keywords.",
    executor: async (args) => {
      const result = await dataforseoPost("/dataforseo_labs/google/serp_competitors/live", args);
      return { result, cost_usd: 0.01 };
    },
  },
  labs_google_top_searches: {
    expected_cost_usd: 0.01,
    description: "Top trending searches for a location.",
    executor: async (args) => {
      const result = await dataforseoPost("/dataforseo_labs/google/top_searches/live", args);
      return { result, cost_usd: 0.01 };
    },
  },

  // --- Keywords / Trends ---
  keywords_google_search_volume_live: {
    expected_cost_usd: 0.005,
    description: "Google Ads search volume for keywords (12-month avg).",
    executor: async (args) => {
      const result = await dataforseoPost("/keywords_data/google_ads/search_volume/live", args);
      return { result, cost_usd: 0.005 };
    },
  },
  keywords_google_trends_live: {
    expected_cost_usd: 0.005,
    description: "Google Trends interest data over time.",
    executor: async (args) => {
      const result = await dataforseoPost("/keywords_data/google_trends/explore/live", args);
      return { result, cost_usd: 0.005 };
    },
  },

  // --- SERP ---
  serp_google_organic_live: {
    expected_cost_usd: 0.002,
    description: "Live Google organic SERP for a keyword.",
    executor: async (args) => {
      const result = await dataforseoPost("/serp/google/organic/live/advanced", args);
      return { result, cost_usd: 0.002 };
    },
  },
  serp_google_ads_advertisers_live: {
    expected_cost_usd: 0.005,
    description: "Discover advertisers in Google Ads Transparency Center by keyword.",
    executor: async (args) => {
      const result = await dataforseoPost("/serp/google/ads_advertisers/live/advanced", args);
      return { result, cost_usd: 0.005 };
    },
  },

  // --- Backlinks ---
  backlinks_summary: {
    expected_cost_usd: 0.02,
    description: "Backlinks summary: total backlinks, referring domains, rank, spam score.",
    executor: async (args) => {
      const result = await dataforseoPost("/backlinks/summary/live", args);
      return { result, cost_usd: 0.02 };
    },
  },
  backlinks_referring_domains: {
    expected_cost_usd: 0.02,
    description: "List of referring domains for a target.",
    executor: async (args) => {
      const result = await dataforseoPost("/backlinks/referring_domains/live", args);
      return { result, cost_usd: 0.02 };
    },
  },

  // --- AI optimization (live LLM responses) ---
  ai_optimization_chatgpt_live: {
    expected_cost_usd: 0.05,
    description: "Get a ChatGPT response for a prompt, including reasoning.",
    executor: async (args) => {
      const result = await dataforseoPost("/ai_optimization/chatgpt/llm_responses/live", args);
      return { result, cost_usd: 0.05 };
    },
  },
  ai_optimization_perplexity_live: {
    expected_cost_usd: 0.05,
    description: "Get a Perplexity response for a prompt.",
    executor: async (args) => {
      const result = await dataforseoPost("/ai_optimization/perplexity/llm_responses/live", args);
      return { result, cost_usd: 0.05 };
    },
  },

  // --- Apify (pay-per-result) ---
  local_google_maps_scraper: {
    expected_cost_usd: 0.30,
    description: "Google Maps places by keyword + city for local SEO competitive scan.",
    executor: async (args) => {
      const actorId = await getConfiguredActor("google_maps");
      const result = await runActorSync(actorId, args, { max_items: (args.max_items as number) ?? 20 });
      return { result, cost_usd: 0.30 };
    },
  },
  web_content_crawler: {
    expected_cost_usd: 0.20,
    description: "Crawl pages and return clean Markdown.",
    executor: async (args) => {
      const actorId = await getConfiguredActor("web_crawler");
      const result = await runActorSync(actorId, args, { max_items: (args.max_items as number) ?? 25 });
      return { result, cost_usd: 0.20 };
    },
  },
  social_tiktok_content: {
    expected_cost_usd: 0.30,
    description: "Organic TikTok videos by hashtag/keyword/profile.",
    executor: async (args) => {
      const actorId = await getConfiguredActor("tiktok_content");
      const result = await runActorSync(actorId, args, { max_items: (args.max_items as number) ?? 30 });
      return { result, cost_usd: 0.30 };
    },
  },
  social_tiktok_comments: {
    expected_cost_usd: 0.30,
    description: "Comments from specific TikTok video URLs.",
    executor: async (args) => {
      const actorId = await getConfiguredActor("tiktok_comments");
      const result = await runActorSync(actorId, args, { max_items: (args.max_items as number) ?? 200 });
      return { result, cost_usd: 0.30 };
    },
  },
  social_instagram_scraper: {
    expected_cost_usd: 0.25,
    description: "Instagram public data (profile/posts/hashtags/comments).",
    executor: async (args) => {
      const actorId = await getConfiguredActor("instagram");
      const result = await runActorSync(actorId, args, { max_items: (args.max_items as number) ?? 50 });
      return { result, cost_usd: 0.25 };
    },
  },
  social_youtube_transcript: {
    expected_cost_usd: 0.20,
    description: "YouTube video transcripts.",
    executor: async (args) => {
      const actorId = await getConfiguredActor("youtube");
      const result = await runActorSync(actorId, args, { max_items: (args.max_items as number) ?? 10 });
      return { result, cost_usd: 0.20 };
    },
  },
  market_news_monitor: {
    expected_cost_usd: 0.15,
    description: "Google News articles for queries (Colombia-first defaults).",
    executor: async (args) => {
      const actorId = await getConfiguredActor("news");
      const result = await runActorSync(actorId, args, { max_items: (args.max_items as number) ?? 20 });
      return { result, cost_usd: 0.15 };
    },
  },
  market_reddit_intelligence: {
    expected_cost_usd: 0.20,
    description: "Reddit posts/comments for searches/subreddits.",
    executor: async (args) => {
      const actorId = await getConfiguredActor("reddit");
      const result = await runActorSync(actorId, args, { max_items: (args.max_items as number) ?? 30 });
      return { result, cost_usd: 0.20 };
    },
  },
  adlib_meta_search: {
    expected_cost_usd: 0.30,
    description: "Meta (FB+IG) Ad Library — active creatives by search/page/country.",
    executor: async (args) => {
      const actorId = await getConfiguredActor("meta");
      const result = await runActorSync(actorId, args, { max_items: (args.max_items as number) ?? 25 });
      return { result, cost_usd: 0.30 };
    },
  },
  adlib_google_search: {
    expected_cost_usd: 0.30,
    description: "Google Ads Transparency Center creatives by advertiser.",
    executor: async (args) => {
      const actorId = await getConfiguredActor("google");
      const result = await runActorSync(actorId, args, { max_items: (args.max_items as number) ?? 25 });
      return { result, cost_usd: 0.30 };
    },
  },
};

function describeRegistry(): string {
  return Object.entries(TOOL_REGISTRY)
    .map(([name, spec]) => `- ${name} (≈$${spec.expected_cost_usd.toFixed(3)}/call): ${spec.description}`)
    .join("\n");
}

// ============================================================================
// PROMPTS
// ============================================================================

const CLASSIFY_SYSTEM = `Eres un clasificador de preguntas de investigación de mercado para DNA Music (Colombia: dnamusic.edu.co + latiendadeaudio.com; México: dnamusic.mx). Lee la pregunta y devuelve JSON con la clasificación.

Tipos posibles:
- competitive_landscape (quien compite, donde, como)
- market_opportunity (gaps, geo expansión, niche)
- customer_voice (sentimiento, objeciones, dudas)
- category_trend (demanda evolución, estacionalidad)
- pauta_intelligence (creatives competitivos, mensajes)
- brand_audit (cómo está NUESTRA marca vs mercado)
- topic_research (oportunidad de contenido para un tema)

DNA Music conocimientos básicos (siempre referirse como "DNA Music", nunca "DNA" solo):
- 11 programas en Colombia: dj-profesional, productor-audio, dj-productor, ingenieria-audio, sonido-vivo, music-business, etc.
- 5 sedes CO: Bogotá, Medellín, Cali, Barranquilla, Pereira.
- Audiencia primaria: gen Z (16-25) interesada en DJ/producción musical.
- ETDH (Educación para el Trabajo y Desarrollo Humano) — marco regulatorio de DNA Music.
- Competencia conocida: SAE Institute Colombia, Audio Designer, Pioneer DJ School.

Devuelve EXACTAMENTE este JSON:
{
  "type": "<tipo>",
  "entities": ["entidad1", "entidad2"],
  "depth": "quick | standard | deep",
  "language": "es | en",
  "geo_scope": ["CO" | "MX" | "<ciudad específica>"],
  "rationale": "1-2 frases sobre por qué clasifico así"
}

Sin prosa fuera del JSON.`;

const PLAN_SYSTEM = (registry: string, brandContext: string) => `Eres un planificador de investigación de mercado para DNA Music. Recibes una pregunta clasificada y debes proponer una secuencia de llamadas a herramientas que respondan profundamente la pregunta. Solo puedes usar las herramientas del catálogo.

CONTEXTO DE LAS MARCAS (CRÍTICO — basa tus decisiones en esto, no en suposiciones):
${brandContext}



CATÁLOGO DE HERRAMIENTAS (con costo aproximado por llamada):
${registry}

REGLAS:
- Mínimo 8 pasos, máximo 20.
- Para questions Colombia-first: usa location_code=2170, language_code=es, country=co.
- Para customer_voice en Colombia: prioriza social_tiktok_content + social_tiktok_comments + social_instagram_scraper. Reddit es secundario.
- Para competitive_landscape: combina labs_google_competitors_domain + labs_google_ranked_keywords + local_google_maps_scraper + adlib_*.
- Para category_trend: keywords_google_trends_live + labs_google_top_searches + market_news_monitor.
- Para brand_audit: gsc_search_analytics_query + ai_optimization_chatgpt_live (consulta directa a LLM sobre la marca).
- IMPORTANTE: cita parámetros específicos (no "<seed>" — pon valores literales basados en la pregunta + clasificación).
- Cada paso debe tener un "why" explicando qué hipótesis respalda.
- depends_on opcional: si paso B necesita output de paso A, declara depends_on=[A.step_number].

OUTPUT JSON:
{
  "steps": [
    { "step_number": 1, "tool": "<tool_name>", "args": { <args> }, "why": "<por qué>", "expected_cost_usd": <número>, "depends_on": [] }
  ],
  "total_expected_cost_usd": <suma>
}

Sin prosa fuera del JSON.`;

const SYNTHESIZE_SYSTEM = `Eres un estratega senior de investigación de mercado. Recibes:
1. La pregunta original
2. La clasificación
3. Las observaciones (resultados de tools llamadas en VIVO en este run)
4. Deltas: comparación con observaciones previas (si existen)

Produce un brief estratégico de 7 secciones en JSON. Reglas duras:

- CADA claim cuantitativa debe citar un número literal (de las observations).
- CADA cita textual de cliente (TikTok/IG/Reddit comments) debe ir en comillas con autor si está disponible.
- Si una sección no tiene data por gap, dilo explícito: "No hay data suficiente porque <razón>".
- NUNCA generalices ("podría", "tal vez"). Si lo dices, respaldarlo con número.
- SEO + pauta deben conectarse cuando aplique (ej: "competidor X pauta para keyword Y donde DNA Music no rankea orgánicamente").
- IMPORTANTE: refiérete a la marca SIEMPRE como "DNA Music", nunca como "DNA" solo.
- Para deltas: cuando exista, surface el cambio ("<KW> bajó de pos 5 a pos 8 en 7 días").

OUTPUT JSON estricto:
{
  "demanda": { "summary": "...", "findings": [{ "claim": "...", "evidence": "...", "observation_ids": [1,2], "delta": "..." }], "evidence_observation_ids": [1,2,3] },
  "oferta": {...},
  "voz_del_cliente": {...},
  "pauta_competitiva": {...},
  "pr_y_backlinks": {...},
  "ai_visibility": {...},
  "gaps_y_oportunidades": {...}
}

Idioma: español. Sin prosa fuera del JSON.`;

// ============================================================================
// HELPERS
// ============================================================================

function safeJson<T = unknown>(text: string): T | null {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/m, "").trim();
  try { return JSON.parse(cleaned) as T; } catch { return null; }
}

function renderBriefMarkdown(brief: ResearchBriefBody, question: string): string {
  const sections: Array<[keyof ResearchBriefBody, string]> = [
    ["demanda", "Demanda"],
    ["oferta", "Oferta"],
    ["voz_del_cliente", "Voz del cliente"],
    ["pauta_competitiva", "Pauta competitiva"],
    ["pr_y_backlinks", "PR y backlinks"],
    ["ai_visibility", "AI visibility"],
    ["gaps_y_oportunidades", "Gaps y oportunidades"],
  ];
  const lines: string[] = [`# Research brief — ${question}`, ""];
  for (const [key, title] of sections) {
    const sec = brief[key];
    if (!sec) continue;
    lines.push(`## ${title}`);
    lines.push("");
    if (sec.summary) { lines.push(sec.summary); lines.push(""); }
    for (const f of sec.findings ?? []) {
      lines.push(`- **${f.claim}** — ${f.evidence}${f.delta ? ` _(Δ: ${f.delta})_` : ""}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

// ============================================================================
// PIPELINE STAGES
// ============================================================================

export type PlanResult = { brief_id: number; plan: ResearchPlan; classification: ResearchClassification };

export async function planResearch(input: { question: string; parent_brief_id?: number; requested_by?: string }): Promise<PlanResult> {
  await ensureResearchSchema();

  // 1. Classify
  const classifyResult = await opusChat(CLASSIFY_SYSTEM, input.question, { max_tokens: 800 });
  const classification = safeJson<ResearchClassification>(classifyResult.text);
  if (!classification) throw new Error("Classifier did not return valid JSON");

  // 2. Plan
  const briefId = await createBrief({ question: input.question, classification, parent_brief_id: input.parent_brief_id, requested_by: input.requested_by });
  const planUserPrompt = `Pregunta: ${input.question}\n\nClasificación: ${JSON.stringify(classification, null, 2)}\n\nGenera el plan JSON.`;
  const planResult = await opusChat(PLAN_SYSTEM(describeRegistry(), buildBrandContext(true)), planUserPrompt, { max_tokens: 4000 });
  const plan = safeJson<ResearchPlan>(planResult.text);
  if (!plan || !Array.isArray(plan.steps)) throw new Error("Planner did not return valid plan JSON");
  // Filter out steps that reference unknown tools
  plan.steps = plan.steps.filter((s) => TOOL_REGISTRY[s.tool] !== undefined);
  if (plan.steps.length === 0) throw new Error("Planner produced no executable steps after registry filtering");
  await setBriefPlan(briefId, plan);
  return { brief_id: briefId, plan, classification };
}

export type ExecuteResult = {
  brief_id: number;
  brief: ResearchBriefBody;
  brief_markdown: string;
  quality_gate: ResearchQualityGate;
  observation_ids: number[];
  cost_usd: number;
  apify_runs: number;
  errors: unknown[];
};

export async function executeApprovedBrief(briefId: number, approvedBy: string = "system"): Promise<ExecuteResult> {
  const briefRow = await getBrief(briefId);
  if (!briefRow) throw new Error(`Brief ${briefId} not found`);
  if (briefRow.status !== "awaiting_approval" && briefRow.status !== "running") throw new Error(`Brief ${briefId} status is ${briefRow.status}, cannot execute`);
  if (briefRow.status === "awaiting_approval") await approveBriefPlan(briefId, approvedBy);

  const plan = briefRow.plan as ResearchPlan;
  const errors: unknown[] = [];
  const observationIds: number[] = [];
  let totalCost = 0;
  let apifyRuns = 0;

  // Execute steps sequentially for v1 (parallelism is a nice-to-have, defer).
  for (const step of plan.steps.sort((a, b) => a.step_number - b.step_number)) {
    const spec = TOOL_REGISTRY[step.tool];
    if (!spec) {
      errors.push({ step: step.step_number, tool: step.tool, error: "tool_not_in_registry" });
      continue;
    }
    try {
      // ALWAYS make the live call (anti-laziness rule).
      const { result, cost_usd } = await spec.executor(step.args);
      totalCost += cost_usd;
      if (step.tool.startsWith("local_") || step.tool.startsWith("social_") || step.tool.startsWith("adlib_") || step.tool.startsWith("market_") || step.tool === "web_content_crawler") apifyRuns++;

      // Delta lookup: prior observation with same args, within lookback window.
      const lookbackDays = lookbackDaysForTool(step.tool);
      const argsHash = canonicalArgsHash(step.args);
      const prior = await findPriorObservation(step.tool, argsHash, lookbackDays);
      const delta = prior ? computeDelta(prior, result) : null;

      const observationId = await persistObservation({
        tool_name: step.tool,
        args: step.args,
        result,
        cost_usd,
        brief_id: briefId,
        delta_vs_prior: delta,
        prior_observation_id: prior?.id ?? null,
      });
      observationIds.push(observationId);
    } catch (error) {
      errors.push({ step: step.step_number, tool: step.tool, error: error instanceof Error ? error.message : String(error) });
    }
  }

  // Synthesize
  const observationsForSynth = await Promise.all(
    observationIds.map(async (id) => {
      const sql = (await import("@neondatabase/serverless")).neon(process.env.DATABASE_URL!);
      const rows = await sql`select id, tool_name, args, result, delta_vs_prior, captured_at::text from seo_research_observations where id = ${id}` as Array<{ id: number; tool_name: string; args: unknown; result: unknown; delta_vs_prior: unknown; captured_at: string }>;
      return rows[0];
    })
  );
  // Trim each observation result to keep prompt manageable (cap at 3KB per result).
  const trimmedObs = observationsForSynth.map((o) => ({
    id: o.id,
    tool_name: o.tool_name,
    args: o.args,
    result_excerpt: JSON.stringify(o.result).slice(0, 3000),
    delta: o.delta_vs_prior,
    captured_at: o.captured_at,
  }));

  const synthUser = `Pregunta: ${briefRow.question}\n\nClasificación: ${JSON.stringify(briefRow.question_classification)}\n\nObservaciones (${trimmedObs.length}):\n${JSON.stringify(trimmedObs, null, 2)}\n\nGenera el brief JSON con las 7 secciones.`;
  const synthResult = await opusChat(SYNTHESIZE_SYSTEM, synthUser, { max_tokens: 16000 });
  totalCost += synthResult.cost_usd;
  const brief = safeJson<ResearchBriefBody>(synthResult.text);
  if (!brief) throw new Error("Synthesizer did not return valid JSON");

  // Quality gate (simple v1: just check that each section has at least one finding with a number)
  const gate = quickQualityGate(brief);
  const briefMd = renderBriefMarkdown(brief, briefRow.question);

  await completeBrief(briefId, {
    brief,
    brief_markdown: briefMd,
    quality_gate: gate,
    observation_ids: observationIds,
    cost_usd: totalCost,
    llm_input_tokens: synthResult.usage.input_tokens,
    llm_output_tokens: synthResult.usage.output_tokens,
    apify_runs: apifyRuns,
    errors: errors.length > 0 ? errors : undefined,
  });

  // Record the entities we touched as we go (best-effort).
  for (const ent of (briefRow.question_classification as ResearchClassification).entities) {
    await recordEntity({ entity_type: "brand", display_name: ent }).catch(() => {});
  }

  return { brief_id: briefId, brief, brief_markdown: briefMd, quality_gate: gate, observation_ids: observationIds, cost_usd: totalCost, apify_runs: apifyRuns, errors };
}

function quickQualityGate(brief: ResearchBriefBody): ResearchQualityGate {
  const allFindings = Object.values(brief).flatMap((sec) => sec?.findings ?? []);
  const hasNumbers = allFindings.some((f) => /\d/.test(f.evidence ?? "") || /\d/.test(f.claim ?? ""));
  const acknowledgesGaps = JSON.stringify(brief).toLowerCase().includes("no hay data suficiente") || JSON.stringify(brief).toLowerCase().includes("data gap");
  const avoidsGeneric = !/\b(podría|tal vez|posiblemente|quizás)\b/i.test(JSON.stringify(brief));
  const seoConnected = (brief.pauta_competitiva?.findings ?? []).some((f) => /seo|orgánico|posición|ranking/i.test(f.claim));
  const voicequotes = (brief.voz_del_cliente?.findings ?? []).some((f) => /["“]/.test(f.evidence ?? ""));

  const checklist = {
    has_literal_numbers: hasNumbers,
    acknowledges_data_gaps: acknowledgesGaps,
    avoids_generic_language: avoidsGeneric,
    seo_pauta_connected: seoConnected,
    customer_voice_quotes_literal: voicequotes,
  };
  const passedCount = Object.values(checklist).filter(Boolean).length;
  return {
    passed: passedCount >= 3,
    refinement_count: 0,
    checklist,
    notes: passedCount >= 3 ? "ok" : `quality below threshold (${passedCount}/5)`,
  };
}

// ============================================================================
// PUBLIC ENTRY POINTS
// ============================================================================

export async function startResearch(input: { question: string; parent_brief_id?: number; requested_by?: string; auto_approve?: boolean }): Promise<{ brief_id: number; plan: ResearchPlan; classification: ResearchClassification; brief?: ResearchBriefBody; brief_markdown?: string; cost_usd?: number; status: string }> {
  const planRes = await planResearch({ question: input.question, parent_brief_id: input.parent_brief_id, requested_by: input.requested_by });
  if (!input.auto_approve) {
    return { ...planRes, status: "awaiting_approval" };
  }
  const exec = await executeApprovedBrief(planRes.brief_id, input.requested_by ?? "auto_approve");
  return { ...planRes, brief: exec.brief, brief_markdown: exec.brief_markdown, cost_usd: exec.cost_usd, status: "completed" };
}

export async function approveAndExecute(briefId: number, approvedBy: string): Promise<ExecuteResult> {
  return executeApprovedBrief(briefId, approvedBy);
}
