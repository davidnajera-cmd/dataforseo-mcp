// Structured catalog of DNA Music's academic offer (Colombia only).
// Source: internal pénsum docs (April 2026). Used by the agent to map keywords
// to specific programs/pages and to generate Course schema markup.
//
// IMPORTANT: This file applies only to dnamusic.edu.co. dnamusic.mx has a
// different/incomplete offer; do not use this catalog for MX tasks.

export type Modalidad = "Presencial" | "Hibrida" | "Virtual" | "100% Virtual";
export type Jornada = "manana" | "tarde" | "noche";

export type ProgramaTecnico = {
  slug: string;
  name: string;
  short_name: string;
  category: "tecnico-laboral";
  url_path: string;
  duracion_estandar_semestres: number;
  duracion_intensivo_semestres: number;
  niveles: Array<"fundamental" | "avanzado" | "integral">;
  enfoque: string;
  materias: string[];
  modalidades: Modalidad[];
  certificacion: "ETDH (Secretaria de Educacion)";
};

export type ProgramaAcademico = {
  slug: string;
  name: string;
  short_name: string;
  category: "academico-corta-duracion";
  url_path: string;
  duracion_estandar_meses: number;
  duracion_intensivo_meses: number;
  modalidades: Modalidad[];
  inicio: string;
  enfoque: string;
  materias: string[];
};

export const DNA_SEDES_CO = [
  { slug: "bogota", name: "Bogotá", url_path: "/sedes/bogota" },
  { slug: "medellin", name: "Medellín", url_path: "/sedes/medellin" },
  { slug: "cali", name: "Cali", url_path: "/sedes/cali" },
  { slug: "barranquilla", name: "Barranquilla", url_path: "/sedes/barranquilla" },
  { slug: "pereira", name: "Pereira", url_path: "/sedes/pereira" },
] as const;

export const DNA_JORNADAS = [
  { slug: "manana" as const, label: "Mañana", horario: "7am-1pm" },
  { slug: "tarde" as const, label: "Tarde", horario: "2pm-6pm" },
  { slug: "noche" as const, label: "Noche", horario: "6pm-10pm" },
];

