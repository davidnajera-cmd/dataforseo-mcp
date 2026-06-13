#!/usr/bin/env node
// Validates every MCP tool by calling it with a sensible default input
// and recording the result. Saves progress incrementally so a partial run
// can be resumed.
//
// Usage:  node scripts/validate-mcp-tools.mjs

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const ENDPOINT = "https://dataforseo-mcp-three.vercel.app/mcp";
const BASELINE_ENDPOINT = "https://dataforseo-mcp-three.vercel.app/api/research?action=baseline_persist";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? "RZaP1E7hIzxBSMfNLzsFyRnLKhi1-bLX";
const RESULTS_PATH = "/tmp/validate-results.json";

// ============================================================================
// DEFAULT ARGS REGISTRY
// ============================================================================

// Generic safe defaults that apply unless overridden per tool
const GENERIC = {
  url: "https://dnamusic.edu.co/",
  inspection_url: "https://dnamusic.edu.co/",
  site_url: "https://dnamusic.edu.co/",
  domain: "dnamusic.edu.co",
  target: "dnamusic.edu.co",
  keyword: "academia musica colombia",
  keywords: ["academia musica colombia"],
  q: "academia musica colombia",
  query: "academia musica colombia",
  location_code: 2170,
  language_code: "es",
  gl: "co",
  hl: "es",
  start_date: new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10),
  end_date: new Date().toISOString().slice(0, 10),
  limit: 10,
  row_limit: 10,
  depth: 5,
  max_items: 5,
  num: 5,
  feedpath: "https://dnamusic.edu.co/sitemap.xml",
};

