import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { mapQueryToProgram, mapQueriesBulk } from "./agent/keyword-mapper.js";
import { generateProgramSchema, generateAllProgramsSchemas } from "./agent/schema-generator.js";
import { ALL_PROGRAMS, DNA_TECNICOS_LABORALES, DNA_ACADEMICOS, DNA_SEDES_CO, MATERIA_TO_PROGRAMS, getProgramBySlug, dnaAcademicOfferSummary } from "./agent/brand-knowledge.js";

function formatResult(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export function registerBrandKnowledgeTools(server: McpServer) {
  server.tool(
    "brand_dna_offer_summary",
    "Get a structured summary of DNA Music's full Colombia academic offer (10 programs, ~50 subjects, 5 sedes, modalities). Source of truth for SEO targeting decisions on dnamusic.edu.co. Does NOT apply to dnamusic.mx or latiendadeaudio.com.",
    {},
    async () => {
      const summary = dnaAcademicOfferSummary();
      const data = {
        summary_text: summary,
        programs: ALL_PROGRAMS.map((p) => ({
          slug: p.slug,
          name: p.name,
          short_name: p.short_name,
          category: p.category,
          url_path: p.url_path,
          modalidades: p.modalidades,
          materias_count: p.materias.length,
          enfoque: p.enfoque,
        })),
        sedes: DNA_SEDES_CO,
        materia_index: MATERIA_TO_PROGRAMS,
      };
      return { content: [{ type: "text" as const, text: formatResult(data) }] };
    }
  );

  server.tool(
    "brand_program_detail",
    "Get full detail of a single DNA Music program (all subjects, durations, modalities). Use when proposing tasks or briefs targeting that program.",
    { slug: z.string().describe("Program slug, e.g. 'tecnico-dj-productor', 'productor-audio'.") },
    async ({ slug }) => {
      const program = getProgramBySlug(slug);
      if (!program) {
        return { content: [{ type: "text" as const, text: formatResult({ error: "not_found", slug, available: ALL_PROGRAMS.map((p) => p.slug) }) }] };
      }
      return { content: [{ type: "text" as const, text: formatResult(program) }] };
    }
  );

  server.tool(
    "brand_map_keyword_to_program",
    "Map an SEO query to the most relevant DNA Music program / subject / page (Colombia catalog only). Returns matched_via (materia | program_name | sede | none), suggested page path, related programs, intent classification, and confidence.",
    { query: z.string() },
    async ({ query }) => {
      return { content: [{ type: "text" as const, text: formatResult(mapQueryToProgram(query)) }] };
    }
  );

  server.tool(
    "brand_map_keywords_bulk",
    "Map a batch of queries to DNA Music programs at once. Useful when annotating GSC top queries before producing content briefs or backlog tasks.",
    { queries: z.array(z.string()).min(1).max(500) },
    async ({ queries }) => {
      const mappings = mapQueriesBulk(queries);
      const summary = {
        total: mappings.length,
        matched_materia: mappings.filter((m) => m.matched_via === "materia").length,
        matched_program: mappings.filter((m) => m.matched_via === "program_name").length,
        matched_sede: mappings.filter((m) => m.matched_via === "sede").length,
        unmatched: mappings.filter((m) => m.matched_via === "none").length,
      };
      return { content: [{ type: "text" as const, text: formatResult({ summary, mappings }) }] };
    }
  );

  server.tool(
    "brand_generate_course_schema",
    "Generate schema.org Course / EducationalOccupationalProgram JSON-LD for a DNA Music program. Output is a ready-to-paste <script> block plus the parsed JSON. Use slug='all' to get every program's schema at once.",
    { slug: z.string().describe("Program slug or 'all'.") },
    async ({ slug }) => {
      if (slug === "all") {
        return { content: [{ type: "text" as const, text: formatResult({ programs: generateAllProgramsSchemas() }) }] };
      }
      const result = generateProgramSchema(slug);
      if (!result) return { content: [{ type: "text" as const, text: formatResult({ error: "not_found", slug }) }] };
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "brand_list_program_slugs",
    "List every available DNA Music program slug grouped by category. Quick reference for the other brand tools.",
    {},
    async () => {
      return { content: [{ type: "text" as const, text: formatResult({
        tecnicos_laborales: DNA_TECNICOS_LABORALES.map((p) => ({ slug: p.slug, name: p.short_name, url_path: p.url_path })),
        academicos: DNA_ACADEMICOS.map((p) => ({ slug: p.slug, name: p.short_name, url_path: p.url_path })),
      }) }] };
    }
  );
}
