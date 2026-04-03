# SEO MCP Server - Documentation

## Connection

- **Endpoint**: `https://dataforseo-mcp-three.vercel.app/mcp`
- **Protocol**: MCP (Model Context Protocol) over Streamable HTTP
- **Mode**: Stateless (no session required)

## Overview

This MCP server provides **150 SEO and search tools** across 3 APIs:

1. **DataForSEO API** (88 tools) — SERP analysis, keyword research, backlinks, on-page audits, domain analytics, content analysis, AI optimization, business data, merchant data, and app data.
2. **SerpAPI** (38 tools) — Real-time search results from Google, Bing, YouTube, DuckDuckGo, Yahoo, Baidu, Naver, Yandex, Amazon, eBay, Walmart, Yelp, Tripadvisor, and more.
3. **Google Search Console** (9 tools) — Search analytics, URL inspection, sitemaps, and site management for verified properties.

---

## Tool Reference

### SERP API (DataForSEO) — Search Engine Results

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `serp_google_organic_live` | Google organic SERP results in real-time | `keyword`, `location_code?`, `language_code?`, `device?`, `depth?` |
| `serp_google_organic_task_post` | Create async SERP task | `keyword`, `location_code?`, `language_code?` |
| `serp_google_organic_tasks_ready` | Check which async tasks are ready | _(none)_ |
| `serp_google_organic_task_get` | Get async task results | `task_id` |
| `serp_google_maps_live` | Google Maps local results | `keyword`, `location_code?`, `language_code?`, `depth?` |
| `serp_google_news_live` | Google News results | `keyword`, `location_code?`, `language_code?` |
| `serp_google_images_live` | Google Images results | `keyword`, `location_code?`, `language_code?`, `depth?` |
| `serp_google_autocomplete_live` | Google Autocomplete suggestions | `keyword`, `location_code?`, `language_code?` |
| `serp_google_ai_mode_live` | Google AI Mode (AI Overview) results | `keyword`, `location_code?`, `language_code?` |
| `serp_google_jobs_live` | Google Jobs listings | `keyword`, `location_code?`, `language_code?` |
| `serp_google_events_live` | Google Events results | `keyword`, `location_code?`, `language_code?` |
| `serp_google_finance_explore_live` | Google Finance market overview | `keyword?`, `location_code?`, `language_code?` |
| `serp_google_finance_quote_live` | Google Finance stock quote | `keyword` (ticker symbol) |
| `serp_google_ads_advertisers_live` | Google Ads Transparency Center | `keyword`, `location_code?`, `language_code?` |
| `serp_bing_organic_live` | Bing organic results | `keyword`, `location_code?`, `language_code?`, `depth?` |

### SERP API — YouTube

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `serp_youtube_organic_live` | YouTube video search | `keyword`, `location_code?`, `language_code?`, `depth?` |
| `serp_youtube_video_info_live` | Detailed YouTube video info | `video_id` |
| `serp_youtube_video_subtitles_live` | YouTube video subtitles/captions | `video_id`, `subtitle_language?` |
| `serp_youtube_video_comments_live` | YouTube video comments | `video_id`, `depth?` |

### Keywords Data API (DataForSEO)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `keywords_google_search_volume_live` | Google Ads search volume for keywords | `keywords[]`, `location_code?`, `language_code?`, `date_from?`, `date_to?` |
| `keywords_google_keywords_for_site_live` | Keyword ideas for a domain | `target` (domain), `location_code?`, `language_code?` |
| `keywords_google_keywords_for_keywords_live` | Related keyword suggestions from seeds | `keywords[]`, `location_code?`, `language_code?` |
| `keywords_google_ad_traffic_live` | Estimated ad traffic for keywords | `keywords[]`, `location_code?`, `language_code?`, `bid?` |
| `keywords_google_trends_live` | Google Trends interest data | `keywords[]`, `location_code?`, `language_code?`, `type?`, `date_from?`, `date_to?` |
| `keywords_clickstream_search_volume_live` | Clickstream-based search volume | `keywords[]`, `location_code?`, `language_code?` |
| `keywords_bing_search_volume_live` | Bing search volume | `keywords[]`, `location_code?`, `language_code?` |

