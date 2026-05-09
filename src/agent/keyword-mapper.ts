// Map SEO queries to the most relevant DNA Music program / materia / page.
// This is the bridge between GSC raw data and the academic catalog: when GSC
// says "beat making classes" rankea en pos 4 with 0% CTR, the mapper tells
// the agent which programs include that subject and which page should be
// the canonical landing.
//
// Scope: dnamusic.edu.co only (Colombia catalog).

import {
  ALL_PROGRAMS, MATERIA_TO_PROGRAMS, MATERIA_ALIASES,
  DNA_SEDES_CO, getProgramBySlug,
} from "./brand-knowledge.js";

export type QueryMapping = {
  query: string;
  matched_via: "materia" | "program_name" | "sede" | "intent_keyword" | "none";
  matched_token: string | null;
  primary_program_slug: string | null;
  primary_program_name: string | null;
  primary_program_path: string | null;
  related_program_slugs: string[];
  related_program_paths: string[];
  matched_materia: string | null;
  matched_sede: string | null;
  intent: "informational" | "commercial" | "transactional" | "navigational" | "branded" | "unknown";
  confidence: number;       // 0..1
  reasoning: string;
};

const STOP_WORDS = new Set([
  "el","la","los","las","de","del","y","o","u","con","sin","para","por","en","a","al",
  "un","una","unos","unas","es","ser","como","que","mas","mejor","cuanto","donde","cual",
  "curso","cursos","clases","clase","taller","escuela","academia","aprender","estudiar","carrera",
  "online","virtual","presencial",
]);

const BRANDED_TOKENS = new Set(["dna","dnamusic","q10"]);

const PROGRAM_NAME_TOKENS: Array<{ slug: string; tokens: string[]; full_name: string }> = ALL_PROGRAMS.map((p) => ({
  slug: p.slug,
  full_name: p.name.toLowerCase(),
  tokens: p.short_name.toLowerCase().split(/\s+/).filter((t) => !STOP_WORDS.has(t)),
}));

const MATERIA_LOOKUP: Array<{ canonical: string; aliases: string[] }> = (() => {
  const out: Array<{ canonical: string; aliases: string[] }> = [];
  for (const canonical of Object.keys(MATERIA_TO_PROGRAMS)) {
    const baseAliases = MATERIA_ALIASES[canonical] ?? [];
    const lower = canonical.toLowerCase();
    out.push({ canonical, aliases: [lower, ...baseAliases.map((a) => a.toLowerCase())] });
  }
  return out;
})();

const SEDE_LOOKUP = DNA_SEDES_CO.map((s) => ({ slug: s.slug, name: s.name.toLowerCase(), path: s.url_path }));

