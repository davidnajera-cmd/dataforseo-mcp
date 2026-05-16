import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./tools.js";
import { registerGscTools } from "./tools-gsc.js";
import { registerSerpApiTools } from "./tools-serpapi.js";
import { registerClarityTools } from "./tools-clarity.js";
import { registerGa4Tools } from "./tools-ga4.js";
import { registerGooglePlatformTools } from "./tools-google-platform.js";
import { registerPageSpeedTools } from "./tools-pagespeed.js";
import { registerSeoWorkflowTools } from "./tools-seo-workflows.js";
import { registerBingTools } from "./tools-bing.js";
import { registerWaybackTools } from "./tools-wayback.js";
import { registerSchemaTools } from "./tools-schema.js";
import { registerHttpUtilsTools } from "./tools-http-utils.js";
import { registerLogTools } from "./tools-logs.js";
import { registerHistoryTools } from "./tools-history.js";
import { registerBacklogTools } from "./tools-backlog.js";
import { registerBrandKnowledgeTools } from "./tools-brand-knowledge.js";
import { registerPlaybookTools } from "./tools-playbook.js";
import { registerAdLibTools } from "./tools-adlib.js";
import { registerApifyResearchTools } from "./tools-apify-research.js";
import { registerMarketResearchTools } from "./tools-market-research.js";
import { registerLegacyAuditTools } from "./tools-legacy-audit.js";
import { registerZernioTools } from "./tools-zernio.js";
import { isToolInBundle, type BundleName } from "./bundles.js";