### DataForSEO Labs — Keyword Research

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `labs_google_keyword_suggestions` | Keyword suggestions from seed | `keyword`, `location_code?`, `language_code?`, `limit?` |
| `labs_google_keyword_ideas` | Keyword ideas from seed | `keyword`, `location_code?`, `language_code?`, `limit?` |
| `labs_google_related_keywords` | Related keywords | `keyword`, `location_code?`, `language_code?`, `limit?` |
| `labs_google_keyword_overview` | Keyword metrics (volume, difficulty, CPC) | `keywords[]`, `location_code?`, `language_code?` |
| `labs_google_bulk_keyword_difficulty` | Bulk keyword difficulty scores | `keywords[]`, `location_code?`, `language_code?` |
| `labs_google_search_intent` | Detect search intent for keywords | `keywords[]`, `location_code?`, `language_code?` |
| `labs_google_keywords_for_site` | All keywords a domain ranks for | `target` (domain), `location_code?`, `language_code?`, `limit?` |
| `labs_google_historical_keyword_data` | Historical search volume | `keywords[]`, `location_code?`, `language_code?` |
| `labs_google_top_searches` | Trending searches for a location | `location_code?`, `language_code?`, `limit?` |

### DataForSEO Labs — Competitor Research

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `labs_google_ranked_keywords` | All keywords a domain ranks for with positions | `target` (domain), `location_code?`, `language_code?`, `limit?`, `order_by?` |
| `labs_google_serp_competitors` | SERP competitors for keywords | `keywords[]`, `location_code?`, `language_code?`, `limit?` |
| `labs_google_competitors_domain` | Competitor domains | `target`, `location_code?`, `language_code?`, `limit?` |
| `labs_google_domain_intersection` | Keyword overlap between domains | `targets` (object: {"1":"domain1","2":"domain2"}), `location_code?`, `language_code?`, `limit?` |
| `labs_google_domain_rank_overview` | Domain rank metrics | `target`, `location_code?`, `language_code?` |
| `labs_google_subdomains` | Subdomain rankings | `target`, `location_code?`, `language_code?`, `limit?` |
| `labs_google_relevant_pages` | Most relevant pages of a domain | `target`, `location_code?`, `language_code?`, `limit?` |
| `labs_google_bulk_traffic_estimation` | Estimated traffic for multiple domains | `targets[]`, `location_code?`, `language_code?` |
| `labs_google_historical_serps` | Historical SERP data | `keyword`, `location_code?`, `language_code?`, `date_from?`, `date_to?` |

### Backlinks API (DataForSEO)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `backlinks_summary` | Backlink summary (total backlinks, referring domains, rank) | `target`, `include_subdomains?` |
| `backlinks_list` | List of backlinks | `target`, `limit?`, `offset?`, `include_subdomains?`, `mode?` |
| `backlinks_referring_domains` | Referring domains list | `target`, `limit?`, `include_subdomains?` |
| `backlinks_anchors` | Anchor text distribution | `target`, `limit?`, `include_subdomains?` |
| `backlinks_history` | Historical backlink data | `target`, `date_from?`, `date_to?` |
| `backlinks_competitors` | Backlink competitors | `target`, `limit?` |
| `backlinks_domain_intersection` | Common backlinks between domains | `targets` (object), `limit?` |
| `backlinks_bulk_ranks` | Bulk rank data for domains | `targets[]` |
| `backlinks_bulk_spam_score` | Spam score for domains | `targets[]` |
| `backlinks_domain_pages` | Pages with backlink metrics | `target`, `limit?` |
| `backlinks_timeseries_summary` | Backlink time series | `target`, `date_from?`, `date_to?` |