// Per-tool overrides
const TOOL_DEFAULTS = {
  // SerpAPI uses different conventions
  serpapi_google_search: { q: "dna music colombia", gl: "co", hl: "es" },
  serpapi_google_ai_mode: { q: "dna music colombia", gl: "co", hl: "es" },
  serpapi_google_images: { q: "dna music", gl: "co" },
  serpapi_google_news: { q: "musica colombia", gl: "co", hl: "es" },
  serpapi_google_autocomplete: { q: "academia", gl: "co", hl: "es" },
  serpapi_google_events: { q: "concierto bogota", gl: "co", hl: "es" },
  serpapi_google_jobs: { q: "musica", gl: "co", hl: "es" },
  serpapi_google_finance: { q: "GOOGL:NASDAQ", hl: "en" },
  serpapi_google_shopping: { q: "audifonos", gl: "co", hl: "es" },
  serpapi_google_scholar: { q: "music education", hl: "en" },
  serpapi_google_videos: { q: "dj tutorial", gl: "co", hl: "es" },
  serpapi_google_local_services: { q: "music school", gl: "us" },
  serpapi_google_ads_transparency: { q: "rappi", gl: "co" },
  serpapi_google_related_questions: { q: "produccion musical", gl: "co", hl: "es" },
  serpapi_google_maps: { q: "dna music cali", gl: "co" },
  serpapi_google_trends: { q: "musica colombia", geo: "CO" },
  serpapi_google_travel_explore: { q: "Bogota", hl: "es" },
  serpapi_youtube_search: { search_query: "dj tutorial" },
  serpapi_bing_search: { q: "music school colombia", mkt: "es-CO" },
  serpapi_bing_images: { q: "audio gear", mkt: "es-CO" },
  serpapi_bing_copilot: { q: "academia musica colombia", mkt: "es-CO" },
  serpapi_yahoo_search: { p: "musica" },
  serpapi_duckduckgo_search: { q: "musica colombia" },
  serpapi_baidu_search: { q: "music" },
  serpapi_naver_search: { query: "music" },
  serpapi_yandex_search: { text: "music" },
  serpapi_brave_ai_mode: { q: "musica colombia" },
  serpapi_amazon_search: { k: "headphones" },
  serpapi_walmart_search: { query: "headphones" },
  serpapi_ebay_search: { _nkw: "headphones" },
  serpapi_home_depot_search: { q: "speakers" },
  serpapi_facebook_profile: { q: "dnamusicofficial" },
  serpapi_yelp_search: { find_desc: "music school", find_loc: "miami" },

  // DataForSEO SERP
  serp_google_finance_quote_live: { keyword: "GOOGL:NASDAQ", language_code: "en" },
  serp_google_finance_explore_live: { keyword: "musica", language_code: "es" },
  serp_google_ai_mode_live: { keyword: "academia musica colombia", language_code: "es", location_code: 2170 },

  // Domain
  domain_technologies: { target: "dnamusic.edu.co" },
  domain_technologies_domains_by_technology: { technology: "wordpress", limit: 5 },
  domain_whois: { target: "dnamusic.edu.co" },

  // Keyword data
  keywords_google_search_volume_live: { keywords: ["academia musica colombia"], location_code: 2170, language_code: "es" },
  keywords_google_keywords_for_site_live: { target: "dnamusic.edu.co", location_code: 2170, language_code: "es", limit: 5 },
  keywords_google_keywords_for_keywords_live: { keywords: ["academia musica"], location_code: 2170, language_code: "es", limit: 5 },
  keywords_google_ad_traffic_live: { keywords: ["academia musica"], location_code: 2170, language_code: "es", bid: 1.0 },
  keywords_google_trends_live: { keywords: ["dna music"], location_code: 2170, language_code: "es" },
  keywords_clickstream_search_volume_live: { keywords: ["dna music"], location_code: 2170, language_code: "es" },
  keywords_bing_search_volume_live: { keywords: ["academia musica"], location_code: 2170, language_code: "es" },

  // Labs
  labs_google_keyword_suggestions: { keyword: "academia musica colombia", location_code: 2170, language_code: "es", limit: 5 },
  labs_google_keyword_ideas: { keyword: "academia musica", location_code: 2170, language_code: "es", limit: 5 },
  labs_google_related_keywords: { keyword: "dj curso", location_code: 2170, language_code: "es", limit: 5 },
  labs_google_keyword_overview: { keywords: ["academia musica colombia"], location_code: 2170, language_code: "es" },
  labs_google_bulk_keyword_difficulty: { keywords: ["academia musica colombia"], location_code: 2170, language_code: "es" },
  labs_google_search_intent: { keywords: ["academia musica colombia"], location_code: 2170, language_code: "es" },
  labs_google_keywords_for_site: { target: "dnamusic.edu.co", location_code: 2170, language_code: "es", limit: 5 },
  labs_google_historical_keyword_data: { keywords: ["dna music"], location_code: 2170, language_code: "es" },
  labs_google_top_searches: { location_code: 2170, language_code: "es", limit: 5 },
  labs_google_ranked_keywords: { target: "dnamusic.edu.co", location_code: 2170, language_code: "es", limit: 5 },
  labs_google_serp_competitors: { keywords: ["academia musica colombia"], location_code: 2170, language_code: "es", limit: 5 },
  labs_google_competitors_domain: { target: "dnamusic.edu.co", location_code: 2170, language_code: "es", limit: 5 },
  labs_google_domain_intersection: { targets: { 1: "dnamusic.edu.co", 2: "saeinstitute.edu.co" }, location_code: 2170, language_code: "es", limit: 5 },
  labs_google_domain_rank_overview: { target: "dnamusic.edu.co", location_code: 2170, language_code: "es" },
  labs_google_subdomains: { target: "dnamusic.edu.co", location_code: 2170, language_code: "es", limit: 5 },
  labs_google_relevant_pages: { target: "dnamusic.edu.co", location_code: 2170, language_code: "es", limit: 5 },
  labs_google_bulk_traffic_estimation: { targets: ["dnamusic.edu.co"], location_code: 2170, language_code: "es" },
  labs_google_historical_serps: { keyword: "dna music", location_code: 2170, language_code: "es" },

  // Backlinks
  backlinks_summary: { target: "dnamusic.edu.co", include_subdomains: true },
  backlinks_list: { target: "dnamusic.edu.co", limit: 5 },
  backlinks_referring_domains: { target: "dnamusic.edu.co", limit: 5 },
  backlinks_anchors: { target: "dnamusic.edu.co", limit: 5 },
  backlinks_history: { target: "dnamusic.edu.co" },
  backlinks_competitors: { target: "dnamusic.edu.co", limit: 5 },
  backlinks_domain_intersection: { targets: { 1: "dnamusic.edu.co", 2: "saeinstitute.edu.co" }, limit: 5 },
  backlinks_bulk_ranks: { targets: ["dnamusic.edu.co"] },
  backlinks_bulk_spam_score: { targets: ["dnamusic.edu.co"] },
  backlinks_domain_pages: { target: "dnamusic.edu.co", limit: 5 },
  backlinks_timeseries_summary: { target: "dnamusic.edu.co" },

  // OnPage live tools
  onpage_lighthouse_live: { url: "https://dnamusic.edu.co/", for_mobile: true },
  onpage_content_parsing_live: { url: "https://dnamusic.edu.co/" },
  onpage_instant_pages: { url: "https://dnamusic.edu.co/" },

  // Content analysis
  content_analysis_search: { keyword: "dna music", page_type: "all", limit: 5 },
  content_analysis_summary: { keyword: "dna music" },
  content_analysis_sentiment: { keyword: "dna music" },
  content_analysis_rating_distribution: { keyword: "dna music" },
  content_analysis_phrase_trends: { keyword: "dna music" },

  // AI optimization
  ai_optimization_llm_mentions_search: { domain: "dnamusic.edu.co", platform: "chat_gpt", limit: 5 },
  ai_optimization_llm_mentions_top_domains: { keywords: ["academia musica colombia"], location_code: 2170, language_code: "es" },
  ai_optimization_chatgpt_live: { prompt: "What is DNA Music?" },
  ai_optimization_claude_live: { prompt: "What is DNA Music?" },
  ai_optimization_gemini_live: { prompt: "What is DNA Music?" },
  ai_optimization_perplexity_live: { prompt: "What is DNA Music?" },

  // Business
  business_listings_search: { keyword: "music school", location_code: 2170, limit: 5 },
  business_social_media_pinterest: { targets: ["https://dnamusic.edu.co/"] },
  business_social_media_reddit: { targets: ["https://dnamusic.edu.co/"] },

  // Merchant + App (some require very specific inputs — skipping in NEEDS_INPUT)
  merchant_google_products_live: { keyword: "audifonos", location_code: 2170, language_code: "es" },
  app_google_play_search: { keyword: "music", location_code: 2170, language_code: "es" },
  app_apple_search: { keyword: "music", location_code: 2170, language_code: "es" },

  // GSC
  gsc_search_analytics_query: { site_url: "https://dnamusic.edu.co/", start_date: GENERIC.start_date, end_date: GENERIC.end_date, dimensions: ["query"], row_limit: 5 },
  gsc_sitemaps_list: { site_url: "https://dnamusic.edu.co/" },
  gsc_sites_list: {},
  gsc_sites_get: { site_url: "https://dnamusic.edu.co/" },
  gsc_url_inspection: { site_url: "https://dnamusic.edu.co/", inspection_url: "https://dnamusic.edu.co/" },
  gsc_url_bulk_inspection: { site_url: "https://dnamusic.edu.co/", inspection_urls: ["https://dnamusic.edu.co/"] },
  gsc_keyword_opportunities: { site_url: "https://dnamusic.edu.co/", start_date: GENERIC.start_date, end_date: GENERIC.end_date, min_impressions: 50 },
  gsc_search_analytics_compare: { site_url: "https://dnamusic.edu.co/", current_start: GENERIC.start_date, current_end: GENERIC.end_date, prior_start: new Date(Date.now() - 56 * 86400000).toISOString().slice(0, 10), prior_end: new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10) },
  gsc_site_health_report: { site_url: "https://dnamusic.edu.co/", days: 7 },
  gsc_indexing_coverage_report: { site_url: "https://dnamusic.edu.co/", sitemap_url: "https://dnamusic.edu.co/sitemap.xml" },
  gsc_rich_results_audit: { site_url: "https://dnamusic.edu.co/", inspection_urls: ["https://dnamusic.edu.co/"] },
  gsc_low_ctr_opportunities: { site_url: "https://dnamusic.edu.co/", start_date: GENERIC.start_date, end_date: GENERIC.end_date, min_impressions: 50 },
  gsc_url_indexing_status: { url: "https://dnamusic.edu.co/" },

  // GA4
  ga4_get_account_summaries: {},
  ga4_get_property_details: { property_id: "310251727" },
  ga4_list_google_ads_links: { property_id: "310251727" },
  ga4_get_custom_dimensions_and_metrics: { property_id: "310251727" },
  ga4_run_report: { property_id: "310251727", date_ranges: [{ start_date: GENERIC.start_date, end_date: GENERIC.end_date }], metrics: [{ name: "sessions" }], dimensions: [{ name: "date" }], limit: 5 },
  ga4_run_realtime_report: { property_id: "310251727", metrics: [{ name: "activeUsers" }] },
  ga4_organic_landing_pages: { property_id: "310251727", days: 7, limit: 5 },

  // PageSpeed
  pagespeed_analyze_url: { url: "https://dnamusic.edu.co/", strategy: "mobile" },
  pagespeed_bulk_urls: { urls: ["https://dnamusic.edu.co/"], strategy: "mobile" },

  // Bing
  bing_get_sites: {},
  bing_get_url_submission_quota: { site_url: "https://dnamusic.edu.co/" },

  // Wayback
  wayback_get_snapshots: { url: "dnamusic.edu.co", limit: 5 },
  wayback_get_closest: { url: "dnamusic.edu.co" },
  wayback_get_snapshot_content: { url: "dnamusic.edu.co", timestamp: "20231001000000" },
  wayback_diff_snapshots: { url: "dnamusic.edu.co", timestamp_a: "20230101000000", timestamp_b: "20231001000000" },

  // Schema
  schema_validate_url: { url: "https://dnamusic.edu.co/" },
  schema_extract_url: { url: "https://dnamusic.edu.co/" },
  schema_validate_snippet: { code: '{"@context":"https://schema.org","@type":"Organization","name":"DNA Music"}' },

  // HTTP utils
  redirect_chain_check: { url: "https://www.dnamusic.edu.co/" },
  http_headers_inspect: { url: "https://dnamusic.edu.co/" },
  http_robots_txt: { site_url: "https://dnamusic.edu.co/" },

  // Log analyzer
  log_file_analyze: { content: '127.0.0.1 - - [10/Oct/2023:13:55:36 +0000] "GET / HTTP/1.1" 200 1234 "-" "Mozilla/5.0"', top_n: 5 },

  // History
  history_keyword_ranking: { keyword: "dna music", domain: "dnamusic.edu.co", country_code: "co", days: 7 },
  history_domain_rankings: { domain: "dnamusic.edu.co", days: 7 },
  history_backlinks: { domain: "dnamusic.edu.co", weeks: 4 },
  history_llm_visibility: { target_value: "dnamusic.edu.co", weeks: 4 },
  history_traffic: { domain: "dnamusic.edu.co", days: 7 },
  keyword_universe_list: { domain: "dnamusic.edu.co", country_code: "co" },
  snapshot_runs_list: { limit: 5 },

  // Backlog
  backlog_list: { limit: 5 },
  backlog_stats: {},
  agent_runs_list: { limit: 5 },

  // Brand
  brand_dna_offer_summary: {},
  brand_dna_program: { id: "dj-profesional" },
  brand_map_keyword_to_program: { query: "dj profesional bogota" },
  brand_search_curriculum: { query: "produccion musical" },
  brand_seo_taxonomy: {},
  brand_generate_course_schema: { program_id: "dj-profesional" },

  // Playbook
  seo_workflow_playbook: { name: "list" },

  // Adlib (Apify-backed)
  adlib_meta_search: { search_terms: "dna music", country: "CO", max_items: 3 },
  adlib_google_search: { domain: "dnamusic.edu.co", region: "CO", max_items: 3 },
  adlib_tiktok_search: { keyword: "dna music", country: "CO", max_items: 3 },
  apify_run_actor: { actor_id: "apify/example-call", actor_input: {}, max_items: 1 },

  // Apify research
  local_google_maps_scraper: { keyword: "academia musica cali", location: "Cali, Colombia", country_code: "co", max_items: 3 },
  web_content_crawler: { start_urls: ["https://dnamusic.edu.co/"], max_items: 1, max_depth: 0 },
  social_instagram_scraper: { search: "dnamusicofficial", search_type: "user", results_type: "details", results_limit: 3, max_items: 3 },
  social_youtube_transcript: { video_urls: ["https://www.youtube.com/watch?v=dQw4w9WgXcQ"], max_items: 1 },
  apify_google_search_multi_engine: { queries: ["dna music"], country_code: "co", language_code: "es", max_pages_per_query: 1, include_ai_overview: true, include_chatgpt: false, include_perplexity: false, include_copilot: false, include_gemini: false, max_items: 3 },
  apify_link_prospecting_tool: { queries: ["academia dj bogota"], brand: "DNA Music", own_domains: ["dnamusic.edu.co"], max_items: 3 },
  apify_meta_brand_collaboration: { brand_query: "Nike", target: "instagram", start_date: "2026-02-01", end_date: "2026-04-02", results_limit: 2, max_items: 2 },
  apify_tripadvisor_lead_enrichment: { search: "music school bogota", item_types: ["attractions"], max_items: 2, maximum_leads_enrichment_records: 0, verify_leads_enrichment_emails: false },
  apify_mcp_connector_blueprint: { bundle: "research" },
  apify_mcp_connector_actor_schema: { connector_label: "DNA Music Research MCP", bundle: "research" },

  // Market research
  market_reddit_intelligence: { search_terms: ["dna music"], time_range: "month", max_items: 3, include_comments: false },
  market_news_monitor: { queries: ["dna music"], country: "co", language: "es", time_range: "7d", max_items: 3 },

  // Tiktok specific (already in market-research)
  social_tiktok_content: { hashtags: ["dnamusic"], country: "co", max_items: 3 },
  social_tiktok_comments: { video_urls: ["https://www.tiktok.com/@dnamusicofficial/video/0"], max_items: 3 },
};

