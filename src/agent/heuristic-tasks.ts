// Heuristic task generator: rule-based SEO tasks built from raw collector data.
// Runs BEFORE Opus in the agent pipeline. Output goes both:
//   (a) to the backlog directly (cheap, deterministic, source_type='heuristic')
//   (b) as additional context to Opus so it doesn't propose duplicates
//
// Each rule outputs a fully-formed ProposedTask with scoring already populated.
// Rules are intentionally conservative: low confidence_score when the data
// is thin so the heuristic doesn't drown the backlog with low-value tasks.

import type { ProposedTask } from "../backlog-store.js";
import { mapQueryToProgram, isNavegacional } from "./keyword-mapper.js";
import { classifyQ10 } from "./q10-classifier.js";

export type CollectorPayload = {
  domain: string;
  country: "co" | "mx";
  uses_dna_catalog: boolean;
  gsc_opportunities: Array<{
    query: string; page: string; clicks: number; impressions: number;
    ctr: number; position: number; opportunity_score: number;
    mapping?: ReturnType<typeof mapQueryToProgram>;
  }>;
  gsc_movers_60d: {
    gainers: Array<{ query: string; clicks_current: number; clicks_prior: number; delta: number; mapping?: ReturnType<typeof mapQueryToProgram> }>;
    losers: Array<{ query: string; clicks_current: number; clicks_prior: number; delta: number; mapping?: ReturnType<typeof mapQueryToProgram> }>;
  };
  backlinks: { total_backlinks?: number | null; referring_domains?: number | null; spam_score?: number | null; broken_backlinks?: number | null } | null;
  backlinks_anchors: Array<{ anchor: string; backlinks: number; spam_score?: number }> | null;
  rankings_snapshot: { top3?: number; top10?: number; total_tracked?: number } | null;
  llm_visibility: Array<{ platform: string; mentions_count: number | null }>;
  traffic_trend_28d: { gsc: Array<{ date: string; clicks: number | null; impressions: number | null }>; ga4: Array<{ date: string; sessions: number | null }> };
  sitemaps: unknown;
  ga4_conversions?: {
    configured: boolean;
    total_events_28d: number;
    total_seo_conversions_28d: number;
    events: Array<{ name: string; count: number; is_seo_conversion_proxy: boolean }>;
    by_landing_page: Array<{ landing_page: string; sessions: number; conversions: number }>;
  };
};

const SPAM_ANCHOR_PATTERNS = [
  /telegram/i, /@SEO_/i, /@BHS_/i, /skyrocket/i, /buyseolink/i, /seoboost/i, /ahrefs.+DR/i, /BHS_LINKS/i, /darksidelinks/i,
];

function isSpamAnchor(anchor: string): boolean {
  return SPAM_ANCHOR_PATTERNS.some((p) => p.test(anchor));
}

// Queries demasiado genéricas/ambiguas que NO deben dominar el backlog sin
// validación humana. Matches por longitud + lista negra de tokens comunes.
const AMBIGUOUS_TOKENS = new Set([
  "dna", "music", "audio", "q10", "tienda", "escuela", "curso", "academia",
  "song", "songs", "djs", "dj", "beat", "mix", "mp3", "songwriting",
]);

export function isAmbiguousQuery(query: string): boolean {
  const trimmed = query.trim().toLowerCase();
  if (trimmed.length <= 3) return true;
  const tokens = trimmed.split(/\s+/);
  if (tokens.length === 1 && AMBIGUOUS_TOKENS.has(tokens[0])) return true;
  // 2 tokens donde ambos son ambiguos también sospechosos (ej. "dna music")
  // pero "dna music" es brand legítima — pasa solo si TODOS son ambiguos genéricos
  // no específicos a la marca.
  return false;
}