### OnPage API (DataForSEO)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `onpage_task_post` | Start a website crawl | `target` (URL), `max_crawl_pages?`, `enable_javascript?` |
| `onpage_tasks_ready` | Check ready crawl tasks | _(none)_ |
| `onpage_summary` | Crawl summary | `task_id` |
| `onpage_pages` | Crawled pages data | `task_id`, `limit?` |
| `onpage_duplicate_tags` | Duplicate title/description tags | `task_id` |
| `onpage_duplicate_content` | Duplicate content pages | `task_id` |
| `onpage_links` | Link data from crawl | `task_id`, `limit?` |
| `onpage_redirect_chains` | Redirect chains | `task_id` |
| `onpage_lighthouse_live` | Google Lighthouse audit (real-time) | `url`, `for_mobile?`, `categories?` |
| `onpage_content_parsing_live` | Parse/extract content from URL | `url` |
| `onpage_instant_pages` | Instant on-page analysis | `url`, `enable_javascript?` |

### Domain Analytics (DataForSEO)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `domain_technologies` | Detect technologies (CMS, frameworks) | `target` |
| `domain_technologies_domains_by_technology` | Find domains using a technology | `technology`, `limit?` |
| `domain_whois` | WHOIS information | `target` |

### Content Analysis (DataForSEO)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `content_analysis_search` | Search content with sentiment data | `keyword`, `page_type?`, `limit?` |
| `content_analysis_summary` | Content analysis summary | `keyword` |
| `content_analysis_sentiment` | Sentiment analysis | `keyword` |
| `content_analysis_rating_distribution` | Rating distribution | `keyword` |
| `content_analysis_phrase_trends` | Phrase trends over time | `keyword` |

### AI Optimization (DataForSEO)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `ai_optimization_llm_mentions_search` | Search LLM mentions of a domain/keyword | `domain?`, `keyword?`, `location_code?`, `language_code?`, `platform?`, `limit?` |
| `ai_optimization_llm_mentions_top_domains` | Top domains mentioned by LLMs | `keywords[]`, `location_code?`, `language_code?` |
| `ai_optimization_chatgpt_live` | Get ChatGPT response (reasoning auto-applied, includes reasoning chain) | `prompt` |
| `ai_optimization_claude_live` | Get Claude response with optional reasoning mode | `prompt`, `use_reasoning?` |
| `ai_optimization_gemini_live` | Get Gemini response with optional reasoning mode | `prompt`, `use_reasoning?` |
| `ai_optimization_perplexity_live` | Get Perplexity response | `prompt` |

### Business Data (DataForSEO)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `business_listings_search` | Search business listings | `keyword?`, `categories?`, `location_code?`, `limit?` |
| `business_google_my_business_info_live` | Google My Business info | `keyword`, `location_code?`, `language_code?` |
| `business_google_reviews_task_post` | Google business reviews | `keyword`, `location_code?`, `language_code?`, `depth?` |
| `business_google_hotel_searches_live` | Google Hotels search | `keyword`, `check_in?`, `check_out?`, `location_code?` |
| `business_google_qanda_live` | Google Q&A for a business | `keyword`, `location_code?`, `language_code?` |
| `business_social_media_pinterest` | Pinterest metrics for URLs | `targets[]` |
| `business_social_media_reddit` | Reddit metrics for URLs | `targets[]` |

### Merchant & App Data (DataForSEO)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `merchant_google_products_live` | Google Shopping products | `keyword`, `location_code?`, `language_code?`, `depth?` |
| `merchant_amazon_products_task_post` | Amazon product search | `keyword`, `location_code?`, `language_code?` |
| `merchant_amazon_asin_task_post` | Amazon product by ASIN | `asin`, `location_code?` |
| `app_google_play_search` | Google Play app search | `keyword`, `location_code?`, `language_code?` |
| `app_google_play_info` | Google Play app details | `app_id`, `location_code?` |
| `app_apple_search` | Apple App Store search | `keyword`, `location_code?`, `language_code?` |

### Utility (DataForSEO)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `appendix_user_data` | Account data (balance, limits) | _(none)_ |
| `appendix_locations` | Available location codes | _(none)_ |
| `appendix_categories` | Available categories | _(none)_ |