const SERVER_INSTRUCTIONS = `# SEO MCP Server

This MCP exposes 227 tools for the **DNA Music** ecosystem (3 sites: dnamusic.edu.co, dnamusic.mx, latiendadeaudio.com). Tools are organized by source and purpose. Read this once to know which tools to combine for common analyses.

## ⚠ Brand naming rule (HARD)

The brand is **"DNA Music"** — always written as the full name, never as "DNA" alone. This applies to every output you produce: responses, briefs, summaries, slack messages, code comments shown to the user, anything human-readable. "DNA" alone is ambiguous (biological molecule, generic acronym) and dilutes brand recognition. Code identifiers (variable names, env var prefixes like \`DNA_DOMAIN_CO\`) are exempt — the rule is about prose.

## ⚠ Freshness contract — read this before answering anything time-sensitive

SEO data changes by the hour. Rankings move, indexation flips, traffic shifts, schema breaks. Acting on stale information here can recommend exactly the wrong fix (e.g. "this URL is noindex" when it was just unblocked an hour ago).

**Hard rules:**
1. **Do NOT reuse outputs from earlier turns** of the conversation as if they were current. The user's previous question and your previous tool call were a SNAPSHOT at that point in time, not state-of-the-world now.
2. **Re-call the relevant tools at the start of any new analysis or recommendation.** If you are about to write "the page is X / the keyword ranks at Y / the property has Z", that fact must come from a tool call made in THIS turn, not remembered from earlier.
3. **For diagnostic / decision-support questions** ("should I do X?", "is Y broken?", "what's the status of Z?"), always re-validate. Even if you queried the same tool 5 minutes ago.
4. **The only tools that serve cached/historical data BY DESIGN** are the \`history_*\` family (Postgres time-series snapshots). Everything else (\`gsc_*\`, \`ga4_*\`, \`clarity_*\`, \`pagespeed_*\`, \`serp_*\`, \`backlinks_*\`, \`onpage_*\`, \`schema_*\`, \`http_*\`, \`ai_optimization_*\`, \`wayback_*\`, \`bing_*\`) returns LIVE data at the moment of the call.
5. **Auth tokens are cached, data is not.** OAuth tokens (Google, etc.) are cached client-side until expiry; this is invisible to you and does not affect data freshness.
6. **If unsure whether something changed, call the tool.** A redundant tool call is cheap; a wrong recommendation based on stale state is expensive.

**Tools that are especially time-sensitive (always re-call):**
- \`gsc_url_inspection\` — coverage state, noindex flags, last crawl time. Can flip in hours after a deploy.
- \`gsc_search_analytics_query\` / \`gsc_keyword_opportunities\` — clicks, impressions, position. Changes daily.
- \`gsc_sitemaps_get\` — submission status, errors. Changes when sitemap re-fetched.
- \`pagespeed_analyze_url\` / \`onpage_lighthouse_live\` — performance scores. Move with every deploy.
- \`schema_validate_url\` / \`schema_extract_url\` — schema markup. Changes with every code push.
- \`http_headers_inspect\` / \`redirect_chain_check\` — status codes, redirects, headers. Highly volatile.
- \`backlinks_summary\` / \`backlinks_anchors\` — backlink data refreshes weekly at most, but action recommendations need fresh check.
- \`ai_optimization_*_live\` (chatgpt/claude/gemini/perplexity) — LLM responses are non-deterministic; never cache assumptions.
- \`gsc_sites_list\` — verified properties; re-call before any GSC analysis to confirm what's actually accessible right now.

**Tools that DO serve cached/historical data (and that's the point):**
- \`history_keyword_ranking\` / \`history_domain_rankings\` / \`history_backlinks\` / \`history_traffic\` / \`history_llm_visibility\` — explicit time-series from Postgres.
- \`snapshot_runs_list\` — record of past snapshot captures.
- \`backlog_list\` / \`backlog_get\` — current state of the backlog (this IS live, but it's not external SEO data).

**Static reference (re-call only if you suspect it changed):**
- \`brand_dna_offer_summary\` / \`brand_map_keyword_to_program\` — DNA Music catalog. Changes when programs are added/removed (rare).
- \`appendix_locations\` / \`appendix_categories\` — DataForSEO reference data.

If you are answering a question and your only source for a claim is a tool result from an earlier turn of this conversation, you are violating this contract. Re-call.

## Quick reference: which tool answers which question?

- "What does my brand look like in search RIGHT NOW?" -> gsc_site_health_report
- "Where am I losing or winning vs last month?" -> gsc_search_analytics_compare
- "Which keywords are quick wins?" -> gsc_keyword_opportunities
- "Why isn't this URL ranking?" -> gsc_url_inspection
- "How are my backlinks?" -> backlinks_summary, backlinks_anchors, backlinks_referring_domains
- "Am I being mentioned in ChatGPT/Google AI?" -> ai_optimization_llm_mentions_search, ai_optimization_chatgpt_live
- "How fast is my site?" -> pagespeed_analyze_url, onpage_lighthouse_live
- "What does my schema look like?" -> schema_validate_url, schema_extract_url, gsc_rich_results_audit
- "What pages have UX issues?" -> clarity_traffic_overview, clarity_traffic_by_page
- "What sessions/conversions do I have?" -> ga4_run_report
- "How did rankings evolve over time?" -> history_keyword_ranking, history_domain_rankings
- "What programs/materias does DNA Music offer in CO?" -> brand_dna_offer_summary
- "Which page should this query rank with?" -> brand_map_keyword_to_program
- "Generate Course schema for a program" -> brand_generate_course_schema
- "Run the agent and get a backlog of actionable tasks" -> agent_run_now, then backlog_list
- "What's in my backlog?" -> backlog_list

## How to build common analyses

For a 360 SEO audit (recommended workflow), call seo_workflow_playbook with name="360_audit". The playbook returns the precise sequence of ~12 tool calls in order, with the right parameters for each site.

Other prebuilt playbooks: "competitor_analysis", "content_opportunity_brief", "backlink_health", "ai_visibility", "migration_audit", "weekly_report".

## Conventions

- Sites are addressed by domain: "dnamusic.edu.co" | "dnamusic.mx" | "latiendadeaudio.com".
- For Colombia (dnamusic.edu.co + latiendadeaudio.com): location_code 2170, language_code "es".
- For Mexico: location_code 2484.
- GSC properties are stored in runtime variables DNA_SITE_CO/MX/LTA. Default for CO is "https://dnamusic.edu.co/" (URL prefix).
- Brand catalog tools (brand_*) ONLY apply to dnamusic.edu.co. dnamusic.mx has a different/incomplete offer.
- The Postgres history is the cheapest source: prefer history_* tools over live calls when the question is about trends.
- The agent (agent_run_now) costs ~$0.55 per run; only trigger when needed. The cron runs daily at 06:30 UTC anyway.

## Tool families (high level)

- serp_*, serpapi_* : real-time SERP results
- keywords_*, labs_google_keyword_* : keyword research and volumes
- labs_google_ranked_keywords / domain_rank_overview / competitors_domain : competitor + domain rank
- backlinks_* : backlinks (requires DataForSEO Backlinks subscription)
- onpage_* : crawls and Lighthouse
- gsc_* : Google Search Console (search analytics, sitemaps, URL inspection, indexing)
- ga4_* : Google Analytics 4 reports
- clarity_* : Microsoft Clarity UX
- bing_* : Bing Webmaster Tools
- ai_optimization_* : LLM mentions and live LLM responses
- schema_*, http_* : schema markup and HTTP utilities
- wayback_* : Wayback Machine snapshots
- log_file_analyze : web server log parsing
- history_*, keyword_universe_*, snapshot_* : historical persistence and snapshots
- backlog_*, agent_runs_* : SEO Agent backlog (DeepSeek + Opus tasks)
- brand_* : DNA Music academic catalog (Colombia only)
- zernio_* : social media profiles, connected accounts, OAuth connect flows, and post publishing via Zernio
- seo_workflow_playbook : returns step-by-step recipe for a named workflow`;

