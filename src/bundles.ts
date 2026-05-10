// Tool bundle definitions for the MCP. Each bundle exposes a curated subset
// of the 242 tools so ChatGPT (and other clients with practical tool-count
// limits) can connect to a focused workflow without overwhelming the model.
//
// A tool can be in multiple bundles. The matcher uses regex prefix or exact
// name match. The 'full' bundle is the escape hatch — exposes everything.

export type BundleName = "research" | "seo" | "pauta" | "agent" | "full";

const BUNDLE_PATTERNS: Record<Exclude<BundleName, "full">, Array<RegExp | string>> = {
  // Market research + customer voice + AI visibility — the strategist toolkit
  research: [
    // GSC core
    /^gsc_search_analytics_query$/,
    /^gsc_keyword_opportunities$/,
    /^gsc_search_analytics_compare$/,
    /^gsc_site_health_report$/,
    /^gsc_url_inspection$/,
    /^gsc_sites_list$/,
    // Keyword + intent
    /^labs_google_top_searches$/,
    /^labs_google_keyword_ideas$/,
    /^labs_google_keyword_overview$/,
    /^labs_google_search_intent$/,
    /^labs_google_keyword_suggestions$/,
    /^keywords_google_trends_live$/,
    /^keywords_google_search_volume_live$/,
    // SERP + AI
    /^serp_google_organic_live$/,
    /^serp_google_news_live$/,
    /^serp_google_ai_mode_live$/,
    /^serpapi_google_news$/,
    /^serpapi_google_trends$/,
    /^ai_optimization_chatgpt_live$/,
    /^ai_optimization_perplexity_live$/,
    /^ai_optimization_claude_live$/,
    /^ai_optimization_gemini_live$/,
    /^ai_optimization_llm_mentions_search$/,
    /^ai_optimization_llm_mentions_top_domains$/,
    // Social + customer voice
    /^social_tiktok_content$/,
    /^social_tiktok_comments$/,
    /^social_instagram_scraper$/,
    /^social_youtube_transcript$/,
    /^market_news_monitor$/,
    /^market_reddit_intelligence$/,
    // Local + content crawl
    /^local_google_maps_scraper$/,
    /^web_content_crawler$/,
    // Ad library (creative intel useful for research)
    /^adlib_meta_search$/,
    /^adlib_google_search$/,
    /^adlib_tiktok_search$/,
    /^serp_google_ads_advertisers_live$/,
    // Brand + history + playbook
    /^brand_/,
    /^history_/,
    /^seo_workflow_playbook$/,
  ],

  // Technical SEO + on-page + indexation + content audits
  seo: [
    /^gsc_/,
    /^labs_google_/,
    /^backlinks_/,
    /^schema_/,
    /^http_/,
    /^redirect_/,
    /^onpage_/,
    /^pagespeed_/,
    /^bing_/,
    /^wayback_/,
    /^log_/,
    /^domain_/,
    /^content_analysis_/,
    /^history_/,
    /^keyword_universe_/,
    /^snapshot_/,
    /^brand_/,
    /^web_content_crawler$/,
    /^seo_workflow_playbook$/,
    /^seo_legacy_redirect_audit$/,
  ],

  // Competitive ads intelligence — for Maestro Pauta + research overlap
  pauta: [
    /^adlib_/,
    /^apify_run_actor$/,
    /^serp_google_ads_advertisers_live$/,
    /^serpapi_google_ads_transparency$/,
    /^social_tiktok_/,
    /^social_instagram_scraper$/,
    /^social_youtube_transcript$/,
    /^ai_optimization_/,
    /^market_news_monitor$/,
    /^local_google_maps_scraper$/,
    /^labs_google_competitors_domain$/,
    /^labs_google_serp_competitors$/,
    /^seo_workflow_playbook$/,
  ],

  // Agent operation: backlog, research briefs, agent runs, schemas, playbooks
  agent: [
    /^backlog_/,
    /^agent_runs_/,
    /^brand_/,
    /^history_/,
    /^seo_workflow_playbook$/,
    /^seo_legacy_redirect_audit$/,
    /^snapshot_/,
    /^keyword_universe_/,
  ],
};

export function isToolInBundle(toolName: string, bundle: BundleName): boolean {
  if (bundle === "full") return true;
  const patterns = BUNDLE_PATTERNS[bundle];
  if (!patterns) return false;
  for (const p of patterns) {
    if (typeof p === "string") {
      if (p === toolName) return true;
    } else {
      if (p.test(toolName)) return true;
    }
  }
  return false;
}

export function listBundles(): BundleName[] {
  return ["research", "seo", "pauta", "agent", "full"];
}

export function isValidBundle(s: string | undefined): s is BundleName {
  return s !== undefined && (["research", "seo", "pauta", "agent", "full"] as const).includes(s as BundleName);
}