// Tools to skip from live execution (mutation, needs-specific-input, quota)
const SKIP_LIVE = new Set([
  // Mutations
  "serp_google_organic_task_post",
  "onpage_task_post",
  "business_google_reviews_task_post",
  "merchant_amazon_products_task_post",
  "merchant_amazon_asin_task_post",
  "gsc_url_request_indexing",
  "gsc_url_cancel_indexing",
  "gsc_bulk_request_indexing",
  "gsc_sites_add",
  "gsc_sites_delete",
  "gsc_sitemaps_submit",
  "gsc_sitemaps_delete",
  "bing_submit_url",
  "bing_submit_url_batch",
  "keyword_universe_add",
  "keyword_universe_remove",
  "keyword_universe_set_core",
  "keyword_universe_set_active",
  "snapshot_run_now",
  "agent_run_now",
  "backlog_set_status",
  "backlog_add_note",
  "backlog_assign",
  "backlog_run_agent",
  "backlog_cleanup_slack",

  // Needs specific input we can't provide generically
  "serp_google_organic_tasks_ready",
  "serp_google_organic_task_get",
  "serp_youtube_video_info_live",
  "serp_youtube_video_subtitles_live",
  "serp_youtube_video_comments_live",
  "onpage_tasks_ready",
  "onpage_summary",
  "onpage_pages",
  "onpage_duplicate_tags",
  "onpage_duplicate_content",
  "onpage_links",
  "onpage_redirect_chains",
  "onpage_full_crawl_sync",
  "gsc_sitemaps_get",
  "agent_runs_get",
  "backlog_get",
  "serpapi_amazon_product",
  "serpapi_apple_app_store",
  "serpapi_google_lens",
  "serpapi_google_reverse_image",
  "serpapi_google_flights",
  "serpapi_google_hotels",
  "serpapi_google_patents",
  "serpapi_google_play",
  "serpapi_google_forums",
  "serpapi_tripadvisor_search",
  "serpapi_opentable_reviews",
  "serpapi_google_maps_reviews",
  "app_google_play_info",
  "business_google_my_business_info_live",
  "business_google_qanda_live",
  "business_google_hotel_searches_live",
  "bing_get_query_stats",
  "bing_get_page_stats",
  "bing_get_crawl_stats",
  "bing_get_url_info",

  // Clarity (quota 10/day)
  "clarity_live_insights",
  "clarity_traffic_overview",
  "clarity_traffic_by_source",
  "clarity_traffic_by_device",
  "clarity_traffic_by_page",
  "clarity_traffic_by_country",
  "clarity_traffic_by_channel",
]);