export function createServer(options: { bundle?: BundleName } = {}): McpServer {
  const bundle: BundleName = options.bundle ?? "full";
  const server = new McpServer({
    name: bundle === "full" ? "SEO MCP Server" : `SEO MCP Server (${bundle} bundle)`,
    version: "1.5.0",
  }, { instructions: SERVER_INSTRUCTIONS });

  // Wrap server.tool to filter by bundle. Tools whose name doesn't match the
  // bundle are silently dropped — registration becomes a no-op. This lets us
  // reuse the existing register* functions unchanged. The MCP SDK's `tool` is
  // heavily overloaded with Zod generics, so we use `any` here to bypass the
  // overload resolution complexity.
  if (bundle !== "full") {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const serverAny = server as any;
    const originalTool = serverAny.tool.bind(server);
    serverAny.tool = (...args: any[]) => {
      const name = args[0];
      if (typeof name === "string" && !isToolInBundle(name, bundle)) {
        return undefined;
      }
      return originalTool(...args);
    };
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }

  // DataForSEO API tools (SERP, Keywords, Backlinks, OnPage, Labs, etc.)
  registerTools(server);

  // Google Search Console API tools
  registerGscTools(server);

  // Google Analytics 4 Admin/Data API tools
  registerGa4Tools(server);

  // Google Business Profile, Site Verification, and Tag Manager
  registerGooglePlatformTools(server);

  // PageSpeed Insights + Core Web Vitals tools
  registerPageSpeedTools(server);

  // SerpAPI tools (Google, Bing, YouTube, Amazon, eBay, etc.)
  registerSerpApiTools(server);

  // Microsoft Clarity tools (traffic analytics, UX metrics)
  registerClarityTools(server);

  // SEO workflow tools and prepared premium connectors
  registerSeoWorkflowTools(server);

  // Bing Webmaster Tools (sites, query/page stats, crawl, URL submission)
  registerBingTools(server);

  // Wayback Machine (snapshots, diffs, historical recovery)
  registerWaybackTools(server);

  // Schema markup validation and extraction
  registerSchemaTools(server);

  // HTTP utilities (redirect chain, headers, robots.txt)
  registerHttpUtilsTools(server);

  // Web server log file analysis
  registerLogTools(server);

  // Historical persistence: keyword universe management, time-series queries, snapshot runs
  registerHistoryTools(server);

  // SEO Agent: backlog of actionable tasks proposed by DeepSeek + Opus
  registerBacklogTools(server);

  // DNA Music brand knowledge (Colombia catalog): keyword mapping + Course schema
  registerBrandKnowledgeTools(server);

  // Workflow playbooks: step-by-step recipes for common analyses (360 audit, etc.)
  registerPlaybookTools(server);

  // Ads Library tools backed by Apify (Meta, Google, TikTok + escape hatch)
  registerAdLibTools(server);

  // Research/intelligence Apify wrappers (Maps, Web Crawler, Instagram, YouTube)
  registerApifyResearchTools(server);

  // Market research (Reddit voice, news monitoring, Colombia-first)
  registerMarketResearchTools(server);

  // Atomic legacy redirect audit (Wayback + Backlinks + repo snapshot in one tool)
  registerLegacyAuditTools(server);

  // Social media publishing + account management via Zernio
  registerZernioTools(server);

  return server;
}