export const DNA_TECNICOS_LABORALES: ProgramaTecnico[] = [
  {
    slug: "tecnico-dj-productor",
    name: "Técnico Laboral en DJ y Producción Musical",
    short_name: "Técnico DJ Productor",
    category: "tecnico-laboral",
    url_path: "/programas/tecnico-dj-productor",
    duracion_estandar_semestres: 6,
    duracion_intensivo_semestres: 3,
    niveles: ["fundamental", "avanzado", "integral"],
    enfoque: "Formación de DJs y productores: mezcla, sincronización, producción digital y performance en vivo.",
    modalidades: ["Presencial", "Hibrida", "Virtual"],
    certificacion: "ETDH (Secretaria de Educacion)",
    materias: [
      "Fundamentos de Audio", "Historia de la Música", "Cuerpo y Sonido", "Introducción a la Música", "Montajes Básicos",
      "Intro a la Producción", "Audio Digital", "Armonía 1", "Síntesis", "Mezcla y Sincronización 1",
      "Edición Audio y Video", "Bases de Composición", "Beat Making", "Procesamiento de Audio", "Mezcla y Sincronización 2",
      "Intro a Estudio", "Puesta en Escena", "Mezcla Musical", "Songwriting", "Arreglos y Remixing",
      "Técnicas de Grabación", "Producción Avanzada", "Música Publicitaria", "Mezcla Armónica y Efectos", "Music Business 1",
      "Performance Avanzado DJ", "Music Business 2", "Ensamble", "Producción Avanzada 2", "Emprendimiento",
    ],
  },
  {
    slug: "tecnico-egmm",
    name: "Técnico Laboral en Edición, Grabación, Mezcla y Masterización",
    short_name: "Técnico Edición Grabación Mezcla y Masterización",
    category: "tecnico-laboral",
    url_path: "/programas/tecnico-egmm",
    duracion_estandar_semestres: 6,
    duracion_intensivo_semestres: 3,
    niveles: ["fundamental", "avanzado", "integral"],
    enfoque: "Ingeniería de audio: grabación, edición, mezcla, postproducción y masterización para múltiples formatos.",
    modalidades: ["Presencial", "Hibrida", "Virtual"],
    certificacion: "ETDH (Secretaria de Educacion)",
    materias: [
      "Fundamentos de Audio", "Historia de la Música", "Cuerpo y Sonido", "Introducción a la Música", "Montajes Básicos",
      "Introducción a la Producción", "Audio Digital", "Armonía 1", "Síntesis", "Sonido en Vivo",
      "Audio Digital 2", "Bases de Composición", "Beat Making", "Procesamiento de Audio", "Music Business 1",
      "Intro a Estudio", "Music Business 2", "Mezcla Musical", "Songwriting", "Arreglos y Remixing",
      "Técnicas de Grabación", "Producción Avanzada", "Música Publicitaria", "Postproducción", "Mezcla Musical 2",
      "Masterización", "Mezcla Postproducción", "Ensamble", "Producción Avanzada 2", "Emprendimiento",
    ],
  },
  {
    slug: "tecnico-musica-composicion",
    name: "Técnico Laboral en Música y Composición",
    short_name: "Técnico Música y Composición",
    category: "tecnico-laboral",
    url_path: "/programas/tecnico-musica-composicion",
    duracion_estandar_semestres: 6,
    duracion_intensivo_semestres: 3,
    niveles: ["fundamental", "avanzado", "integral"],
    enfoque: "Composición, armonía, interpretación instrumental (piano) y songwriting.",
    modalidades: ["Presencial", "Hibrida", "Virtual"],
    certificacion: "ETDH (Secretaria de Educacion)",
    materias: [
      "Fundamentos de Audio", "Historia de la Música", "Cuerpo y Sonido", "Introducción a la Música", "Montajes Básicos",
      "Introducción a la Producción", "Audio Digital", "Armonía 1", "Síntesis", "Instrumento 1",
      "Bases de Composición", "Instrumento 2", "Beat Making", "Procesamiento de Audio", "Music Business 1",
      "Intro a Estudio", "Music Business 2", "Mezcla Musical", "Instrumento 3", "Arreglos y Remixing",
      "Técnicas de Grabación", "Producción Avanzada", "Música Publicitaria", "Songwriting", "Bases de Composición 2",
      "Songwriting 2", "Armonía 2", "Ensamble", "Producción Avanzada 2", "Emprendimiento",
    ],
  },
  {
    slug: "tecnico-integral",
    name: "Técnico Laboral Integral en Música",
    short_name: "Técnico Integral",
    category: "tecnico-laboral",
    url_path: "/programas/tecnico-integral",
    duracion_estandar_semestres: 10,
    duracion_intensivo_semestres: 5,
    niveles: ["integral"],
    enfoque: "Combina las 3 líneas (DJ/Producción, Ingeniería de Audio, Música/Composición). Incluye piano, técnica vocal, masterización y postproducción.",
    modalidades: ["Presencial", "Hibrida", "Virtual"],
    certificacion: "ETDH (Secretaria de Educacion)",
    materias: [
      "Fundamentos de Audio", "Historia de la Música", "Cuerpo y Sonido", "Introducción a la Música", "Mezcla y Sincronización 1",
      "Montajes Básicos", "Introducción a la Producción", "Armonía 1", "Síntesis", "Edición Audio y Video",
      "Sonido en Vivo", "Mezcla y Sincronización 2", "Beat Making", "Audio Digital", "Piano Básico",
      "Bases de Composición", "Music Business 1", "Intro a Estudio", "Audio Digital 2", "Piano Intermedio",
      "Mezcla Musical", "Procesamiento de Audio", "Armonía 2", "Técnicas de Grabación", "Técnica Vocal Básica",
      "Mezcla Musical 2", "Puesta en Escena", "Bases de Composición 2", "Arreglos y Remixing", "Mezcla Armónica y Efectos",
      "Masterización", "Music Business 2", "Producción Avanzada", "Songwriting", "Postproducción",
      "Mezcla Postproducción", "Performance Avanzado DJ", "Producción Avanzada 2", "Songwriting 2", "Emprendimiento",
      "Música Publicitaria", "Ensamble", "Piano Avanzado", "Técnica Vocal Avanzada",
    ],
  },
];