// ============================================================================
// MCP CLIENT
// ============================================================================

async function mcpCall(toolName, args, timeoutMs = 60000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: toolName, arguments: args },
      }),
      signal: controller.signal,
    });
    const text = await res.text();
    const duration = Date.now() - start;
    // Streamable HTTP wraps responses as `data: { ... }`
    const m = text.match(/data: (\{[\s\S]*\})/);
    if (!m) return { ok: false, error: "no_sse_data", raw: text.slice(0, 200), duration_ms: duration };
    const data = JSON.parse(m[1]);
    if (data.error) {
      return { ok: false, error: data.error.message ?? "rpc_error", error_code: data.error.code, duration_ms: duration };
    }
    const innerText = data.result?.content?.[0]?.text ?? "";
    let parsedInner = null;
    if (typeof innerText === "string" && innerText.length > 0) {
      try {
        parsedInner = JSON.parse(innerText);
        if (typeof parsedInner === "object" && parsedInner !== null) {
          // DataForSEO status_code 20000 = OK, 4xxxx = errors
          if (parsedInner.status_code && parsedInner.status_code >= 40000) {
            return { ok: false, error: `dataforseo_${parsedInner.status_code}: ${parsedInner.status_message ?? ""}`, duration_ms: duration };
          }
        }
      } catch { /* not JSON, just text */ }
    }
    return { ok: true, duration_ms: duration, response_size: text.length, payload: parsedInner ?? innerText };
  } catch (err) {
    return { ok: false, error: err.name === "AbortError" ? "timeout" : (err.message ?? String(err)), duration_ms: Date.now() - start };
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const tools = JSON.parse(readFileSync("/tmp/tool_inventory.json", "utf8"));
  const existing = existsSync(RESULTS_PATH) ? JSON.parse(readFileSync(RESULTS_PATH, "utf8")) : { results: {}, started_at: new Date().toISOString() };

  const total = tools.length;
  let done = 0;
  let pass = 0;
  let fail = 0;
  let skipped = 0;

  for (const tool of tools) {
    done++;
    const name = tool.name;
    if (existing.results[name]) {
      const prior = existing.results[name];
      if (prior.ok) pass++; else if (prior.skipped) skipped++; else fail++;
      continue;
    }

    if (SKIP_LIVE.has(name)) {
      existing.results[name] = { skipped: true, reason: "mutation_or_needs_input_or_quota", schema_ok: !!tool.inputSchema };
      skipped++;
      writeFileSync(RESULTS_PATH, JSON.stringify(existing, null, 2));
      continue;
    }

    const args = TOOL_DEFAULTS[name] ?? {};
    process.stderr.write(`[${done}/${total}] ${name} ... `);
    const result = await mcpCall(name, args);
    // Persist as baseline observation if successful (best-effort, doesn't block)
    let baselineId = null;
    if (result.ok && result.payload !== undefined) {
      try {
        const persistRes = await fetch(BASELINE_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-admin-token": ADMIN_TOKEN },
          body: JSON.stringify({ tool_name: name, args, result: result.payload }),
        });
        if (persistRes.ok) {
          const j = await persistRes.json();
          baselineId = j.observation_id;
        }
      } catch { /* non-fatal */ }
    }
    // Don't store the full payload in results.json (would be huge); just record metadata
    existing.results[name] = {
      ok: result.ok,
      error: result.error,
      duration_ms: result.duration_ms,
      response_size: result.response_size,
      baseline_observation_id: baselineId,
    };
    if (result.ok) {
      pass++;
      process.stderr.write(`OK (${result.duration_ms}ms)${baselineId ? ` obs#${baselineId}` : ""}\n`);
    } else {
      fail++;
      process.stderr.write(`FAIL: ${result.error}\n`);
    }
    writeFileSync(RESULTS_PATH, JSON.stringify(existing, null, 2));
  }

  console.log("\n=== SUMMARY ===");
  console.log(`Total tools:  ${total}`);
  console.log(`Pass:         ${pass}`);
  console.log(`Fail:         ${fail}`);
  console.log(`Skipped:      ${skipped}`);
  if (fail > 0) {
    console.log("\n=== FAILURES ===");
    for (const [name, r] of Object.entries(existing.results)) {
      if (!r.ok && !r.skipped) console.log(`  ${name}: ${r.error}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