---

## SerpAPI Tools (38 tools)

All SerpAPI tools return real-time search results from various engines.

### Google Services

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `serpapi_google_search` | Google Search | `q`, `location?`, `gl?`, `hl?`, `num?`, `start?`, `device?` |
| `serpapi_google_ai_mode` | Google AI Mode | `q`, `location?`, `gl?`, `hl?` |
| `serpapi_google_images` | Google Images | `q`, `location?`, `gl?`, `hl?`, `device?` |
| `serpapi_google_maps` | Google Maps | `q`, `ll?`, `location?`, `gl?`, `hl?`, `type?` |
| `serpapi_google_maps_reviews` | Google Maps Reviews | `place_id?`, `data_id?`, `hl?`, `sort_by?` |
| `serpapi_google_news` | Google News | `q`, `location?`, `gl?`, `hl?` |
| `serpapi_google_shopping` | Google Shopping | `q`, `location?`, `gl?`, `hl?`, `tbs?` |
| `serpapi_google_jobs` | Google Jobs | `q`, `location?`, `gl?`, `hl?` |
| `serpapi_google_scholar` | Google Scholar | `q`, `hl?`, `as_ylo?`, `as_yhi?`, `start?` |
| `serpapi_google_trends` | Google Trends | `q`, `data_type?`, `date?`, `geo?`, `cat?`, `hl?` |
| `serpapi_google_lens` | Google Lens (image search) | `url`, `hl?`, `gl?` |
| `serpapi_google_flights` | Google Flights | `departure_id`, `arrival_id`, `outbound_date`, `return_date?`, `type?`, `travel_class?`, `adults?` |
| `serpapi_google_hotels` | Google Hotels | `q`, `check_in_date`, `check_out_date`, `gl?`, `hl?`, `adults?` |
| `serpapi_google_finance` | Google Finance | `q` (ticker, e.g. "GOOG:NASDAQ"), `hl?`, `gl?` |
| `serpapi_google_autocomplete` | Google Autocomplete | `q`, `gl?`, `hl?` |
| `serpapi_google_events` | Google Events | `q`, `location?`, `gl?`, `hl?` |
| `serpapi_google_patents` | Google Patents | `q`, `hl?` |
| `serpapi_google_play` | Google Play Store | `q`, `gl?`, `hl?`, `store?` |
| `serpapi_google_related_questions` | People Also Ask | `q`, `location?`, `gl?`, `hl?` |
| `serpapi_google_ads_transparency` | Ads Transparency Center | `q`, `gl?`, `hl?` |
| `serpapi_google_local_services` | Local Services | `q`, `place_id?`, `location?`, `gl?`, `hl?` |
| `serpapi_google_videos` | Google Videos | `q`, `location?`, `gl?`, `hl?` |
| `serpapi_google_forums` | Google Forums/Discussions | `q`, `location?`, `gl?`, `hl?` |
| `serpapi_google_reverse_image` | Reverse Image Search | `image_url`, `gl?`, `hl?` |
| `serpapi_google_travel_explore` | Google Travel | `q`, `hl?`, `gl?` |

### Other Search Engines

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `serpapi_youtube_search` | YouTube | `search_query`, `gl?`, `hl?` |
| `serpapi_bing_search` | Bing | `q`, `location?`, `mkt?`, `cc?`, `device?`, `first?` |
| `serpapi_bing_images` | Bing Images | `q`, `mkt?`, `cc?` |
| `serpapi_bing_copilot` | Bing Copilot (AI) | `q`, `mkt?` |
| `serpapi_yahoo_search` | Yahoo | `p`, `vl?`, `vc?` |
| `serpapi_duckduckgo_search` | DuckDuckGo | `q`, `kl?` |
| `serpapi_baidu_search` | Baidu | `q` |
| `serpapi_naver_search` | Naver | `query` |
| `serpapi_yandex_search` | Yandex | `text`, `lr?` |
| `serpapi_brave_ai_mode` | Brave AI | `q` |