export const DNA_ACADEMICOS: ProgramaAcademico[] = [
  {
    slug: "dj-profesional",
    name: "DJ Profesional",
    short_name: "DJ Profesional",
    category: "academico-corta-duracion",
    url_path: "/programas/dj-profesional",
    duracion_estandar_meses: 12,
    duracion_intensivo_meses: 6,
    modalidades: ["Presencial", "Hibrida", "Virtual"],
    inicio: "Enero",
    enfoque: "Formación rápida en DJing: mezcla, performance, controladores.",
    materias: ["Mezcla y Sincronización 1", "Edición de Audio y Video", "Mezcla y Sincronización 2", "Mezcla Armónica y Efectos", "Performance Avanzado DJ"],
  },
  {
    slug: "dj-productor",
    name: "DJ Productor (Académico)",
    short_name: "DJ Productor Académico",
    category: "academico-corta-duracion",
    url_path: "/programas/dj-productor",
    duracion_estandar_meses: 12,
    duracion_intensivo_meses: 6,
    modalidades: ["Presencial", "Hibrida", "Virtual"],
    inicio: "Enero",
    enfoque: "DJing + producción musical en formato corto.",
    materias: [
      "Introducción a la Música", "Mezcla y Sincronización 1", "Armonía 1", "Edición de Audio y Video", "Introducción a la Producción",
      "Mezcla y Sincronización 2", "Síntesis", "Puesta en Escena", "Mezcla Armónica y Efectos", "Performance Avanzado DJ",
    ],
  },
  {
    slug: "productor-audio",
    name: "Productor de Audio",
    short_name: "Productor de Audio",
    category: "academico-corta-duracion",
    url_path: "/programas/productor-audio",
    duracion_estandar_meses: 12,
    duracion_intensivo_meses: 6,
    modalidades: ["Presencial", "Hibrida", "Virtual"],
    inicio: "Enero",
    enfoque: "Producción musical: composición, beat making, grabación y mezcla.",
    materias: [
      "Introducción a la Música", "Armonía 1", "Introducción a la Producción", "Síntesis", "Beat Making",
      "Audio Digital", "Introducción al Estudio", "Técnicas de Grabación", "Procesamiento de Audio", "Mezcla Musical",
    ],
  },
  {
    slug: "musica-composicion",
    name: "Música y Composición (Académico)",
    short_name: "Música y Composición Académico",
    category: "academico-corta-duracion",
    url_path: "/programas/musica-composicion",
    duracion_estandar_meses: 12,
    duracion_intensivo_meses: 6,
    modalidades: ["Presencial", "Hibrida", "Virtual"],
    inicio: "Enero",
    enfoque: "Piano, técnica vocal, armonía y composición.",
    materias: [
      "Historia de la Música", "Introducción a la Música", "Armonía 1", "Bases de Composición Musical", "Armonía 2",
      "Piano Básico", "Piano Intermedio", "Piano Avanzado", "Técnica Vocal Básica", "Técnica Vocal Avanzada",
    ],
  },
  {
    slug: "empresario-musica",
    name: "Empresario de la Música / Music Business",
    short_name: "Empresario de la Música",
    category: "academico-corta-duracion",
    url_path: "/programas/empresario-musica",
    duracion_estandar_meses: 12,
    duracion_intensivo_meses: 6,
    modalidades: ["100% Virtual"],
    inicio: "Enero",
    enfoque: "Negocios de la industria musical: management, branding, legal, eventos.",
    materias: [
      "Negocios, Management & Booking", "Branding Musical", "Promoción y Comunicación en la Industria Musical",
      "Gestión Legal de la Música", "Producción de Eventos y Finanzas",
    ],
  },
  {
    slug: "voz-y-escena",
    name: "Voz y Escena",
    short_name: "Voz y Escena",
    category: "academico-corta-duracion",
    url_path: "/programas/voz-y-escena",
    duracion_estandar_meses: 12,
    duracion_intensivo_meses: 6,
    modalidades: ["Presencial", "Hibrida", "Virtual"],
    inicio: "Todos los meses",
    enfoque: "Técnica vocal, puesta en escena, songwriting y music business para artistas.",
    materias: [
      "Introducción a la Música", "Técnica Vocal 1", "Armonía 1", "Técnica Vocal 2 y Puesta en Escena", "Songwriting 1",
      "Introducción a la Producción", "Music Business 1", "Music Business 2", "Técnicas de Improvisación Vocal", "Ensamble",
    ],
  },
];