function normalize(text: string): string {
  return text.toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // strip accents
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokensOf(text: string): string[] {
  return normalize(text).split(/\s+/).filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

// Patterns that always indicate navegacional intent (current students looking
// for the platform/portal/login). These should NOT be classified as commercial
// even if the SERP looks like search-for-school, because the user is already
// enrolled and just trying to access the system.
const NAVIGATIONAL_PATTERNS = [
  /\bq10\b/i,
  /\bportal[\s-]?estudiantes?\b/i,
  /\bplataforma\b/i,
  /\blogin\b/i,
  /\biniciar[\s-]?sesion\b/i,
  /\bacceso\b/i,
  /\bcontrasena|contraseña\b/i,
];

export function isNavegacional(query: string): boolean {
  return NAVIGATIONAL_PATTERNS.some((p) => p.test(query));
}

function detectIntent(query: string, branded: boolean, hasSede: boolean): QueryMapping["intent"] {
  // Navegacional override has priority over branded so that "q10 dna music" is
  // navegacional, not branded — the user is trying to reach the portal, not
  // discover the brand.
  if (isNavegacional(query)) return "navigational";
  if (branded) return "branded";
  const lower = query.toLowerCase();
  if (/\b(comprar|precio|cuanto|costo|matricula|matricular|inscribir|inscripcion|financiamiento|financiar|cuotas)\b/i.test(lower)) return "transactional";
  if (/\b(curso|clase|escuela|academia|aprender|estudiar|carrera|programa|tecnico|tecnico laboral)\b/i.test(lower)) return "commercial";
  if (/\b(que es|como|que|cual|cuales|por que|para que|diferencia)\b/i.test(lower)) return "informational";
  if (hasSede) return "commercial";
  return "unknown";
}

export function mapQueryToProgram(query: string): QueryMapping {
  const q = normalize(query);
  const tokens = tokensOf(query);
  const branded = tokens.some((t) => BRANDED_TOKENS.has(t));

  // 1. Try materia match (canonical + aliases)
  let bestMateria: { canonical: string; matched: string; score: number } | null = null;
  for (const entry of MATERIA_LOOKUP) {
    for (const alias of entry.aliases) {
      const aliasNorm = normalize(alias);
      if (q.includes(aliasNorm) && aliasNorm.length >= 3) {
        const score = aliasNorm.length / q.length;
        if (!bestMateria || score > bestMateria.score) {
          bestMateria = { canonical: entry.canonical, matched: alias, score };
        }
      }
    }
  }

  // 2. Try program name match
  let bestProgram: { slug: string; matched: string; score: number } | null = null;
  for (const p of PROGRAM_NAME_TOKENS) {
    const matchedTokens = p.tokens.filter((t) => tokens.includes(t));
    if (matchedTokens.length === 0) continue;
    const score = matchedTokens.length / Math.max(p.tokens.length, 1);
    if (!bestProgram || score > bestProgram.score) {
      bestProgram = { slug: p.slug, matched: matchedTokens.join(" "), score };
    }
  }

  // 3. Sede match
  const matchedSede = SEDE_LOOKUP.find((s) => q.includes(s.name)) ?? null;

  // Navegacional override: queries like q10/portal/login should NOT be linked to a
  // commercial program. The page they want is the portal, not /programas/X.
  const navegacional = isNavegacional(query);

  // Resolve primary program
  let primarySlug: string | null = null;
  let matchedVia: QueryMapping["matched_via"] = "none";
  let matchedToken: string | null = null;
  let confidence = 0;

  if (navegacional) {
    // Force: no program link, no commercial classification
    matchedVia = "intent_keyword";
    matchedToken = "navegacional";
    confidence = 0.85; // very confident this is portal/login traffic
  } else if (bestMateria) {
    const programs = MATERIA_TO_PROGRAMS[bestMateria.canonical] ?? [];
    primarySlug = programs[0] ?? null;
    matchedVia = "materia";
    matchedToken = bestMateria.matched;
    confidence = bestMateria.score;
  } else if (bestProgram && bestProgram.score >= 0.5) {
    primarySlug = bestProgram.slug;
    matchedVia = "program_name";
    matchedToken = bestProgram.matched;
    confidence = bestProgram.score;
  } else if (matchedSede) {
    matchedVia = "sede";
    matchedToken = matchedSede.name;
    confidence = 0.4;
  } else if (branded) {
    matchedVia = "intent_keyword";
    matchedToken = "branded";
    confidence = 0.3;
  }

  const primary = primarySlug ? getProgramBySlug(primarySlug) : null;
  const relatedSlugs = bestMateria ? (MATERIA_TO_PROGRAMS[bestMateria.canonical] ?? []) : (primarySlug ? [primarySlug] : []);
  const relatedPaths = relatedSlugs
    .map((slug) => getProgramBySlug(slug))
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .map((p) => p.url_path);

  const intent = detectIntent(query, branded, !!matchedSede);
  const reasoningParts: string[] = [];
  if (bestMateria) reasoningParts.push(`Coincide con materia "${bestMateria.canonical}" (${relatedSlugs.length} programas la incluyen).`);
  if (bestProgram && bestProgram.score >= 0.5) reasoningParts.push(`Coincide con programa "${bestProgram.slug}".`);
  if (matchedSede) reasoningParts.push(`Menciona sede "${matchedSede.name}".`);
  if (branded) reasoningParts.push(`Query branded.`);
  if (reasoningParts.length === 0) reasoningParts.push(`Sin match en catálogo CO; mapper no encontró programa relevante.`);

  return {
    query,
    matched_via: matchedVia,
    matched_token: matchedToken,
    primary_program_slug: primarySlug,
    primary_program_name: primary?.name ?? null,
    primary_program_path: primary?.url_path ?? null,
    related_program_slugs: relatedSlugs,
    related_program_paths: relatedPaths,
    matched_materia: bestMateria?.canonical ?? null,
    matched_sede: matchedSede?.name ?? null,
    intent,
    confidence: Math.min(1, confidence),
    reasoning: reasoningParts.join(" "),
  };
}

export function mapQueriesBulk(queries: string[]): QueryMapping[] {
  return queries.map(mapQueryToProgram);
}