export function generateHeuristicTasks(payload: CollectorPayload): ProposedTask[] {
  const tasks: ProposedTask[] = [];
  const domain = payload.domain;

  // RULE 1: Quick wins (pos 4-10, 100+ impressions, CTR < 0.03)
  const quickWins = (payload.gsc_opportunities ?? [])
    .filter((o) => o.position >= 4 && o.position <= 10 && o.impressions >= 100 && o.ctr < 0.03)
    .sort((a, b) => b.opportunity_score - a.opportunity_score)
    .slice(0, 8); // ampliamos para que tras filtrar ambigüedad queden suficientes
  for (const qw of quickWins) {
    const mapping = qw.mapping;
    const targetPage = mapping?.primary_program_path ?? qw.page;
    const wrongPage = qw.page !== targetPage && targetPage !== null;
    const ambiguous = isAmbiguousQuery(qw.query);
    const q10 = classifyQ10(qw.query);

    // Q10 override BEFORE quick-win logic: never propose commercial CTR
    // optimization for navegacional Q10 queries.
    if (q10) {
      tasks.push({
        signature_key: `heuristic::q10_visibility::${qw.query}`.slice(0, 80),
        title: `Recuperar visibilidad de portal Q10 para '${qw.query}' (pos ${qw.position.toFixed(1)})`,
        description: `Query branded/navegacional de estudiantes actuales (${qw.impressions} impresiones, ${qw.clicks} clicks, pos ${qw.position.toFixed(1)}). Auditar la página de acceso (${q10.recommended_page_paths[0]}): que rankee correctamente para 'Q10', meta title con 'Acceso portal estudiantes DNA Music', canonical limpio, no redirects post-migración rotos. Mantener la pagina enfocada en acceso al portal — el éxito se mide en clicks branded recuperados.`,
        domain,
        category: "migracion",
        priority: qw.opportunity_score > 1500 ? "alta" : "media",
        impact_score: Math.min(80, Math.round(40 + qw.opportunity_score / 100)),
        difficulty_score: 25,
        confidence_score: 85,
        impact_expected: `Recuperar ~${Math.round(qw.impressions * 0.04 - qw.clicks)} clicks branded/mes hacia el portal. Audiencia ya enrolada — el resultado se mide solo en clicks branded recuperados, no en metricas de captura.`,
        rationale: `Q10 navegacional '${qw.query}' (${qw.impressions} impresiones, CTR ${(qw.ctr * 100).toFixed(2)}%, pos ${qw.position.toFixed(1)}). Tráfico de estudiantes actuales buscando portal — NO captación comercial.`,
        data_sources: { sources: ["gsc"], evidence: { query: qw.query, page: qw.page, position: qw.position, impressions: qw.impressions, clicks: qw.clicks, ctr: qw.ctr, q10_classification: q10 } },
        source_type: "heuristic",
        assignee_suggested: "dev",
        intencion: "navegacional",
        programa_relacionado: null,
        materia_relacionada: null,
        sede_relacionada: q10.sede_related,
        action_type: "audit",
        risk_level: "low",
        requires_human_review: false,
        audience: "estudiantes_actuales",
        funnel_stage: "soporte_acceso",
        conversion_expected: "no_aplica",
        business_goal: q10.business_goal,
      });
      continue;
    }

    if (ambiguous) {
      // Las queries ambiguas no entran como quick win directo. Se proponen como
      // tareas de AUDITORÍA con confianza baja y no priorizadas.
      tasks.push({
        signature_key: `heuristic::audit_ambiguous_query::${qw.query}`.slice(0, 80),
        title: `Auditar query ambigua '${qw.query}' antes de optimizar (pos ${qw.position.toFixed(1)})`,
        description: `La query '${qw.query}' tiene ${qw.impressions} impresiones en posición ${qw.position.toFixed(1)} pero es demasiado corta o genérica para asumir intención. Revisar SERP actual con serp_google_organic_live, validar si las impresiones provienen de la marca DNA Music o de búsquedas no relacionadas (genética, etc.), y decidir si vale optimizar la página actual ${qw.page}.`,
        domain,
        category: "ctr",
        priority: "baja",
        impact_score: 35,
        difficulty_score: 15,
        confidence_score: 50,
        impact_expected: `Sin estimación: depende de si las impresiones son de la marca o noise.`,
        rationale: `Query '${qw.query}' marcada como ambigua (longitud ${qw.query.length} o token genérico). NO debe entrar como quick win automático. ${qw.impressions} impresiones, CTR ${(qw.ctr * 100).toFixed(2)}%.`,
        data_sources: { sources: ["gsc"], evidence: { query: qw.query, ambiguous: true, position: qw.position, impressions: qw.impressions, clicks: qw.clicks, ctr: qw.ctr } },
        source_type: "heuristic",
        assignee_suggested: "SEO",
        programa_relacionado: mapping?.primary_program_slug ?? null,
        materia_relacionada: mapping?.matched_materia ?? null,
        sede_relacionada: mapping?.matched_sede ?? null,
        intencion: "ambiguous",
        action_type: "audit",
        risk_level: "low",
        requires_human_review: true,
      });
      continue;
    }

    tasks.push({
      signature_key: `heuristic::ctr_quick_win::${qw.query}`.slice(0, 80),
      title: `CTR quick win: '${qw.query}' (pos ${qw.position.toFixed(1)})`,
      description: wrongPage
        ? `Reescribir meta title + description en ${targetPage} para capturar la query '${qw.query}'. Mover el targeting desde ${qw.page} (página actual rankeando) hacia la página correcta del catálogo. CTR actual ${(qw.ctr * 100).toFixed(2)}% sobre ${qw.impressions} impresiones.`
        : `Reescribir meta title + meta description de ${qw.page} para incluir la query '${qw.query}' explícita. CTR actual ${(qw.ctr * 100).toFixed(2)}% sobre ${qw.impressions} impresiones; objetivo subir a 5-8%.`,
      domain,
      category: "ctr",
      priority: qw.opportunity_score > 1500 ? "alta" : "media",
      impact_score: Math.min(95, Math.round(40 + qw.opportunity_score / 100)),
      difficulty_score: 20,
      confidence_score: 85,
      impact_expected: `Recuperar ~${Math.round(qw.impressions * 0.04 - qw.clicks)} clicks/mes si el CTR pasa de ${(qw.ctr * 100).toFixed(1)}% a ~5%`,
      rationale: `GSC reporta query '${qw.query}' en posición ${qw.position.toFixed(1)} con ${qw.impressions} impresiones y solo ${qw.clicks} clicks (CTR ${(qw.ctr * 100).toFixed(2)}%). Opportunity score ${qw.opportunity_score.toFixed(0)}.${mapping ? ` Mapper sugiere página '${targetPage}'.` : ""}`,
      data_sources: {
        sources: ["gsc"],
        evidence: { query: qw.query, page: qw.page, position: qw.position, impressions: qw.impressions, clicks: qw.clicks, ctr: qw.ctr, opportunity_score: qw.opportunity_score, mapping: mapping ?? null },
      },
      source_type: "heuristic",
      assignee_suggested: "copywriter",
      programa_relacionado: mapping?.primary_program_slug ?? null,
      materia_relacionada: mapping?.matched_materia ?? null,
      sede_relacionada: mapping?.matched_sede ?? null,
      intencion: mapping?.intent === "branded" ? "branded" : mapping?.intent === "navigational" ? "navegacional" : mapping?.intent === "informational" ? "informacional" : mapping?.intent === "commercial" ? "comercial" : mapping?.intent === "transactional" ? "comercial" : null,
      action_type: "execution",
      risk_level: "low",
      requires_human_review: false,
    });
    if (tasks.filter((t) => t.signature_key.startsWith("heuristic::ctr_quick_win::")).length >= 5) break;
  }

  // RULE 2: Top losers in 60d window with sustained drop
  const topLosers = (payload.gsc_movers_60d?.losers ?? [])
    .filter((l) => l.delta <= -50 && l.clicks_current >= 0)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, 3);
  for (const loser of topLosers) {
    const q10 = classifyQ10(loser.query);
    if (q10) {
      tasks.push({
        signature_key: `heuristic::q10_recovery::${loser.query}`.slice(0, 80),
        title: `Recuperar visibilidad de portal Q10 para '${loser.query}' (perdió ${Math.abs(loser.delta)} clicks)`,
        description: `Tráfico branded/navegacional de estudiantes actuales que buscan acceder al portal académico. Auditar la página de acceso (sugerida ${q10.recommended_page_paths[0]}): title con 'Q10' explícito, meta description que diga "Acceso portal estudiantes DNA Music", indexación, canonical, redirects post-migración, sitemap. Mantener la pagina enfocada en acceso al portal (es navegacional). El éxito se mide en clicks branded recuperados. Objetivo: reducir fricción de acceso y proteger tráfico branded.`,
        domain,
        category: "migracion",
        priority: Math.abs(loser.delta) > 200 ? "alta" : "media",
        impact_score: Math.min(85, Math.round(45 + Math.abs(loser.delta) / 8)),
        difficulty_score: 25,
        confidence_score: 90,
        impact_expected: `Restablecer ~${Math.abs(loser.delta)} clicks/mes de estudiantes actuales hacia el portal de acceso. Reduce tickets de soporte y protege reputación branded. La audiencia ya está enrolada — el resultado se mide solo en clicks branded recuperados.`,
        rationale: `Query Q10 navegacional '${loser.query}' cayó ${loser.delta} clicks (de ${loser.clicks_prior} a ${loser.clicks_current}). Q10 es el portal académico — estudiantes actuales, NO captación.`,
        data_sources: { sources: ["gsc"], evidence: { query: loser.query, delta: loser.delta, clicks_current: loser.clicks_current, clicks_prior: loser.clicks_prior, q10_classification: q10 } },
        source_type: "heuristic",
        assignee_suggested: "dev",
        intencion: "navegacional",
        programa_relacionado: null,
        materia_relacionada: null,
        sede_relacionada: q10.sede_related,
        action_type: "audit",
        risk_level: "medium",
        requires_human_review: false,
        audience: "estudiantes_actuales",
        funnel_stage: "soporte_acceso",
        conversion_expected: "no_aplica",
        business_goal: q10.business_goal,
      });
      continue;
    }

    tasks.push({
      signature_key: `heuristic::lost_traffic::${loser.query}`.slice(0, 80),
      title: `Auditar caída de '${loser.query}' (${loser.delta} clicks vs 30d previos)`,
      description: `Verificar status de la página principal que rankea para '${loser.query}': cambios de URL, redirecciones, contenido eliminado, schema roto. Comparar SERP actual vs hace 60 días. Reportar plan de recuperación.`,
      domain,
      category: "technical",
      priority: Math.abs(loser.delta) > 200 ? "alta" : "media",
      impact_score: Math.min(95, Math.round(50 + Math.abs(loser.delta) / 5)),
      difficulty_score: 35,
      confidence_score: 80,
      impact_expected: `Recuperar parcial o totalmente ${Math.abs(loser.delta)} clicks/mes perdidos`,
      rationale: `Query '${loser.query}' cayó ${loser.delta} clicks comparando los últimos 30 días vs los 30 anteriores (de ${loser.clicks_prior} a ${loser.clicks_current}). Patrón sugiere problema técnico o cambio de SERP.`,
      data_sources: { sources: ["gsc"], evidence: { query: loser.query, delta: loser.delta, clicks_current: loser.clicks_current, clicks_prior: loser.clicks_prior } },
      source_type: "heuristic",
      assignee_suggested: "SEO",
      action_type: "audit",
      risk_level: "medium",
      requires_human_review: false,
    });
  }

  // RULE 3: Toxic backlinks anchors → AUDIT (no disavow directo)
  // GUARDRAIL: solo tenemos datos a nivel anchor agregado, NO a nivel backlink
  // individual (source_url, target_url, ASN, first_seen, link_type, rel, etc).
  // Disavow ejecutivo NUNCA debe proponerse desde aquí. Solo auditoría.
  if (payload.backlinks_anchors && payload.backlinks_anchors.length > 0) {
    const spamAnchors = payload.backlinks_anchors.filter((a) => isSpamAnchor(a.anchor));
    const totalSpamBacklinks = spamAnchors.reduce((acc, a) => acc + Number(a.backlinks ?? 0), 0);
    if (spamAnchors.length >= 1 && totalSpamBacklinks >= 20) {
      tasks.push({
        signature_key: `heuristic::audit_anchors::${domain}`,
        title: `Investigar señal de sospecha en backlinks (anchors patrón spam, ${totalSpamBacklinks} enlaces)`,
        description: `IMPORTANTE: esto NO es un diagnóstico de toxicidad. Es solo una señal de sospecha basada en patterns de anchor agregados — NO podemos saber si los backlinks deben desautorizarse sin evidencia granular URL por URL. Detectados ${spamAnchors.length} anchor patterns que coinciden con servicios SEO black-hat conocidos (${spamAnchors.slice(0, 3).map((a) => `'${a.anchor}'`).join(", ")}${spamAnchors.length > 3 ? "…" : ""}) con ~${totalSpamBacklinks} backlinks asociados. Antes de cualquier acción: pedir a DataForSEO la lista granular (backlinks_list endpoint) y para CADA backlink documentar source_url + target_url + anchor_text + spam_score INDIVIDUAL + país/IP/ASN del origen + first_seen + link_type + rel. Solo después de revisar humana la lista granular y correlacionar con drops SEO específicos se puede decidir si vale un disavow quirúrgico. Google es claro: disavow mal usado puede dañar más que ayudar.`,
        domain,
        category: "link-building",
        priority: "media",
        impact_score: Math.min(60, 25 + Math.round(totalSpamBacklinks / 15)),
        difficulty_score: 35,
        confidence_score: 50, // baja: es solo señal, no diagnóstico
        impact_expected: `Sin acción directa. Si la investigación granular confirma backlinks individuales tóxicos correlacionados con un drop SEO real, podría abrir un disavow quirúrgico futuro. Sin esa investigación: NINGÚN impacto SEO esperado.`,
        rationale: `Señal de sospecha: ${spamAnchors.length} anchors agregados coinciden con patterns spam (Telegram/SEO_*/etc.) sumando ~${totalSpamBacklinks} backlinks. Spam_score agregado del dominio: ${payload.backlinks?.spam_score ?? "?"}. NO es un diagnóstico — datos solo a nivel anchor, sin evidencia backlink-level (source_url, ASN, first_seen, etc.).`,
        data_sources: { sources: ["backlinks"], evidence: { spam_anchors: spamAnchors.slice(0, 10), total_spam_backlinks: totalSpamBacklinks, domain_spam_score: payload.backlinks?.spam_score ?? null, granularity_available: "anchor_level_only", granularity_required_for_execution: "individual_backlinks_with_source_url_and_metadata", note: "no_es_diagnostico_es_senal_de_sospecha" } },
        source_type: "heuristic",
        assignee_suggested: "linkbuilder",
        action_type: "audit_backlinks",
        risk_level: "high",
        requires_human_review: true,
      });
    }
  }

  // RULE 4: No GSC data at all → setup task (typical for new sites like dnamusic.mx)
  const hasNoGsc = (payload.gsc_opportunities?.length ?? 0) === 0
    && (payload.gsc_movers_60d?.gainers?.length ?? 0) === 0
    && (payload.gsc_movers_60d?.losers?.length ?? 0) === 0;
  const hasNoTraffic = (payload.traffic_trend_28d?.gsc?.length ?? 0) === 0
    && (payload.traffic_trend_28d?.ga4?.length ?? 0) === 0;
  if (hasNoGsc && hasNoTraffic) {
    tasks.push({
      signature_key: `heuristic::setup_indexing::${domain}`,
      title: `Setup base de medición e indexación para ${domain}`,
      description: `Verificar GSC property activa, GA4 conectado, sitemap.xml accesible y enviado, robots.txt sin Disallow:/, ejecutar site:${domain} y solicitar indexación de homepage. Establecer baseline de medición.`,
      domain,
      category: "indexacion",
      priority: "alta",
      impact_score: 95,
      difficulty_score: 25,
      confidence_score: 95,
      impact_expected: `Habilitar tracking y comenzar indexación (base para cualquier estrategia SEO)`,
      rationale: `${domain} sin datos GSC, sin tráfico GA4, sin opportunities. Bloqueador crítico antes de cualquier otra acción SEO.`,
      data_sources: { sources: ["gsc", "ga4", "rankings"], evidence: { gsc_opportunities_count: 0, traffic_28d_rows: 0 } },
      source_type: "heuristic",
      assignee_suggested: "SEO",
    });
  }

  // RULE 5: Broken backlinks acumulados
  if (payload.backlinks?.broken_backlinks && payload.backlinks.broken_backlinks >= 30) {
    tasks.push({
      signature_key: `heuristic::broken_backlinks::${domain}`,
      title: `Recuperar ${payload.backlinks.broken_backlinks} broken backlinks en ${domain}`,
      description: `Listar los broken backlinks (URL externa → URL rota interna). Implementar redirects 301 desde las URLs rotas a páginas relevantes vivas. Priorizar las URLs origen con mayor autoridad.`,
      domain,
      category: "link-building",
      priority: payload.backlinks.broken_backlinks > 100 ? "alta" : "media",
      impact_score: Math.min(70, 25 + Math.round(payload.backlinks.broken_backlinks / 10)),
      difficulty_score: 30,
      confidence_score: 75,
      impact_expected: `Recuperar autoridad (link equity) de ~${payload.backlinks.broken_backlinks} backlinks externos perdidos por 404`,
      rationale: `DataForSEO Backlinks reporta ${payload.backlinks.broken_backlinks} backlinks rotos apuntando a URLs 404 internas. Cada uno es link equity perdido recuperable con 301.`,
      data_sources: { sources: ["backlinks"], evidence: { broken_backlinks: payload.backlinks.broken_backlinks, total_backlinks: payload.backlinks.total_backlinks } },
      source_type: "heuristic",
      assignee_suggested: "dev",
    });
  }

  // RULE 6: 0 mentions in LLMs (priority depends on whether competitors are mentioned)
  const llmMentions = payload.llm_visibility ?? [];
  const hasNoLlmPresence = llmMentions.length === 0 || llmMentions.every((r) => (r.mentions_count ?? 0) === 0);
  if (hasNoLlmPresence) {
    tasks.push({
      signature_key: `heuristic::llm_no_presence::${domain}`,
      title: `Construir presencia LLM para ${domain}`,
      description: `Publicar contenido autoritativo (FAQ schema, About, JSON-LD Organization) que ChatGPT y Google AI Overview puedan citar. Solicitar listings en Wikipedia/sitios de autoridad. Verificar respuesta de cada LLM con prompts del nicho.`,
      domain,
      category: "llm-visibility",
      priority: "media",
      impact_score: 55,
      difficulty_score: 50,
      confidence_score: 60,
      impact_expected: `Aparecer como citación en al menos 1 LLM principal (ChatGPT, Google AI, Perplexity) en 60-90 días`,
      rationale: `0 mentions registradas en seo_llm_visibility. Sin presencia AI, el dominio queda invisible al ~30% de queries informacionales que ya pasan por LLMs.`,
      data_sources: { sources: ["llm"], evidence: { llm_visibility_rows: llmMentions } },
      source_type: "heuristic",
      assignee_suggested: "SEO",
    });
  }

  // RULE 7: Migration audit if 3+ losers with significant drop in 60d window
  // Treat as POST-MIGRATION damage signal: cluster of queries lost on the same site.
  const significantLosers = (payload.gsc_movers_60d?.losers ?? []).filter((l) => l.delta <= -50);
  if (significantLosers.length >= 3) {
    const totalLost = significantLosers.reduce((acc, l) => acc + Math.abs(l.delta), 0);
    const sampleQueries = significantLosers.slice(0, 5).map((l) => `'${l.query}' (${l.delta})`).join(", ");
    tasks.push({
      signature_key: `heuristic::migration_audit::${domain}`,
      title: `Auditoría post-migración: ${significantLosers.length} queries con caída fuerte (~${totalLost} clicks/mes)`,
      description: `Para cada query con caída, identificar la URL que rankeaba antes y comparar con la URL que rankea ahora. Verificar redirects 301, canonical correctos, equivalencia de contenido. Especial atención a: ${sampleQueries}. Listar las URLs afectadas y proponer plan de recuperación.`,
      domain,
      category: "migracion",
      priority: "alta",
      impact_score: Math.min(95, 60 + Math.round(totalLost / 50)),
      difficulty_score: 45,
      confidence_score: 80,
      impact_expected: `Recuperar parcial o totalmente ~${totalLost} clicks/mes perdidos en queries afectadas por la migración`,
      rationale: `${significantLosers.length} queries con drop simultáneo de >50 clicks cada una sugieren impacto sistémico (cambios de URL, sitemap incompleto, redirects rotos). Patrón típico post-migración.`,
      data_sources: { sources: ["gsc"], evidence: { losers_count: significantLosers.length, total_lost_clicks: totalLost, sample_queries: significantLosers.slice(0, 10) } },
      source_type: "heuristic",
      assignee_suggested: "SEO",
    });
  }

  // RULE 8: GA4 has no SEO conversion events configured -> propose configuration task.
  const ga4 = payload.ga4_conversions;
  if (ga4 && ga4.configured && ga4.total_seo_conversions_28d === 0 && ga4.events.length > 0) {
    tasks.push({
      signature_key: `heuristic::ga4_seo_events::${domain}`,
      title: `Configurar eventos GA4 de conversión web (WhatsApp, formularios, llamadas)`,
      description: `GA4 está conectado pero no tiene eventos marcados como key_event para WhatsApp clicks, formularios diligenciados, clicks en llamada o agendamientos. Crear los eventos en GA4 → Events → Create event, marcarlos como key_event, esperar 24-48h para datos, y volver a evaluar tareas con conversión web.`,
      domain,
      category: "tecnico",
      priority: "alta",
      impact_score: 80,
      difficulty_score: 25,
      confidence_score: 95,
      impact_expected: `Habilitar medición de conversión web SEO. Sin esto, todo el trabajo SEO queda sin atribución de impacto comercial.`,
      rationale: `GA4 ${domain}: ${ga4.total_events_28d} eventos totales (28d), 0 marcados como conversión SEO web (whatsapp/form/call/scheduling). El equipo no puede medir si el SEO está generando leads.`,
      data_sources: { sources: ["ga4"], evidence: { events_28d: ga4.total_events_28d, seo_conversions_28d: ga4.total_seo_conversions_28d, top_event_names: ga4.events.slice(0, 10).map((e) => e.name) } },
      source_type: "heuristic",
      assignee_suggested: "ops",
    });
  }

  // RULE 10: GSC vs GA4 discrepancy — if GSC reports many organic clicks but
  // GA4 organic sessions are <20% of that, the measurement is broken (tag missing,
  // consent banner, cross-domain, redirect dropping the cookie, wrong property
  // mapped, etc). Without trustworthy GA4 the rest of the conversion analysis
  // is blind, so this is high priority.
  const gscTrend = payload.traffic_trend_28d?.gsc ?? [];
  const ga4Trend = payload.traffic_trend_28d?.ga4 ?? [];
  if (gscTrend.length > 0 && ga4Trend.length > 0) {
    const gscClicks28 = gscTrend.reduce((acc, d) => acc + Number(d.clicks ?? 0), 0);
    const ga4Sessions28 = ga4Trend.reduce((acc, d) => acc + Number((d as { sessions?: number | null }).sessions ?? 0), 0);
    const ratio = gscClicks28 > 0 ? ga4Sessions28 / gscClicks28 : 1;
    if (gscClicks28 >= 100 && (ratio < 0.20 || gscClicks28 / Math.max(ga4Sessions28, 1) > 5)) {
      tasks.push({
        signature_key: `heuristic::ga4_gsc_discrepancy::${domain}`,
        title: `Auditar discrepancia GSC vs GA4: ${gscClicks28} clicks GSC vs ${ga4Sessions28} sesiones GA4 (28d)`,
        description: `GSC reporta ${gscClicks28} clicks orgánicos en 28 días pero GA4 solo ${ga4Sessions28} sesiones — ratio ${(ratio * 100).toFixed(1)}%. Sin GA4 confiable el agente queda parcialmente ciego para analizar conversión SEO. Auditar (1) instalación del tag GA4 en TODAS las landing pages orgánicas top, (2) GTM y trigger del tag, (3) cookie banner / consent mode bloqueando medición, (4) cross-domain entre www y dominio raíz / portal-estudiantes, (5) redirects que pierden cookie/UTM, (6) filtros de tráfico interno en GA4, (7) fechas y zona horaria, (8) si la property GA4 está midiendo el dominio correcto. Documentar hallazgos antes de hablar de conversión SEO.`,
        domain,
        category: "tecnico",
        priority: "alta",
        impact_score: 90,
        difficulty_score: 45,
        confidence_score: 95, // datos numéricos directos
        impact_expected: `Restablecer medición confiable de conversión web SEO. Sin esto, todas las tareas con "impacto en conversión" tienen baja confianza.`,
        rationale: `GSC=${gscClicks28} clicks vs GA4=${ga4Sessions28} sesiones (28d). Ratio ${(ratio * 100).toFixed(1)}%. Discrepancia >5x indica medición rota — probablemente tag missing en algunas pages, consent banner, cross-domain o cambio de property post-migración.`,
        data_sources: { sources: ["gsc", "ga4"], evidence: { gsc_clicks_28d: gscClicks28, ga4_sessions_28d: ga4Sessions28, ratio_ga4_over_gsc: ratio, days: 28 } },
        source_type: "heuristic",
        assignee_suggested: "dev",
        action_type: "audit",
        risk_level: "medium",
        requires_human_review: false,
      });
    }
  }

  // RULE 9: Traffic exists but no conversion events from organic landing pages.
  // IMPORTANT: if GA4 has zero conversion events configured, "0 conversions" is
  // not a real signal — it just means we are not measuring. In that case we
  // declare a dependency on the ga4_seo_events config task so this task auto-
  // blocks until measurement is fixed.
  if (ga4 && ga4.configured && ga4.by_landing_page.length > 0) {
    const measurementBroken = ga4.total_seo_conversions_28d === 0;
    const trafficZeroConv = ga4.by_landing_page
      .filter((lp) => lp.sessions >= 50 && lp.conversions === 0)
      .slice(0, 3);
    for (const lp of trafficZeroConv) {
      tasks.push({
        signature_key: `heuristic::no_conv_lp::${lp.landing_page}`.slice(0, 80),
        title: `Revisar CTAs en ${lp.landing_page} (${lp.sessions} sesiones / 0 conversiones${measurementBroken ? ' [medicion sin verificar]' : ''})`,
        description: measurementBroken
          ? `Esta landing page recibio ${lp.sessions} sesiones organicas en 28 dias pero GA4 muestra 0 conversiones. CRITICO: la medicion de eventos SEO no esta configurada todavia, asi que el "0 conversiones" no es un signal valido. Esta tarea queda BLOQUEADA hasta que la tarea "Configurar eventos GA4 de conversion web" este ejecutada y haya datos reales que validar.`
          : `Esta landing page recibio ${lp.sessions} sesiones organicas en los ultimos 28 dias pero registro 0 conversiones (WhatsApp/formulario/llamada). Revisar: presencia de CTA visible, claridad del mensaje, alineacion con la query de entrada, UX. Proponer ajustes especificos.`,
        domain,
        category: "on-page",
        priority: lp.sessions >= 200 ? "alta" : "media",
        impact_score: Math.min(70, 30 + Math.round(lp.sessions / 10)),
        difficulty_score: 35,
        confidence_score: measurementBroken ? 40 : 80,
        impact_expected: `Si CTR a CTA pasa de 0% a 2-5%, generaria ~${Math.round(lp.sessions * 0.03)} eventos/mes adicionales (asumiendo medicion valida).`,
        rationale: measurementBroken
          ? `GA4 reporta ${lp.sessions} sesiones organicas en ${lp.landing_page} con 0 conversiones, pero el sistema NO tiene eventos SEO configurados. Sin medicion confiable, no podemos diagnosticar friccion de CTA. Tarea bloqueada por dependencia.`
          : `GA4 reporta ${lp.sessions} sesiones organicas en ${lp.landing_page} sin ninguna conversion registrada (eventos clave 0). Indica friccion de CTA o desalineacion intent/contenido.`,
        data_sources: { sources: ["ga4"], evidence: { landing_page: lp.landing_page, sessions: lp.sessions, conversions: 0, ga4_events_total_28d: ga4.total_events_28d, ga4_seo_conversions_28d: ga4.total_seo_conversions_28d, measurement_broken: measurementBroken } },
        source_type: "heuristic",
        assignee_suggested: measurementBroken ? "ops" : "designer",
        action_type: measurementBroken ? "audit" : "execution",
        risk_level: "low",
        requires_human_review: false,
        // If measurement is broken, declare a dependency on the GA4 config task.
        // The blocked_by resolver will look up by signature key fragment.
        blocked_by_signature_keys: measurementBroken ? [`ga4_seo_events::${domain}`] : null,
        blocked_reason: measurementBroken ? "Depende de configuracion de eventos GA4 (medicion SEO sin verificar)" : null,
      });
    }
  }

  return tasks;
}
