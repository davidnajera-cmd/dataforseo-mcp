import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

function formatResult(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

type Step = { call: string; args: Record<string, unknown>; why: string };
type Playbook = { name: string; description: string; expected_minutes: number; cost_estimate_usd: number; steps: Step[]; synthesis_guidance: string };

const PLAYBOOKS: Record<string, Playbook> = {
  "360_audit": {
    name: "360_audit",
    description: "Full real-time SEO audit of one site. Combines GSC search analytics, rankings, backlinks, technical, UX, AI visibility, history, and brand catalog. Use this when the user asks for a 'situación SEO completa' or 'estado actual'.",
    expected_minutes: 3,
    cost_estimate_usd: 0.50,
    steps: [
      { call: "gsc_site_health_report", args: { site_url: "https://dnamusic.edu.co/", days: 28 }, why: "Snapshot ejecutivo: clicks/impr/CTR/posición + top queries/pages + breakdown país/dispositivo + sitemaps." },
      { call: "gsc_keyword_opportunities", args: { site_url: "https://dnamusic.edu.co/", start_date: "<28-days-ago>", end_date: "<today>" }, why: "Quick wins: queries en pos 4-20 con score impressions×(1-CTR)×(pos-1)." },
      { call: "gsc_search_analytics_compare", args: { site_url: "https://dnamusic.edu.co/", current_start: "<30-days-ago>", current_end: "<today>", prior_start: "<60-days-ago>", prior_end: "<30-days-ago>" }, why: "Top gainers/losers + new/lost keywords vs mes anterior." },
      { call: "gsc_indexing_coverage_report", args: { site_url: "https://dnamusic.edu.co/", sitemap_url: "https://dnamusic.edu.co/sitemap.xml" }, why: "URLs en sitemap sin tráfico, URLs con tráfico fuera del sitemap." },
      { call: "labs_google_domain_rank_overview", args: { target: "dnamusic.edu.co", location_code: 2170, language_code: "es" }, why: "Buckets top1 / top2-3 / top4-10 / top11-100 según DataForSEO Labs." },
      { call: "labs_google_ranked_keywords", args: { target: "dnamusic.edu.co", location_code: 2170, language_code: "es", limit: 50 }, why: "Lista cruda de keywords reales en Google con posición y volumen." },
      { call: "backlinks_summary", args: { target: "dnamusic.edu.co", include_subdomains: true }, why: "Total backlinks, referring domains, rank, spam_score." },
      { call: "backlinks_anchors", args: { target: "dnamusic.edu.co", limit: 20 }, why: "Top 20 anchors. Detecta anchors spammy (telegram, comprar links, etc.)." },
      { call: "pagespeed_analyze_url", args: { url: "https://www.dnamusic.edu.co/", strategy: "mobile" }, why: "Performance + Core Web Vitals (LCP, INP, CLS) en mobile." },
      { call: "clarity_traffic_overview", args: { num_of_days: "1" }, why: "UX: dead clicks, rage clicks, scroll depth, engagement (cuota 10/dia, usar con cuidado)." },
      { call: "ai_optimization_llm_mentions_search", args: { domain: "dnamusic.edu.co", platform: "chat_gpt", limit: 10 }, why: "Visibilidad en respuestas de ChatGPT." },
      { call: "ai_optimization_chatgpt_live", args: { prompt: "What is DNA Music in Colombia? What courses do they offer?", model_name: "gpt-4.1-mini" }, why: "Test directo: que escribe ChatGPT cuando preguntan por la marca. Detecta info incorrecta." },
      { call: "history_domain_rankings", args: { domain: "dnamusic.edu.co", days: 30 }, why: "Tendencia top3/top10 últimos 30 días desde Postgres." },
      { call: "history_traffic", args: { domain: "dnamusic.edu.co", days: 28 }, why: "Serie temporal traffic GSC + GA4." },
      { call: "brand_dna_offer_summary", args: {}, why: "Catálogo CO de programas y materias para mapear keywords a páginas correctas (solo dnamusic.edu.co)." },
    ],
    synthesis_guidance: "Después de las 15 llamadas: (1) presenta 3 KPIs principales (clicks, impr, CTR, pos) con delta vs mes anterior; (2) lista 5 quick wins con score; (3) marca 3 riesgos (rankings perdidos, backlinks tóxicos, paginas con UX rota); (4) lista 3 oportunidades on-page mapeadas a páginas específicas; (5) menciona estado AI visibility con quote literal de ChatGPT. Nunca generalices: cita números concretos y URLs.",
  },

  "competitor_analysis": {
    name: "competitor_analysis",
    description: "Análisis competitivo: con quién compite el dominio, gaps de keywords, dónde rankea cada uno.",
    expected_minutes: 2,
    cost_estimate_usd: 0.30,
    steps: [
      { call: "labs_google_competitors_domain", args: { target: "dnamusic.edu.co", location_code: 2170, language_code: "es", limit: 10 }, why: "Top 10 dominios que comparten más keywords con DNA." },
      { call: "labs_google_domain_intersection", args: { targets: { "1": "dnamusic.edu.co", "2": "<competitor>" }, location_code: 2170, language_code: "es", limit: 100 }, why: "Keywords donde ambos rankean. Repetir por cada competidor identificado." },
      { call: "labs_google_serp_competitors", args: { keywords: ["academia de musica bogota","produccion musical curso"], location_code: 2170, language_code: "es" }, why: "Quién aparece en SERP para keywords core." },
      { call: "labs_google_relevant_pages", args: { target: "<competitor>", location_code: 2170, language_code: "es", limit: 20 }, why: "Páginas top del competidor — pueden inspirar contenido propio." },
    ],
    synthesis_guidance: "Identifica 3-5 competidores reales (no agregadores tipo elempleo.com). Para cada uno: (a) cuántas keywords compartidas, (b) dónde ellos ganan vs DNA, (c) qué páginas tienen y nosotros no. Cierra con 3 oportunidades de contenido o reposicionamiento.",
  },

  "content_opportunity_brief": {
    name: "content_opportunity_brief",
    description: "Genera un brief de contenido nuevo: detecta query con potencial sin página dedicada, mapea a programa, propone estructura.",
    expected_minutes: 1.5,
    cost_estimate_usd: 0.20,
    steps: [
      { call: "gsc_keyword_opportunities", args: { site_url: "https://dnamusic.edu.co/", start_date: "<28-days-ago>", end_date: "<today>", min_impressions: 100 }, why: "Quick wins ya rankeando." },
      { call: "labs_google_keyword_ideas", args: { keyword: "<seed query>", location_code: 2170, language_code: "es", limit: 50 }, why: "Expandir el seed con keyword ideas reales." },
      { call: "labs_google_search_intent", args: { keywords: ["<top kws>"], location_code: 2170, language_code: "es" }, why: "Clasificar intent (informational/commercial/transactional/navigational)." },
      { call: "brand_map_keyword_to_program", args: { query: "<top kw>" }, why: "Verificar si ya existe página objetivo del catálogo CO." },
      { call: "serp_google_organic_live", args: { keyword: "<top kw>", location_code: 2170, language_code: "es", depth: 10 }, why: "Ver SERP actual: featured snippets, AI overview, top 10 competidores." },
    ],
    synthesis_guidance: "Brief structurado: title, meta description, H1, H2-H4 outline, target keyword + LSI, internal linking targets (apuntar a /programas/X según mapper), schema sugerido, longitud estimada. Si la query mapea a una página existente, propon optimización en lugar de crear nueva.",
  },

  "backlink_health": {
    name: "backlink_health",
    description: "Salud del perfil de backlinks: detección de spam, oportunidades de disavow, anchors.",
    expected_minutes: 2,
    cost_estimate_usd: 0.10,
    steps: [
      { call: "backlinks_summary", args: { target: "<domain>", include_subdomains: true }, why: "Métricas globales (total, referring domains, rank, spam_score)." },
      { call: "backlinks_anchors", args: { target: "<domain>", limit: 50 }, why: "Top anchors. Telegram/SEO_*/comprar links = spam." },
      { call: "backlinks_referring_domains", args: { target: "<domain>", limit: 50 }, why: "Top dominios que linkean. Agrupa por TLD para detectar PBNs." },
      { call: "backlinks_history", args: { target: "<domain>" }, why: "Histórico para detectar spikes sospechosos." },
      { call: "backlinks_bulk_spam_score", args: { targets: ["<top referring domains>"] }, why: "Spam score por dominio. >50 es preocupante." },
    ],
    synthesis_guidance: "Reporte: (1) spam_score global y trend, (2) lista de anchors tóxicos con conteo, (3) lista de dominios candidatos a disavow.txt (>50 spam score), (4) decisión: disavow vs ignorar. Sugiere subir disavow.txt a GSC.",
  },

  "ai_visibility": {
    name: "ai_visibility",
    description: "Visibilidad de la marca en LLMs: qué dice ChatGPT/Claude/Gemini cuando preguntan por DNA Music.",
    expected_minutes: 2,
    cost_estimate_usd: 0.05,
    steps: [
      { call: "ai_optimization_llm_mentions_search", args: { domain: "<domain>", platform: "chat_gpt", limit: 20 }, why: "Mentions en ChatGPT con AI search volume." },
      { call: "ai_optimization_llm_mentions_search", args: { domain: "<domain>", platform: "google", limit: 20 }, why: "Mentions en Google AI Overview." },
      { call: "ai_optimization_llm_mentions_top_domains", args: { keywords: ["academia de musica bogota","produccion musical","curso de dj"] }, why: "Para cada keyword core, qué dominios cita Google AI." },
      { call: "ai_optimization_chatgpt_live", args: { prompt: "What is <brand>? What programs/courses do they offer?", model_name: "gpt-4.1-mini" }, why: "Test directo de ChatGPT." },
      { call: "ai_optimization_claude_live", args: { prompt: "What is <brand>? What programs/courses do they offer?" }, why: "Test directo de Claude." },
      { call: "ai_optimization_perplexity_live", args: { prompt: "What is <brand>? What programs/courses do they offer?" }, why: "Test Perplexity (siempre con web search)." },
    ],
    synthesis_guidance: "Compara las 3 respuestas LLM. Detecta info incorrecta vs el catálogo real (brand_dna_offer_summary). Identifica: (1) qué LLMs te citan, (2) qué dicen mal, (3) qué páginas cita cada uno. Recomienda contenido autoritativo (FAQ, About, JSON-LD) para corregir.",
  },

  "migration_audit": {
    name: "migration_audit",
    description: "Auditoría de migración: verifica que las URLs viejas redirigen, que el sitemap está completo, y que el schema sigue válido.",
    expected_minutes: 3,
    cost_estimate_usd: 0.0,
    steps: [
      { call: "wayback_get_snapshots", args: { url: "<old domain>", limit: 100 }, why: "Lista URLs históricas del sitio antes de la migración." },
      { call: "redirect_chain_check", args: { url: "<old url>", max_hops: 10 }, why: "Para cada URL crítica: verifica que redirige correctamente al nuevo dominio." },
      { call: "http_headers_inspect", args: { url: "<new url>" }, why: "Verifica canonical, x-robots-tag, cache-control en URLs nuevas." },
      { call: "gsc_url_bulk_inspection", args: { urls: ["<top urls>"], site_url: "<gsc property>" }, why: "Estado de indexación de las URLs principales en GSC." },
      { call: "schema_validate_url", args: { url: "<new url>" }, why: "Verifica que el schema markup sigue válido post-migración." },
      { call: "gsc_indexing_coverage_report", args: { site_url: "<gsc property>", sitemap_url: "<sitemap url>" }, why: "Detecta sitemap incompleto post-migración." },
    ],
    synthesis_guidance: "Lista por status: URLs migradas correctamente / con redirect roto / sin redirect / con schema roto. Para cada caso, prioriza por tráfico histórico (de wayback + GSC).",
  },

  "weekly_report": {
    name: "weekly_report",
    description: "Reporte semanal estandarizado: traffic week-over-week, top movers, backlinks delta, tareas backlog.",
    expected_minutes: 1.5,
    cost_estimate_usd: 0.10,
    steps: [
      { call: "history_traffic", args: { domain: "<domain>", days: 14 }, why: "Traffic últimos 14 días para comparar 2 semanas." },
      { call: "gsc_search_analytics_compare", args: { site_url: "<gsc property>", current_start: "<7-days-ago>", current_end: "<today>", prior_start: "<14-days-ago>", prior_end: "<7-days-ago>" }, why: "Top gainers/losers semana actual vs anterior." },
      { call: "history_backlinks", args: { domain: "<domain>", weeks: 4 }, why: "Trend de backlinks últimas 4 semanas." },
      { call: "history_domain_rankings", args: { domain: "<domain>", days: 14 }, why: "Buckets top3/top10 dos semanas." },
      { call: "backlog_list", args: { status: "ejecutada" }, why: "Tareas que el equipo cerró esta semana." },
      { call: "backlog_list", args: { status: "pendiente", priority: "alta" }, why: "Tareas alta prioridad pendientes." },
    ],
    synthesis_guidance: "Formato: (1) headline 1-line con WoW change. (2) 3 bullets de top wins. (3) 3 bullets de top losses. (4) backlinks delta. (5) Tareas cerradas N. (6) Tareas alta pendientes M. Sin jerga, lenguaje ejecutivo.",
  },
};

export function registerPlaybookTools(server: McpServer) {
  server.tool(
    "seo_workflow_playbook",
    "Returns a step-by-step recipe for a named SEO analysis. Use this BEFORE running multi-tool analyses to know which tools to call in which order with which parameters. Available workflows: '360_audit' (full SEO snapshot), 'competitor_analysis', 'content_opportunity_brief', 'backlink_health', 'ai_visibility', 'migration_audit', 'weekly_report'. Pass 'list' as name to get all workflows with descriptions.",
    {
      name: z.string().describe("Workflow name. Use 'list' to discover available workflows."),
    },
    async ({ name }) => {
      if (name === "list") {
        const list = Object.values(PLAYBOOKS).map((p) => ({
          name: p.name,
          description: p.description,
          expected_minutes: p.expected_minutes,
          cost_estimate_usd: p.cost_estimate_usd,
          steps_count: p.steps.length,
        }));
        return { content: [{ type: "text" as const, text: formatResult({ workflows: list }) }] };
      }
      const playbook = PLAYBOOKS[name];
      if (!playbook) {
        return { content: [{ type: "text" as const, text: formatResult({ error: "unknown_workflow", available: Object.keys(PLAYBOOKS) }) }] };
      }
      return { content: [{ type: "text" as const, text: formatResult(playbook) }] };
    }
  );
}
