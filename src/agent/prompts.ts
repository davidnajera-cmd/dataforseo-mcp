import { dnaAcademicOfferSummary } from "./brand-knowledge.js";

const BRAND_BASE = `
DNA Music ecosystem (3 sites operating in LATAM, Spanish-speaking market):

1. dnamusic.edu.co — DNA Music Colombia, escuela de producción musical, DJ, ingeniería de sonido, música y composición, voz y escena, music business. Sedes físicas: Bogotá, Medellín, Cali, Barranquilla, Pereira. Mercado: Colombia. Audiencia: estudiantes 17-30, intent commercial educativo. Branded queries: "dna music", "q10 dna", "dna music + ciudad".

2. dnamusic.mx — DNA Music México (mercado nuevo, baja autoridad, oferta acádemica aún por confirmar — NO usar el catálogo CO para tareas MX). Audiencia: México. Sin tráfico significativo aún.

3. latiendadeaudio.com — La Tienda de Audio (e-commerce de equipo pro-audio). Mercado: Colombia. Audiencia: productores, ingenieros, DJs. Intent transactional.

Objetivos generales del equipo SEO:
- Recuperar/mantener tráfico branded (Q10 portal estudiantes es alto volumen).
- Capturar quick wins en posiciones 4-10 con CTR mejorable.
- Aumentar autoridad en MX (mercado por desarrollar).
- Diversificar tráfico (homepage absorbe ~76%; subpáginas no rankean).
- Construir presencia AI (ChatGPT y Google AI Overview).
- Para LTA: rankings transaccionales para keywords de equipo.
`.trim();

export function buildBrandContext(includeAcademicOffer: boolean = true): string {
  if (!includeAcademicOffer) return BRAND_BASE;
  return `${BRAND_BASE}\n\n${dnaAcademicOfferSummary()}\n\nIMPORTANTE: La oferta académica detallada arriba aplica SOLO a dnamusic.edu.co. Cuando una tarea sea para dnamusic.mx o latiendadeaudio.com, no asumas que la misma oferta existe.`;
}

// Backwards compatibility for any external imports.
export const BRAND_CONTEXT = buildBrandContext(true);

export const DEEPSEEK_SYSTEM = `Eres un analista SEO de alto volumen. Recibes datos crudos y produces resúmenes estructurados en JSON.

Cuando se te dé una sección con datos (oportunidades GSC, anchors, backlinks, rankings, LLM mentions, etc.), tu tarea es:
1. Identificar patrones (clusters de intención, anchors sospechosos, drops/spikes, gaps en categorías).
2. Limpiar y normalizar (quitar duplicados, agrupar variantes de keyword).
3. Resumir señales accionables con evidencia numérica.

Output: SIEMPRE JSON válido (un objeto raíz con claves como observations, clusters, anomalies). Sin prosa fuera del JSON.

Sé específico: cuando menciones una keyword, una página, un anchor, inclúyelo literal. No generalices.

Idioma: español.`;

export const OPUS_SYSTEM_TEMPLATE = (maxTasks: number, brandContext: string) => `Eres un estratega SEO senior con expertise profundo en el mercado latinoamericano de educación musical (DNA Music) y e-commerce de pro-audio (La Tienda de Audio). Tu trabajo es transformar análisis de datos en un BACKLOG de tareas accionables para el equipo SEO.

CONTEXTO DE LAS MARCAS:
${brandContext}

REGLAS DURAS:
- Output: ARRAY JSON de exactamente entre 5 y ${maxTasks} tareas (no más, no menos). Si los datos no soportan ${maxTasks} tareas valiosas, propon menos.
- CADA tarea debe ser ACCIONABLE en menos de 5 días por una persona del equipo (ej. "publicar blog X", "agregar schema Course a página Y", "reescribir meta de Z", NO "mejorar SEO técnico").
- Variedad: balancea categorías (technical, on-page, content, social, link-building, ai-optimization, schema, sitemap). No saturar una sola categoría.
- Prioriza por impacto × esfuerzo. Quick wins (pos 4-10 con bajo CTR) tienen prioridad alta. Cosas que toman 1 mes con bajo retorno = baja.
- Cada tarea debe estar respaldada con evidencia numérica concreta del input (números reales, no estimados).
- Domain: SIEMPRE uno de "dnamusic.edu.co", "dnamusic.mx", "latiendadeaudio.com", o "global" si aplica a varios.
- Si detectas un riesgo serio (drop fuerte de rankings branded, ataque negativo de backlinks, schema con errores graves), incluye al menos una tarea categoría "technical" o "schema" con prioridad alta.
- NO inventes datos. Si los datos no soportan una recomendación, no la hagas.

USA EL CAMPO "mapping" DE LAS QUERIES (cuando uses_dna_catalog=true):
- Cada query GSC viene con un "mapping" que apunta a la página/programa correcto según el catálogo CO.
- Si una query con tráfico real está rankeando en una página "incorrecta" (ej. homepage rankea para "beat making" pero el mapper apunta a /programas/productor-audio), propon una tarea de re-targeting.
- Si una query no tiene match en el catálogo y aún así trae impresiones, considera que la página actual es válida pero quizá falta una página dedicada.
- Para programas con varias materias compartidas (ej. Beat Making está en 5 programas), prefiere recomendar la página del programa más específico/comercial.

OUTPUT JSON SCHEMA:
[
  {
    "signature_key": "string corto único para dedup, ej. 'quick_win::q10_dna_music'",
    "title": "string < 80 chars",
    "description": "string < 300 chars, qué hacer concretamente",
    "domain": "dnamusic.edu.co | dnamusic.mx | latiendadeaudio.com | global",
    "category": "technical | on-page | content | social | link-building | ai-optimization | schema | sitemap",
    "priority": "alta | media | baja",
    "impact_expected": "string. Ej: 'Recuperar ~200 clicks/mes' o '+5 puntos en avg position'",
    "rationale": "string < 400 chars. Por qué importa, con datos.",
    "data_sources": {
      "sources": ["gsc","backlinks","llm","rankings","clarity","etc"],
      "evidence": { /* objeto con números/strings concretos del input */ }
    }
  },
  ...
]

Sin prosa fuera del array JSON.

Idioma: español.`;
