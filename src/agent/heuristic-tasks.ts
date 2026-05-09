// Heuristic task generator: rule-based SEO tasks built from raw collector data.
// Runs BEFORE Opus in the agent pipeline. Output goes both:
//   (a) to the backlog directly (cheap, deterministic, source_type='heuristic')
//   (b) as additional context to Opus so it doesn't propose duplicates
//
// Each rule outputs a fully-formed ProposedTask with scoring already populated.
// Rules are intentionally conservative: low confidence_score when the data
// is thin so the heuristic doesn't drown the backlog with low-value tasks.

import type { ProposedTask } from "../backlog-store.js";
import { mapQueryToProgram } from "./keyword-mapper.js";

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

export function generateHeuristicTasks(payload: CollectorPayload): ProposedTask[] {
  const tasks: ProposedTask[] = [];
  const domain = payload.domain;

  // RULE 1: Quick wins (pos 4-10, 100+ impressions, CTR < 0.03)
  const quickWins = (payload.gsc_opportunities ?? [])
    .filter((o) => o.position >= 4 && o.position <= 10 && o.impressions >= 100 && o.ctr < 0.03)
    .sort((a, b) => b.opportunity_score - a.opportunity_score)
    .slice(0, 5);
  for (const qw of quickWins) {
    const mapping = qw.mapping;
    const targetPage = mapping?.primary_program_path ?? qw.page;
    const wrongPage = qw.page !== targetPage && targetPage !== null;
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
      intencion: mapping?.intent === "branded" ? "branded" : mapping?.intent === "informational" ? "informacional" : mapping?.intent === "commercial" ? "comercial" : mapping?.intent === "transactional" ? "comercial" : null,
    });
  }

  // RULE 2: Top losers in 60d window with sustained drop
  const topLosers = (payload.gsc_movers_60d?.losers ?? [])
    .filter((l) => l.delta <= -50 && l.clicks_current >= 0)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, 3);
  for (const loser of topLosers) {
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
    });
  }

  // RULE 3: Toxic backlinks anchors
  if (payload.backlinks_anchors && payload.backlinks_anchors.length > 0) {
    const spamAnchors = payload.backlinks_anchors.filter((a) => isSpamAnchor(a.anchor));
    const totalSpamBacklinks = spamAnchors.reduce((acc, a) => acc + Number(a.backlinks ?? 0), 0);
    if (spamAnchors.length >= 1 && totalSpamBacklinks >= 20) {
      tasks.push({
        signature_key: `heuristic::disavow::${domain}`,
        title: `Disavow ${totalSpamBacklinks} backlinks tóxicos en ${domain}`,
        description: `Generar archivo disavow.txt incluyendo los ${spamAnchors.length} anchor patterns spammy detectados (${spamAnchors.slice(0, 3).map((a) => `'${a.anchor}'`).join(", ")}${spamAnchors.length > 3 ? "…" : ""}). Subir a Google Search Console.`,
        domain,
        category: "link-building",
        priority: totalSpamBacklinks > 50 ? "alta" : "media",
        impact_score: Math.min(90, 40 + Math.round(totalSpamBacklinks / 5)),
        difficulty_score: 15,
        confidence_score: 90,
        impact_expected: `Mitigar riesgo de penalización Penguin algorítmica; proteger rankings actuales`,
        rationale: `${spamAnchors.length} anchors detectados como spam (Telegram, SEO_*, etc.) con ${totalSpamBacklinks} backlinks combinados. Spam score del dominio: ${payload.backlinks?.spam_score ?? "?"}.`,
        data_sources: { sources: ["backlinks"], evidence: { spam_anchors: spamAnchors.slice(0, 10), total_spam_backlinks: totalSpamBacklinks, domain_spam_score: payload.backlinks?.spam_score ?? null } },
        source_type: "heuristic",
        assignee_suggested: "linkbuilder",
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

  // RULE 9: Traffic exists but no conversion events from organic landing pages
  if (ga4 && ga4.configured && ga4.by_landing_page.length > 0) {
    const trafficZeroConv = ga4.by_landing_page
      .filter((lp) => lp.sessions >= 50 && lp.conversions === 0)
      .slice(0, 3);
    for (const lp of trafficZeroConv) {
      tasks.push({
        signature_key: `heuristic::no_conv_lp::${lp.landing_page}`.slice(0, 80),
        title: `Revisar CTAs en ${lp.landing_page} (${lp.sessions} sesiones / 0 conversiones)`,
        description: `Esta landing page recibió ${lp.sessions} sesiones orgánicas en los últimos 28 días pero registró 0 conversiones (WhatsApp/formulario/llamada). Revisar: presencia de CTA visible, claridad del mensaje, alineación con la query de entrada, UX. Proponer ajustes específicos.`,
        domain,
        category: "on-page",
        priority: lp.sessions >= 200 ? "alta" : "media",
        impact_score: Math.min(70, 30 + Math.round(lp.sessions / 10)),
        difficulty_score: 35,
        confidence_score: 80,
        impact_expected: `Si CTR a CTA pasa de 0% a 2-5%, generaría ~${Math.round(lp.sessions * 0.03)} conversiones/mes adicionales`,
        rationale: `GA4 reporta ${lp.sessions} sesiones orgánicas en ${lp.landing_page} sin ninguna conversión registrada (eventos clave 0). Indica fricción de CTA o desalineación intent/contenido.`,
        data_sources: { sources: ["ga4"], evidence: { landing_page: lp.landing_page, sessions: lp.sessions, conversions: 0 } },
        source_type: "heuristic",
        assignee_suggested: "designer",
      });
    }
  }

  return tasks;
}