// Aliases used by SEO queries (English/short names) → canonical materia name.
// Used by the keyword mapper to match queries like "djing classes" → DJ programs,
// "mastering classes" → Masterización, etc.
export const MATERIA_ALIASES: Record<string, string[]> = {
  "Beat Making": ["beat making", "beatmaking", "produccion de beats", "produccion ritmos", "hip hop production"],
  "Síntesis": ["sintesis", "sintetizadores", "synthesis", "synth"],
  "Audio Digital": ["audio digital", "daw", "digital audio"],
  "Armonía 1": ["armonia", "harmony", "armonia musical"],
  "Mezcla y Sincronización 1": ["mezcla y sincronizacion", "beatmatching", "djing", "dj mixing"],
  "Performance Avanzado DJ": ["performance dj", "dj performance", "dj en vivo", "dj live"],
  "Edición Audio y Video": ["edicion audio video", "audio editing", "video editing"],
  "Procesamiento de Audio": ["procesamiento audio", "audio processing", "ecualizador", "compresor"],
  "Mezcla Musical": ["mezcla musical", "audio mixing", "music mixing"],
  "Masterización": ["masterizacion", "mastering", "mastering classes", "mastering profesional"],
  "Postproducción": ["postproduccion", "postproduction", "post production"],
  "Mezcla Postproducción": ["mezcla postproduccion", "audio para video", "audio para cine"],
  "Sonido en Vivo": ["sonido en vivo", "live sound", "live audio"],
  "Songwriting": ["songwriting", "composicion de canciones", "letra musical", "letras"],
  "Técnicas de Grabación": ["tecnicas grabacion", "recording", "grabacion estudio"],
  "Bases de Composición": ["composicion musical", "music composition"],
  "Producción Avanzada": ["produccion avanzada", "advanced production", "produccion musical avanzada"],
  "Music Business 1": ["music business", "industria musical", "negocio musical"],
  "Música Publicitaria": ["musica publicitaria", "jingles", "musica para comerciales"],
  "Piano Básico": ["piano basico", "piano principiante", "clases de piano"],
  "Piano Intermedio": ["piano intermedio"],
  "Piano Avanzado": ["piano avanzado", "advanced piano"],
  "Técnica Vocal Básica": ["tecnica vocal", "clases de canto", "canto", "singing classes"],
  "Técnica Vocal Avanzada": ["tecnica vocal avanzada", "advanced vocal"],
  "Síntesis Sonora": ["sound design", "diseno sonoro"],
  "Branding Musical": ["branding musical", "marca personal artista"],
  "Gestión Legal de la Música": ["derechos autor", "legal musica", "music law"],
};

// Build inverse index: each materia → list of program slugs that include it
function buildMateriaIndex(): Record<string, string[]> {
  const idx: Record<string, string[]> = {};
  const allPrograms: Array<{ slug: string; materias: string[] }> = [
    ...DNA_TECNICOS_LABORALES,
    ...DNA_ACADEMICOS,
  ];
  for (const program of allPrograms) {
    for (const materia of program.materias) {
      idx[materia] = idx[materia] ?? [];
      if (!idx[materia].includes(program.slug)) idx[materia].push(program.slug);
    }
  }
  return idx;
}

export const MATERIA_TO_PROGRAMS: Record<string, string[]> = buildMateriaIndex();

export const ALL_PROGRAMS: Array<ProgramaTecnico | ProgramaAcademico> = [
  ...DNA_TECNICOS_LABORALES,
  ...DNA_ACADEMICOS,
];

export function getProgramBySlug(slug: string): ProgramaTecnico | ProgramaAcademico | null {
  return ALL_PROGRAMS.find((p) => p.slug === slug) ?? null;
}

export function dnaAcademicOfferSummary(): string {
  return [
    `Oferta académica DNA Music Colombia (dnamusic.edu.co):`,
    ``,
    `TÉCNICOS LABORALES (${DNA_TECNICOS_LABORALES.length}, certificados ETDH, 6-10 semestres):`,
    ...DNA_TECNICOS_LABORALES.map((p) => `  - ${p.short_name} → ${p.url_path} (${p.duracion_estandar_semestres} sem est. / ${p.duracion_intensivo_semestres} intensivo). Enfoque: ${p.enfoque}`),
    ``,
    `PROGRAMAS ACADÉMICOS DE CORTA DURACIÓN (${DNA_ACADEMICOS.length}, 6-12 meses):`,
    ...DNA_ACADEMICOS.map((p) => `  - ${p.short_name} → ${p.url_path} (${p.duracion_estandar_meses}m est. / ${p.duracion_intensivo_meses}m intensivo, modalidades: ${p.modalidades.join(", ")}). Enfoque: ${p.enfoque}`),
    ``,
    `SEDES FÍSICAS: ${DNA_SEDES_CO.map((s) => s.name).join(", ")}.`,
    `JORNADAS: ${DNA_JORNADAS.map((j) => `${j.label} (${j.horario})`).join(", ")}.`,
    `MODALIDADES: Presencial, Híbrida, Virtual, 100% Virtual.`,
    ``,
    `MATERIAS COMPARTIDAS DE ALTO INTERÉS SEO (con número de programas que las incluyen):`,
    ...Object.entries(MATERIA_TO_PROGRAMS)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 15)
      .map(([m, slugs]) => `  - ${m} (${slugs.length} programas: ${slugs.slice(0, 3).join(", ")}${slugs.length > 3 ? "…" : ""})`),
  ].join("\n");
}