### E-commerce & Reviews

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `serpapi_amazon_search` | Amazon Products | `k`, `amazon_domain?` |
| `serpapi_amazon_product` | Amazon Product Details | `product_id` (ASIN), `amazon_domain?` |
| `serpapi_walmart_search` | Walmart Products | `query` |
| `serpapi_ebay_search` | eBay Products | `_nkw`, `ebay_domain?` |
| `serpapi_home_depot_search` | Home Depot Products | `q` |
| `serpapi_apple_app_store` | Apple App Store | `term`, `country?` |
| `serpapi_facebook_profile` | Facebook Pages | `q` |
| `serpapi_yelp_search` | Yelp Businesses | `find_desc`, `find_loc` |
| `serpapi_tripadvisor_search` | Tripadvisor | `q` |
| `serpapi_opentable_reviews` | OpenTable Reviews | `restaurant_id` |

---

## Google Search Console Tools (9 tools)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `gsc_search_analytics_query` | Query search traffic data (clicks, impressions, CTR, position) | `site_url`, `start_date`, `end_date`, `dimensions?`, `search_type?`, `row_limit?`, `dimension_filter_groups?` |
| `gsc_sitemaps_list` | List submitted sitemaps | `site_url` |
| `gsc_sitemaps_get` | Get specific sitemap info | `site_url`, `feedpath` |
| `gsc_sitemaps_submit` | Submit a sitemap | `site_url`, `feedpath` |
| `gsc_sitemaps_delete` | Remove a sitemap | `site_url`, `feedpath` |
| `gsc_sites_list` | List all GSC properties | _(none)_ |
| `gsc_sites_get` | Get site info | `site_url` |
| `gsc_sites_add` | Add a site | `site_url` |
| `gsc_url_inspection` | Inspect URL index status | `inspection_url`, `site_url`, `language_code?` |

---

## Common Parameters

### Location Codes (most used)
| Code | Country |
|------|---------|
| 2840 | United States |
| 2170 | Colombia |
| 2484 | Mexico |
| 2724 | Spain |
| 2076 | Brazil |
| 2826 | United Kingdom |
| 2124 | Canada |
| 2032 | Argentina |
| 2604 | Peru |
| 2152 | Chile |

### Language Codes
`en`, `es`, `pt`, `fr`, `de`, `it`, `ja`, `ko`, `zh`, `ru`

### Default Values
- `location_code`: 2840 (US) unless specified
- `language_code`: "en" unless specified
- `device`: "desktop" unless specified
- `depth`/`limit`: varies by tool (typically 20-100)

---

## Usage Tips

1. **For keyword research workflows**: Start with `labs_google_keyword_suggestions` or `labs_google_keyword_ideas`, then validate with `keywords_google_search_volume_live`, and check difficulty with `labs_google_bulk_keyword_difficulty`.

2. **For competitor analysis**: Use `labs_google_competitors_domain` to find competitors, `labs_google_domain_intersection` for keyword gaps, and `labs_google_ranked_keywords` for their top keywords.

3. **For backlink analysis**: Start with `backlinks_summary` for overview, then drill into `backlinks_list` and `backlinks_referring_domains`.

4. **For technical SEO audits**: Use `onpage_lighthouse_live` for quick audits, or `onpage_task_post` + `onpage_summary` for full crawls.

5. **For AI/LLM visibility**: Use `ai_optimization_llm_mentions_search` to see where a domain appears in AI answers.

6. **For Google Search Console data**: Use `gsc_search_analytics_query` with dimensions like `["query","page","date"]` for detailed traffic analysis. The `site_url` for dnamusic.edu.co is `https://dnamusic.edu.co/`.

7. **SerpAPI vs DataForSEO SERP**: Both provide SERP data. SerpAPI is simpler for quick searches across many engines. DataForSEO provides richer structured data and async task support.

8. **For Colombia**: Use `location_code: 2170` and `language_code: "es"`.
