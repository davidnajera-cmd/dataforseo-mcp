import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getConfiguredActor, runActorSync } from "./apify-client.js";

function formatResult(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

function normalizeStringList(values: string[] | undefined): string[] {
  return (values ?? []).map((value) => value.trim()).filter(Boolean);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function buildBrandCollaborationUrl(args: {
  brand_query?: string;
  creator_or_page_id?: string;
  target?: "instagram" | "facebook" | "all";
  start_date?: string;
  end_date?: string;
}) {
  const url = new URL("https://www.facebook.com/ads/library/branded_content/");
  if (args.brand_query) url.searchParams.set("query", args.brand_query);
  url.searchParams.set("id", args.creator_or_page_id?.trim() || "0");
  if (args.target && args.target !== "all") url.searchParams.set("target", args.target);
  if (args.start_date) url.searchParams.set("start_date", args.start_date);
  if (args.end_date) url.searchParams.set("end_date", args.end_date);
  return url.toString();
}

function baseUrl(bundle?: "research" | "seo" | "pauta" | "agent" | "full") {
  const root = process.env.DASHBOARD_URL?.trim() || "https://dataforseo-mcp-three.vercel.app";
  return bundle ? `${root}/mcp?bundle=${bundle}` : `${root}/mcp`;
}

export function registerApifyGrowthTools(server: McpServer) {
  server.tool(
    "apify_google_search_multi_engine",
    "Run Apify Google Search Results Scraper with DNA-friendly switches for Google organic plus AI visibility engines. Supports Google results, AI Overviews, AI Mode, ChatGPT, Perplexity, Copilot, and Gemini in one run. Use this when you want a single MCP tool to capture AI visibility snapshots or cross-engine SERP evidence without hand-crafting Apify input.",
    {
      queries: z.array(z.string()).min(1).describe("Search queries to run. Keep this tight because each query can fan out across multiple engines."),
      country_code: z.string().optional().describe("ISO-2 country code, e.g. 'co', 'mx', 'us'."),
      language_code: z.string().optional().describe("Language code, e.g. 'es', 'en'."),
      max_pages_per_query: z.number().optional().describe("Pages per query for Google results. Default 1."),
      include_ai_overview: z.boolean().optional().describe("Enable Google AI Overviews when available. Default true."),
      include_ai_mode: z.boolean().optional().describe("Enable Google AI Mode when available. Default false."),
      include_chatgpt: z.boolean().optional().describe("Enable ChatGPT web-search results. Default false."),
      include_perplexity: z.boolean().optional().describe("Enable Perplexity results. Default false."),
      include_copilot: z.boolean().optional().describe("Enable Microsoft Copilot results. Default false."),
      include_gemini: z.boolean().optional().describe("Enable Google Gemini results. Default false."),
      maximum_leads_enrichment_records: z.number().optional().describe("Pass-through to actor for lead enrichment. Default 0."),
      max_items: z.number().optional().describe("Dataset cap returned by Apify. Default 25."),
      max_total_charge_usd: z.number().optional().describe("Optional pay-per-event cap for Apify. Default 0.75 for this actor so runs are accepted."),
      actor_input_overrides: z.record(z.string(), z.unknown()).optional().describe("Extra Apify input fields merged last."),
    },
    async ({
      queries,
      country_code,
      language_code,
      max_pages_per_query,
      include_ai_overview,
      include_ai_mode,
      include_chatgpt,
      include_perplexity,
      include_copilot,
      include_gemini,
      maximum_leads_enrichment_records,
      max_items,
      max_total_charge_usd,
      actor_input_overrides,
    }) => {
      const actorId = await getConfiguredActor("google_search");
      const cleanQueries = normalizeStringList(queries);
      const input: Record<string, unknown> = {
        queries: cleanQueries.join("\n"),
        maxPagesPerQuery: max_pages_per_query ?? 1,
        ...(country_code ? { countryCode: country_code.toLowerCase() } : {}),
        ...(language_code ? { languageCode: language_code.toLowerCase() } : {}),
        disableGoogleSearchResults: (include_ai_overview ?? true) === false && (include_ai_mode ?? false) === true,
        aiModeSearch: { enableAiMode: include_ai_mode ?? false },
        geminiSearch: { enableGemini: include_gemini ?? false },
        perplexitySearch: {
          enablePerplexity: include_perplexity ?? false,
          returnImages: false,
          returnRelatedQuestions: false,
        },
        chatGptSearch: { enableChatGpt: include_chatgpt ?? false },
        copilotSearch: { enableCopilot: include_copilot ?? false },
        maximumLeadsEnrichmentRecords: maximum_leads_enrichment_records ?? 0,
        ...(actor_input_overrides ?? {}),
      };
      const items = await runActorSync(actorId, input, {
        max_items: max_items ?? 25,
        max_total_charge_usd: max_total_charge_usd ?? 0.75,
      });
      return {
        content: [{
          type: "text" as const,
          text: formatResult({
            actor: actorId,
            queries: cleanQueries,
            engines: {
              google: true,
              ai_overview: include_ai_overview ?? true,
              ai_mode: include_ai_mode ?? false,
              chatgpt: include_chatgpt ?? false,
              perplexity: include_perplexity ?? false,
              copilot: include_copilot ?? false,
              gemini: include_gemini ?? false,
            },
            items_count: items.length,
            items,
          }),
        }],
      };
    }
  );

  server.tool(
    "apify_link_prospecting_tool",
    "Run Apify Link Prospecting Tool to search Google and AI engines, remove domains already mentioning your brand, and enrich remaining prospects. Built for outreach and digital PR workflows. This is the practical wrapper for prospect discovery without writing raw actor input.",
    {
      queries: z.array(z.string()).min(1).describe("Prospecting queries such as 'best dj schools bogota' or 'music production blogs latin america'."),
      brand: z.string().describe("Your brand name, used to exclude already-covered mentions."),
      own_domains: z.array(z.string()).min(1).describe("Domains that belong to your brand."),
      competitor_domains: z.array(z.string()).optional().describe("Known competitor domains."),
      ignore_domains: z.array(z.string()).optional().describe("Domains to exclude from outreach."),
      departments: z.array(z.string()).optional().describe("Department hints for enrichment, e.g. PR, editorial, marketing."),
      organic_results: z.number().optional().describe("How many organic results to analyze per query. Default 3 for a faster, lighter run."),
      include_chatgpt: z.boolean().optional().describe("Whether to run ChatGPT Search. Default false."),
      include_ai_mode: z.boolean().optional().describe("Whether to run Google AI Mode. Default false."),
      include_ai_overviews: z.boolean().optional().describe("Whether to analyze Google AI Overviews when present. Default true."),
      include_perplexity: z.boolean().optional().describe("Whether to run Perplexity. Default false."),
      include_gemini: z.boolean().optional().describe("Whether to run Gemini. Default false."),
      include_copilot: z.boolean().optional().describe("Whether to run Copilot. Default false."),
      max_contacts_per_domain: z.number().optional().describe("Max leads scraped per source domain. Default 1."),
      enable_email_verification: z.boolean().optional().describe("Whether to verify enriched emails. Default false."),
      search_author_name: z.boolean().optional().describe("Whether to use AI to identify article authors. Default false."),
      max_items: z.number().optional().describe("Dataset cap returned by Apify. Default 25."),
      max_total_charge_usd: z.number().optional().describe("Optional pay-per-event cap for Apify if this actor pricing requires it."),
      actor_input_overrides: z.record(z.string(), z.unknown()).optional(),
    },
    async ({
      queries,
      brand,
      own_domains,
      competitor_domains,
      ignore_domains,
      departments,
      organic_results,
      include_chatgpt,
      include_ai_mode,
      include_ai_overviews,
      include_perplexity,
      include_gemini,
      include_copilot,
      max_contacts_per_domain,
      enable_email_verification,
      search_author_name,
      max_items,
      max_total_charge_usd,
      actor_input_overrides,
    }) => {
      const actorId = await getConfiguredActor("link_prospecting");
      const cleanQueries = normalizeStringList(queries);
      const input: Record<string, unknown> = {
        queries: cleanQueries.join("\n"),
        brand: brand.trim(),
        organicResult: organic_results ?? 3,
        enableChatGpt: include_chatgpt ?? false,
        enableAiMode: include_ai_mode ?? false,
        enableAiOverviews: include_ai_overviews ?? true,
        enablePerplexity: include_perplexity ?? false,
        enableGemini: include_gemini ?? false,
        enableCopilot: include_copilot ?? false,
        ownDomains: unique(normalizeStringList(own_domains)),
        ...(competitor_domains?.length ? { competitorDomains: unique(normalizeStringList(competitor_domains)) } : {}),
        ...(ignore_domains?.length ? { ignoreDomains: unique(normalizeStringList(ignore_domains)) } : {}),
        ...(departments?.length ? { department: unique(normalizeStringList(departments)) } : {}),
        maxContactsPerDomain: max_contacts_per_domain ?? 1,
        enableEmailVerification: enable_email_verification ?? false,
        searchAuthorName: search_author_name ?? false,
        ...(actor_input_overrides ?? {}),
      };
      const items = await runActorSync(actorId, input, {
        max_items: max_items ?? 25,
        max_total_charge_usd: max_total_charge_usd ?? 1,
        timeout_ms: 240_000,
      });
      return { content: [{ type: "text" as const, text: formatResult({ actor: actorId, items_count: items.length, items }) }] };
    }
  );

  server.tool(
    "apify_meta_brand_collaboration",
    "Run Apify Meta Brand Collaboration Scraper against branded content pages from Meta Ad Library. Useful for mapping paid creator partnerships, seeing which creators a brand works with, and collecting collaboration evidence for influencer benchmarking.",
    {
      brand_query: z.string().optional().describe("Brand query used in Meta branded content search, e.g. 'Nike'."),
      creator_or_page_id: z.string().optional().describe("Optional page or creator id used by Meta branded content URLs."),
      target: z.enum(["instagram", "facebook", "all"]).optional().describe("Which platform inside Meta branded content search. Default instagram."),
      start_date: z.string().optional().describe("YYYY-MM-DD."),
      end_date: z.string().optional().describe("YYYY-MM-DD."),
      results_limit: z.number().optional().describe("Results limit for the actor. Default 10."),
      start_urls: z.array(z.string()).optional().describe("Raw branded-content URLs. If omitted, the tool builds one from the params above."),
      max_items: z.number().optional().describe("Dataset cap returned by Apify. Default 25."),
      max_total_charge_usd: z.number().optional().describe("Optional pay-per-event cap for Apify. Default 0.02 for this actor so runs are accepted."),
      actor_input_overrides: z.record(z.string(), z.unknown()).optional(),
    },
    async ({ brand_query, creator_or_page_id, target, start_date, end_date, results_limit, start_urls, max_items, max_total_charge_usd, actor_input_overrides }) => {
      const actorId = await getConfiguredActor("brand_collaboration");
      const urls = normalizeStringList(start_urls);
      if (urls.length === 0 && !brand_query && !creator_or_page_id) {
        return {
          content: [{
            type: "text" as const,
            text: formatResult({ error: "missing_input", hint: "Provide start_urls or at least brand_query / creator_or_page_id." }),
          }],
        };
      }
      const builtUrl = buildBrandCollaborationUrl({ brand_query, creator_or_page_id, target, start_date, end_date });
      const input: Record<string, unknown> = {
        startUrls: urls.length ? urls : [builtUrl],
        resultsLimit: results_limit ?? 10,
        ...(actor_input_overrides ?? {}),
      };
      const items = await runActorSync(actorId, input, {
        max_items: max_items ?? 25,
        max_total_charge_usd: max_total_charge_usd ?? 0.02,
      });
      return {
        content: [{
          type: "text" as const,
          text: formatResult({
            actor: actorId,
            search_url: urls.length ? undefined : builtUrl,
            items_count: items.length,
            items,
          }),
        }],
      };
    }
  );

  server.tool(
    "apify_tripadvisor_lead_enrichment",
    "Run Tripadvisor scraping plus optional lead enrichment and email verification. Useful for local lead generation, destination research, and premium enrichment workflows where you want business listings and decision-maker contacts in one pass.",
    {
      search: z.string().optional().describe("Search phrase or location term for Tripadvisor discovery."),
      start_urls: z.array(z.string()).optional().describe("Specific Tripadvisor URLs to scrape."),
      item_types: z.array(z.enum(["restaurants", "hotels", "attractions", "tours", "trips"])).optional().describe("Which Tripadvisor entity types to include."),
      max_items: z.number().optional().describe("Dataset cap returned by Apify. Default 25."),
      maximum_leads_enrichment_records: z.number().optional().describe("How many records to enrich with contact data. Default 0."),
      verify_leads_enrichment_emails: z.boolean().optional().describe("Whether to verify enriched emails. Default false."),
      currency: z.string().optional().describe("Currency code if the actor supports it."),
      language: z.string().optional().describe("Language code if the actor supports it."),
      max_total_charge_usd: z.number().optional().describe("Optional pay-per-event cap for Apify if the selected input path needs it."),
      actor_input_overrides: z.record(z.string(), z.unknown()).optional(),
    },
    async ({
      search,
      start_urls,
      item_types,
      max_items,
      maximum_leads_enrichment_records,
      verify_leads_enrichment_emails,
      currency,
      language,
      max_total_charge_usd,
      actor_input_overrides,
    }) => {
      const actorId = await getConfiguredActor("tripadvisor");
      const urls = normalizeStringList(start_urls);
      if (urls.length === 0 && !search) {
        return {
          content: [{
            type: "text" as const,
            text: formatResult({ error: "missing_input", hint: "Provide search or start_urls." }),
          }],
        };
      }
      const input: Record<string, unknown> = {
        ...(search ? { search, searchStringsArray: [search] } : {}),
        ...(urls.length ? { startUrls: urls.map((url) => ({ url })) } : {}),
        ...(item_types?.length ? { types: unique(item_types) } : {}),
        maximumLeadsEnrichmentRecords: maximum_leads_enrichment_records ?? 0,
        verifyLeadsEnrichmentEmails: verify_leads_enrichment_emails ?? false,
        ...(currency ? { currency } : {}),
        ...(language ? { language } : {}),
        ...(actor_input_overrides ?? {}),
      };
      const items = await runActorSync(actorId, input, { max_items: max_items ?? 25, max_total_charge_usd });
      return { content: [{ type: "text" as const, text: formatResult({ actor: actorId, items_count: items.length, items }) }] };
    }
  );

  server.tool(
    "apify_mcp_connector_blueprint",
    "Return the ready-to-use MCP endpoint blueprint for wiring this server into Apify MCP Connectors. Use this when you need the exact MCP URL, bundle choice, auth expectations, and a copy-paste actor field schema reference for Apify Console setup.",
    {
      bundle: z.enum(["research", "seo", "pauta", "agent", "full"]).optional().describe("Which bundle URL to prepare. Default research."),
    },
    async ({ bundle }) => {
      const selectedBundle = bundle ?? "research";
      const root = process.env.DASHBOARD_URL?.trim() || "https://dataforseo-mcp-three.vercel.app";
      const legacyUrl = `${root}/mcp`;
      const scopedUrl = baseUrl(selectedBundle);
      const response = {
        production_base_url: root,
        legacy_open_endpoint: legacyUrl,
        bundle_endpoint: scopedUrl,
        auth: {
          legacy_open_endpoint: "No API key required unless MCP_REQUIRE_API_KEY=true in production.",
          bundle_endpoint: "Requires x-api-key or Authorization: Bearer <key>.",
        },
        recommended_bundle_by_use_case: {
          research: `${root}/mcp?bundle=research`,
          seo: `${root}/mcp?bundle=seo`,
          pauta: `${root}/mcp?bundle=pauta`,
          agent: `${root}/mcp?bundle=agent`,
          full: `${root}/mcp?bundle=full`,
        },
        apify_console_steps: [
          "Open Apify Console > MCP Connectors.",
          "Create connector and paste the selected bundle endpoint.",
          "Authenticate once with an MCP API key if using a bundle URL.",
          "Attach the connector to one or more Actors that support MCP connectors.",
        ],
        actor_input_field_schema_example: {
          title: "DNA Music MCP connector",
          type: "array",
          editor: "resourcePicker",
          resourceType: "mcpConnector",
          description: "Select one or more MCP connectors provisioned in Apify Console.",
        },
      };
      return { content: [{ type: "text" as const, text: formatResult(response) }] };
    }
  );

  server.tool(
    "apify_mcp_connector_actor_schema",
    "Generate a copy-paste Apify actor input schema snippet for an MCP connector field pointing to this server. Useful when building your own Actor that needs access to this MCP during the run.",
    {
      connector_label: z.string().optional().describe("Human label for the connector field. Default 'DNA Music MCP connector'."),
      bundle: z.enum(["research", "seo", "pauta", "agent", "full"]).optional().describe("Suggested bundle to mention in the description."),
      required: z.boolean().optional().describe("Whether the field should be required. Default false."),
    },
    async ({ connector_label, bundle, required }) => {
      const selectedBundle = bundle ?? "research";
      const schema = {
        title: connector_label?.trim() || "DNA Music MCP connector",
        type: "array",
        editor: "resourcePicker",
        resourceType: "mcpConnector",
        ...(required ? { minItems: 1 } : {}),
        description: `Attach the ${selectedBundle} MCP connector for this Actor. Recommended endpoint: ${baseUrl(selectedBundle)}.`,
      };
      return { content: [{ type: "text" as const, text: formatResult(schema) }] };
    }
  );
}
