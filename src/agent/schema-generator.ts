// Generate schema.org Course / EducationalOccupationalProgram JSON-LD for
// DNA Music programs. Output is a string with the script tag, ready to paste
// into a page <head>.

import { ALL_PROGRAMS, DNA_SEDES_CO, getProgramBySlug } from "./brand-knowledge.js";

const PROVIDER = {
  "@type": "EducationalOrganization",
  name: "DNA Music",
  url: "https://dnamusic.edu.co",
  sameAs: ["https://dnamusic.edu.co", "https://dnamusic.co"],
} as const;

const COURSE_MODE_MAP = {
  "Presencial": "Onsite",
  "Hibrida": "Blended",
  "Virtual": "Online",
  "100% Virtual": "Online",
} as const;

function timeRequiredFromSemestres(sem: number): string {
  // ISO 8601 duration: 1 semestre ≈ 6 meses
  return `P${sem * 6}M`;
}

function timeRequiredFromMeses(meses: number): string {
  return `P${meses}M`;
}

export function generateProgramSchema(slug: string): { json: object; script: string } | null {
  const program = getProgramBySlug(slug);
  if (!program) return null;

  const courseMode = program.modalidades.map((m) => COURSE_MODE_MAP[m]).filter((v, i, a) => a.indexOf(v) === i);
  const isTecnico = "duracion_estandar_semestres" in program;
  const timeRequired = isTecnico
    ? timeRequiredFromSemestres((program as any).duracion_estandar_semestres)
    : timeRequiredFromMeses((program as any).duracion_estandar_meses);

  const courseInstances: Array<Record<string, unknown>> = [];
  for (const modalidad of program.modalidades) {
    const mode = COURSE_MODE_MAP[modalidad];
    if (modalidad === "Presencial" && isTecnico) {
      // For onsite programs, list each city as a separate instance
      for (const sede of DNA_SEDES_CO) {
        courseInstances.push({
          "@type": "CourseInstance",
          courseMode: mode,
          location: { "@type": "Place", name: `DNA Music ${sede.name}`, address: { "@type": "PostalAddress", addressLocality: sede.name, addressCountry: "CO" } },
        });
      }
    } else {
      courseInstances.push({ "@type": "CourseInstance", courseMode: mode });
    }
  }

  const json = {
    "@context": "https://schema.org",
    "@type": isTecnico ? ["Course", "EducationalOccupationalProgram"] : "Course",
    name: program.name,
    description: program.enfoque,
    provider: PROVIDER,
    educationalLevel: isTecnico ? "Vocational (ETDH)" : "Continuing Education",
    timeRequired,
    courseMode,
    inLanguage: "es-CO",
    offers: { "@type": "Offer", category: "Educación", availability: "https://schema.org/InStock" },
    syllabusSections: program.materias.map((m) => ({ "@type": "Syllabus", name: m })),
    hasCourseInstance: courseInstances,
    url: `https://dnamusic.edu.co${program.url_path}`,
  };
  if (isTecnico) {
    (json as any).occupationalCredentialAwarded = "Certificado ETDH (Secretaria de Educacion)";
  }

  const script = `<script type="application/ld+json">\n${JSON.stringify(json, null, 2)}\n</script>`;
  return { json, script };
}

export function generateAllProgramsSchemas(): Array<{ slug: string; name: string; url_path: string; script: string }> {
  return ALL_PROGRAMS.map((p) => {
    const result = generateProgramSchema(p.slug);
    return {
      slug: p.slug,
      name: p.name,
      url_path: p.url_path,
      script: result?.script ?? "",
    };
  });
}
