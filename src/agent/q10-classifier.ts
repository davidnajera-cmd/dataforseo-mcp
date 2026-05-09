// Q10 business rule — first-class classifier (NOT just a prompt-level hint).
//
// Context: in DNA Music Colombia, traffic around "Q10" is mostly current
// students trying to reach the academic portal. It is BRANDED + NAVEGACIONAL +
// SOPORTE/ACCESO traffic. It is NOT lead capture, NOT enrollment, NOT
// commercial conversion, and should not be linked to academic programs.
//
// SEO goal for Q10:
//   - Protect branded/navegacional traffic.
//   - Make portal access easy.
//   - Recover post-migration visibility for the access page.
//   - Reduce friction for current students.
//
// This module is consumed by:
//   - keyword-mapper.ts (intent override + program detachment)
//   - heuristic-tasks.ts (task framing, audience, funnel_stage)
//   - prompts.ts via the Opus system message (banned phrases + JSON schema)

import { DNA_SEDES_CO } from "./brand-knowledge.js";

// Comprehensive list of patterns. Anything matching here is Q10 traffic.
// Order matters slightly: more specific multi-word patterns first.
const Q10_PATTERNS: RegExp[] = [
  /\bq\s?10\s?dna\s?music\b/i,
  /\bdna\s?music\s?q\s?10\b/i,
  /\bq\s?10\s?dna\b/i,
  /\bdna\s?q\s?10\b/i,
  /\bportal\s?(de\s)?estudiantes?\s?(dna(\s?music)?)?\b/i,
  /\bplataforma\s?(academica|dna(\s?music)?)\b/i,
  /\blogin\s?(dna(\s?music)?|q\s?10)\b/i,
  /\bacceso\s?(q\s?10|portal|estudiantes?)\b/i,
  /\bq\s?10\s?(estudiantes?|login|acceso|portal|iniciar|sesion)\b/i,
  /\b(iniciar|cerrar)\s?sesion\s?(dna|q\s?10)\b/i,
  /\bcontrasena|contraseña\s?(dna|q\s?10)\b/i,
  // bare q10 as a token (with word boundaries) — last because most permissive
  /\bq\s?10\b/i,
  /\bdnaq10\b/i,
  /\bq10dna\b/i,
];

// Extra navegacional terms that also count as Q10 traffic when paired with
// branded context (we keep these conservative to avoid false positives).
const PORTAL_NAVEGACIONAL_PATTERNS: RegExp[] = [
  /\bportal\s?estudiantes?\b/i,
  /\bplataforma\s?academica\b/i,
  /\bacceso\s?(al\s)?portal\b/i,
];

const SEDE_REGEX = new RegExp(`\\b(${DNA_SEDES_CO.map((s) => s.name.toLowerCase()).join("|")})\\b`, "i");

export type Q10Classification = {
  is_q10: true;
  matched_pattern: string;
  intent: "navegacional";
  branded: true;
  audience: "estudiantes_actuales";
  funnel_stage: "soporte_acceso";
  program_related: null;
  materia_related: null;
  sede_related: string | null;
  conversion_expected: "no_aplica";
  business_goal: "proteger experiencia del estudiante y trafico branded";
  banned_phrases: string[];
  recommended_page_paths: string[];
};

export function isQ10Query(query: string): boolean {
  const norm = query.toLowerCase();
  return Q10_PATTERNS.some((p) => p.test(norm)) || PORTAL_NAVEGACIONAL_PATTERNS.some((p) => p.test(norm));
}

export function classifyQ10(query: string): Q10Classification | null {
  const norm = query.toLowerCase();
  let matched: string | null = null;
  for (const p of [...Q10_PATTERNS, ...PORTAL_NAVEGACIONAL_PATTERNS]) {
    const m = norm.match(p);
    if (m) { matched = m[0]; break; }
  }
  if (!matched) return null;

  const sedeMatch = norm.match(SEDE_REGEX);
  const sede = sedeMatch ? sedeMatch[1] : null;

  return {
    is_q10: true,
    matched_pattern: matched,
    intent: "navegacional",
    branded: true,
    audience: "estudiantes_actuales",
    funnel_stage: "soporte_acceso",
    program_related: null,
    materia_related: null,
    sede_related: sede,
    conversion_expected: "no_aplica",
    business_goal: "proteger experiencia del estudiante y trafico branded",
    banned_phrases: [
      "generar leads",
      "mejorar conversion comercial",
      "captar nuevos estudiantes",
      "aumentar matriculas",
      "aumentar inscripciones",
      "captacion comercial",
      "nuevos prospectos",
      "lead generation",
      "admisiones",
    ],
    recommended_page_paths: [
      "/portal-estudiantes/acceso-q10",
      "/portal-estudiantes/login",
      "/portal-estudiantes",
    ],
  };
}

// Helper: does a description / title contain phrases that violate Q10 rules?
// Used as a defensive validator before inserting an Opus task tagged as Q10.
export function findQ10Violations(text: string): string[] {
  const norm = text.toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "");
  const violations: string[] = [];
  const banned = [
    "generar leads", "lead generation", "captar nuevos", "captacion",
    "matricula", "matriculas", "inscripcion", "inscripciones",
    "admision", "admisiones", "conversion comercial",
    "prospect", "prospecto",
  ];
  for (const b of banned) if (norm.includes(b)) violations.push(b);
  return violations;
}
