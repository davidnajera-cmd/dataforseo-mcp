# SEO MCP Server - Documentation

## Connection

- **Endpoint**: `https://dataforseo-mcp-three.vercel.app/mcp`
- **Protocol**: MCP (Model Context Protocol) over Streamable HTTP
- **Mode**: Stateless (no session required)

## ⚠ Freshness contract

**Read this before answering any time-sensitive question.** SEO data changes by the hour: rankings move, indexation flips, traffic shifts, schema breaks. Acting on stale information here can recommend exactly the wrong fix.

- **Do not reuse tool outputs from earlier turns** as if they were current. A previous tool call is a snapshot from that moment, not the state of the world now.
- **Re-call relevant tools at the start of any new analysis or recommendation.** If you're about to claim "the page is X / the keyword ranks at Y / the property has Z", that fact must come from a tool call made in the current turn.
- **The MCP server caches OAuth tokens, never data.** Each tool call hits the upstream API live (Google, DataForSEO, SerpAPI, Clarity, Bing, etc.).
- **The only tools that return historical/cached data by design** are the `history_*` family (Postgres time-series) and `snapshot_runs_list`. Everything else is live at request time.
- **Especially time-sensitive (always re-call):** `gsc_url_inspection`, `gsc_search_analytics_query`, `gsc_sitemaps_get`, `pagespeed_analyze_url`, `onpage_lighthouse_live`, `schema_validate_url`, `http_headers_inspect`, `redirect_chain_check`, `ai_optimization_*_live`, `gsc_sites_list`.

If your only source for a claim is a tool result from an earlier turn, you are violating this contract. Re-call.

## Overview

This MCP server provides **190+ SEO and search tools** across 10 APIs:

1. **DataForSEO API** (89 tools) — SERP analysis, keyword research, backlinks, on-page audits, domain analytics, content analysis, AI optimization, business data, merchant data, and app data.
2. **SerpAPI** (38 tools) — Real-time search results from Google, Bing, YouTube, DuckDuckGo, Yahoo, Baidu, Naver, Yandex, Amazon, eBay, Walmart, Yelp, Tripadvisor, and more.
3. **Google Search Console** (9 tools) — Search analytics, URL inspection, sitemaps, and site management for verified properties.
4. **Microsoft Clarity** (7 tools) — Traffic analytics, UX metrics (dead clicks, rage clicks, scroll depth), device/browser/country breakdowns, and channel performance.
5. **Bing Webmaster Tools** (8 tools) — Sites, query/page stats, crawl errors, URL submission and quota.
6. **Wayback Machine** (4 tools) — Historical snapshots, closest-snapshot lookup, raw HTML, snapshot diffs.
7. **Schema markup** (3 tools) — Validation via validator.schema.org and on-page extraction (JSON-LD, microdata, meta).
8. **HTTP utilities** (3 tools) — Ad-hoc redirect chain follower, header inspector, robots.txt parser.
9. **Log file analyzer** (1 tool) — Parses Common/Combined Log Format, surfaces top 404s, bot hits, status distribution.
10. **Historical persistence** (12 tools) — Daily cron captures rankings, traffic, backlinks (weekly), LLM mentions (weekly) into Neon Postgres. Time-series tools for trend analysis.

Plus a synchronous OnPage crawl wrapper (`onpage_full_crawl_sync`) that orchestrates `task_post` → poll → `summary` + `pages` in one call.

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

### `site_url` parameter — read this before any GSC call

GSC accepts **two property formats** that return **different datasets**:

| Format | Example | Captures |
|---|---|---|
| **URL-prefix** | `https://dnamusic.edu.co/` | Only URLs with that exact prefix. Excludes www, http, subdomains. |
| **Domain** | `sc-domain:dnamusic.edu.co` | Apex + www + http + https + **all** subdomains. Strict superset. |

When to use each:
- **Post-migration audits / pre-vs-post comparisons** → use `sc-domain:` (catches the www era + apex era together; URL-prefix `https://...` undercounts pre-migration data that lived on www).
- **Current-site-only analysis when host is stable** → URL-prefix is fine.
- **URL Inspection of a specific URL** → either works; prefer Domain for full coverage.

A newly verified Domain property takes **24–72h to backfill data**. Until then it returns empty rows even if the URL-prefix has data — fall back to URL-prefix during the backfill window.

Always call `gsc_sites_list` first to see which property formats the connected account has access to. **Don't guess** — copy the literal `siteUrl` string from that response.

For dnamusic.edu.co specifically, both formats are verified (URL-prefix `https://dnamusic.edu.co/` and Domain `sc-domain:dnamusic.edu.co`). Default to the Domain variant for any analysis spanning the WP→Next migration cutover (~Nov 2025).

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

## Market Research Tools (4 tools, Colombia-first)

Customer voice + news monitoring + TikTok organic content. Defaults `country=co`, `language=es`. **Primary signal for DNA's gen-Z Colombian audience: TikTok comments + Instagram comments**, NOT Reddit (Reddit usage is low in LATAM).

| Tool | Description | Default actor |
|------|-------------|---------------|
| `social_tiktok_content` | TikTok organic videos by hashtag/profile/keyword | `clockworks/tiktok-scraper` |
| `social_tiktok_comments` | Comments on specific TikTok videos — PRIMARY customer voice for Colombia | `apidojo/tiktok-comments-scraper` |
| `market_reddit_intelligence` | Reddit posts/comments — secondary for Colombia, primary for English-language nichos | `trudax/reddit-scraper-lite` |
| `market_news_monitor` | Google News for brand/category/regulatory tracking (El Tiempo, Semana, Shock, etc.) | `data_xplorer/google-news-scraper-fast` |

**Customer voice priority order for DNA Music in Colombia:**
1. **TikTok comments** (`social_tiktok_comments`) — gen-Z lives here, strongest signal
2. **Instagram comments** (`social_instagram_scraper` with `results_type=comments`)
3. **Google Maps reviews** (`local_google_maps_scraper` with `include_reviews=true`)
4. **Reddit** (`market_reddit_intelligence`) — secondary, mostly English-language nichos
5. **News** (`market_news_monitor`) — for category/brand mentions, not direct customer voice

**Channels NOT wrapped (intentional):**
- **Discord public channels** — Apify has actors but Discord ToS heavily restricts scraping. Use `apify_run_actor` with caution.
- **Facebook groups** — ToS forbids scraping; available actors are risky and frequently broken.
- **WhatsApp groups** — closed/encrypted by design. Not scrapable. The closest signal is `apify/whatsapp-message-scraper` for public WhatsApp Business catalog only.

If a need emerges to monitor these, use `apify_run_actor` directly with explicit ToS awareness.

---

## Apify Research Tools (4 tools)

Beyond ad libraries: opinionated wrappers for the 4 recurring DNA SEO/marketing workflows. All Apify-backed, all configurable via runtime variables.

| Tool | Description | Default actor |
|------|-------------|---------------|
| `local_google_maps_scraper` | Local SEO competitive scan: places by keyword + city, GBP completeness, ratings | `compass/crawler-google-places` |
| `web_content_crawler` | Crawl websites and extract clean Markdown (Wayback recovery, competitor blog audits) | `apify/website-content-crawler` |
| `social_instagram_scraper` | IG public data: profiles, posts, hashtags, places, comments | `apify/instagram-scraper` |
| `social_youtube_transcript` | YouTube transcripts (preferred over channel-scraper — text is what SEO/LLM analysis needs) | `happitap/youtube-transcript-scraper` |

## Curated actor catalog for `apify_run_actor`

For everything else, use `apify_run_actor` with one of these. Look up the input schema on the actor's page on apify.com/store.

**SEO competitive intelligence:**
- `pro100chok/semrush-scraper` — Semrush domain analytics without paying the API
- `gordian/builtwith-domain-scraper` — competitor tech stack
- `happitap/subdomain-finder` — discover hidden subdomains
- `radeance/ahrefs-scraper` / `radeance/semrush-scraper` / `radeance/similarweb-scraper` — alternatives

**Social signal expansion (use when you need more than the 4 wrappers):**
- `apify/instagram-reel-scraper` — reels with captions/transcripts
- `apify/instagram-hashtag-scraper` — hashtag trend tracking
- `apify/instagram-post-scraper` — post-level only (lighter than full IG scraper)
- `apify/facebook-posts-scraper` (68K, 4.5) — organic FB posts (NOT ads — for that use `adlib_meta_search`)
- `clockworks/tiktok-profile-scraper` (24K, 4.9) — TikTok profile + posts
- `clockworks/tiktok-scraper` (174K, 4.7) — TikTok by hashtag/URL/search
- `apidojo/tiktok-comments-scraper` — comments for sentiment analysis
- `apidojo/tweet-scraper` (54K, 4.0) — Twitter/X, $0.40/1000 tweets

**Reviews & reputation:**
- `compass/Google-Maps-Reviews-Scraper` (38K, 4.8) — focused review extraction with deeper data than `local_google_maps_scraper`'s include_reviews
- `nikita-sviridenko/trustpilot-reviews-scraper` (free) — Trustpilot
- `lukaskrivka/google-maps-with-contact-details` — Maps + scrapes the website for emails

**Content:**
- `benthepythondev/newsletter-scraper` — Substack/Beehiiv/Ghost newsletters (instructor newsletters, competitor content)
- `topaz_sharingan/Youtube-Transcript-Scraper-1` — alternative YT transcript actor

**SERP alternatives (already covered by DataForSEO + SerpAPI; only use for fallback):**
- `apify/google-search-scraper` (122K, 4.8)
- `scraperlink/google-search-results-serp-scraper` ($0.05/1K results — cheapest)
- `tri_angle/bing-search-scraper`

**NOT recommended for DNA** (out of scope but technically available): LinkedIn profile/jobs scrapers, Indeed, Realtor, Zillow, Booking, Zomato, Skip Trace, Lead Finder, Contact Details Scraper. If a use case appears, run via `apify_run_actor` directly — but most are sales/recruitment tools that don't compound SEO insight.

---

## Ads Library Tools (4 tools, Apify-backed)

Cross-platform competitive ads research. The official APIs (Meta, Google, TikTok) are gated to EU-only research access — these tools bypass that by calling Apify scrapers, so they work for LATAM. **Pay-per-result via Apify** — keep `max_items` tight unless doing intentional bulk pulls.

Setup: configure `APIFY_API_TOKEN` (https://console.apify.com/account/integrations). Optionally override actor IDs via `APIFY_ACTOR_META_ADLIB`, `APIFY_ACTOR_GOOGLE_ADLIB`, `APIFY_ACTOR_TIKTOK_ADLIB` if you find a better actor in the Apify Store than the defaults.

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `adlib_meta_search` | Meta (FB+IG) ad library — full creatives by search/page/country | `search_terms?`, `page_ids?`, `country?`, `ad_type?`, `ad_active_status?`, `max_items?` |
| `adlib_google_search` | Google Ads Transparency Center creatives by advertiser | `advertiser_id?`, `domain?`, `region?`, `ad_format?`, `date_range_start?`, `date_range_end?`, `max_items?` |
| `adlib_tiktok_search` | TikTok Commercial Content Library | `advertiser_name?`, `keyword?`, `country?`, `max_items?` |
| `apify_run_actor` | Escape hatch: run any Apify actor by ID with arbitrary input | `actor_id`, `actor_input`, `max_items?`, `timeout_ms?` |

**Recommended workflow for ads research:**

1. Discovery: `serp_google_ads_advertisers_live` with `keyword` + `location_code=2170` (CO) → returns competitors with `advertiser_id`.
2. Creative-level pull: `adlib_google_search` with the `advertiser_id` from step 1 → returns actual ad units.
3. Cross-platform: `adlib_meta_search` + `adlib_tiktok_search` with the same brand for FB/IG/TikTok creative coverage.

**Cost note**: each Apify call charges based on the actor's pricing model — usually $0.05–$0.50 per run depending on result count. Monitor at https://console.apify.com/billing.

---

## Microsoft Clarity Tools (7 tools)

All Clarity tools use the Data Export API with Bearer token authentication. Max 10 API requests per project per day. Data is limited to the last 1-3 days.

**Authentication**: Requires `CLARITY_API_TOKEN` environment variable (JWT token generated from Clarity project Settings > Data Export).

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `clarity_live_insights` | Flexible dashboard data export with up to 3 custom dimensions | `num_of_days` (1/2/3), `dimension1?`, `dimension2?`, `dimension3?` |
| `clarity_traffic_overview` | Traffic overview without breakdowns (totals only) | `num_of_days?` |
| `clarity_traffic_by_source` | Traffic by Source, Medium, and Campaign | `num_of_days?` |
| `clarity_traffic_by_device` | Traffic by Device, Browser, and OS | `num_of_days?` |
| `clarity_traffic_by_page` | Traffic by URL/page | `num_of_days?` |
| `clarity_traffic_by_country` | Traffic by Country/Region | `num_of_days?` |
| `clarity_traffic_by_channel` | Traffic by Channel (organic, paid, social, etc.) | `num_of_days?` |

### Available Dimensions
`Browser`, `Device`, `Country`, `OS`, `Source`, `Medium`, `Campaign`, `Channel`, `URL`

### Metrics Returned
Traffic (sessions, bot sessions, users, pages/session), Scroll Depth, Engagement Time, Popular Pages, Dead Click Count, Rage Click Count, Quickback Click, Excessive Scroll, Script Error Count, Error Click Count

---

## Bing Webmaster Tools (8 tools)

Authentication: API key in `BING_WEBMASTER_API_KEY` (Bing Webmaster Tools → Settings → API access).

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `bing_get_sites` | List sites verified in Bing | _(none)_ |
| `bing_get_query_stats` | Clicks/impressions/avg position by query (last 6 months) | `site_url` |
| `bing_get_page_stats` | Same metrics by page | `site_url` |
| `bing_get_crawl_stats` | Crawl errors, indexed pages, pages crawled | `site_url` |
| `bing_get_url_info` | Index status for a single URL | `site_url`, `url` |
| `bing_submit_url` | Submit one URL for indexing | `site_url`, `url` |
| `bing_submit_url_batch` | Submit up to 500 URLs | `site_url`, `urls[]` |
| `bing_get_url_submission_quota` | Remaining daily/monthly quota | `site_url` |

---

## Wayback Machine (4 tools)

No authentication. Public Internet Archive APIs.

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `wayback_get_snapshots` | List archived snapshots via CDX | `url`, `from?` (YYYYMMDD), `to?`, `limit?`, `match_type?`, `filter_status?` |
| `wayback_get_closest` | Snapshot closest to a date | `url`, `timestamp?` |
| `wayback_get_snapshot_content` | Raw HTML of a specific snapshot | `url`, `timestamp`, `max_chars?` |
| `wayback_diff_snapshots` | Diff title/meta/h1/length between two snapshots | `url`, `timestamp_a`, `timestamp_b` |

---

## Schema markup (3 tools)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `schema_validate_url` | Validate via validator.schema.org | `url` |
| `schema_extract_url` | Extract JSON-LD blocks, microdata itemtypes, meta tags, canonical, title | `url` |
| `schema_validate_snippet` | Validate raw JSON-LD snippet | `code` |

---

## HTTP utilities (3 tools)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `redirect_chain_check` | Manually follow redirects, hop-by-hop detail | `url`, `method?`, `max_hops?`, `user_agent?` |
| `http_headers_inspect` | Headers + SEO signals without following redirects | `url`, `method?`, `user_agent?` |
| `http_robots_txt` | Fetch and parse robots.txt | `site_url` |

---

## Log file analyzer (1 tool)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `log_file_analyze` | Parse Common/Combined Log Format and surface top 404s, top hits, status distribution, top user agents, SEO bot activity | `content?`, `url?`, `top_n?` |

---

## Workflow wrappers (extras)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `onpage_full_crawl_sync` | Synchronous wrapper: posts crawl, polls until ready, returns summary + pages | `target`, `max_crawl_pages?`, `enable_javascript?`, `max_wait_seconds?`, `poll_interval_seconds?`, `pages_limit?` |

---

## Historical persistence (12 tools)

Time-series snapshots stored in Neon Postgres. A daily Vercel cron at 06:00 UTC captures rankings + traffic; on Mondays it also captures backlinks, LLM visibility, and auto-expands the keyword universe from GSC top queries. Auth: `CRON_SECRET` runtime variable.

**Tables created automatically:** `seo_keyword_universe`, `seo_keyword_rankings`, `seo_backlink_snapshots`, `seo_llm_visibility`, `seo_traffic_daily`, `seo_snapshot_runs`.

### Universe management

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `keyword_universe_list` | List tracked keywords | `domain?`, `country_code?`, `is_core?`, `source?`, `active_only?` |
| `keyword_universe_add` | Add keywords (idempotent) | `keywords[]`, `domain`, `country_code`, `is_core?`, `intent?` |
| `keyword_universe_remove` | Remove a keyword | `id` OR (`keyword`, `domain`, `country_code`) |
| `keyword_universe_set_core` | Toggle daily/weekly check | `id`, `is_core` |
| `keyword_universe_set_active` | Pause without losing history | `id`, `active` |

### History queries

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `history_keyword_ranking` | Time series of a keyword's position | `keyword`, `domain`, `country_code?`, `days?` (default 30) |
| `history_domain_rankings` | Aggregate top3/top10/top100 counts and avg position over time | `domain`, `days?` |
| `history_backlinks` | Weekly backlinks history | `domain`, `weeks?` (default 12) |
| `history_llm_visibility` | LLM mentions trend per platform | `target_value`, `target_type?`, `weeks?` |
| `history_traffic` | GSC + GA4 daily metrics | `domain`, `days?`, `source?` |

### Snapshot orchestration

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `snapshot_run_now` | Manually trigger a capture | `tasks[]` (rankings_core / rankings_full / backlinks / llm / traffic / auto_expand / all), `snapshot_date?` |
| `snapshot_runs_list` | Recent runs with status, stats, errors | `limit?` |

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

9. **For UX analytics (Clarity)**: Use `clarity_traffic_overview` for a quick snapshot, `clarity_traffic_by_page` to find UX issues on specific pages, and `clarity_live_insights` with custom dimensions for advanced breakdowns. Note: max 10 API calls/day.

10. **For migration audits**: Use `wayback_get_snapshots` to list pre-migration URLs, `redirect_chain_check` to verify each old URL redirects correctly, and `http_headers_inspect` to confirm canonical/x-robots-tag are right.

11. **For schema/structured data**: Use `schema_extract_url` first to see what's there, then `schema_validate_url` to check for errors. For drafting new markup, validate the JSON-LD with `schema_validate_snippet` before deploying.

12. **For full site crawl**: Prefer `onpage_full_crawl_sync` over `onpage_task_post` + manual polling. It returns summary + pages in one call (waits up to 5–10 minutes). For very large sites use the async version.

13. **For Bing data**: Bing Webmaster Tools complements GSC. Run `bing_get_query_stats` and compare with GSC to spot Bing-specific opportunities; Bing US/MX traffic is non-trivial.

14. **For log file analysis**: Either paste raw log content or pass a public URL. Use `top_n` to control list sizes. Looks for top 404s (broken links to fix), top SEO bot hits (Googlebot/Bingbot/GPTBot/ClaudeBot), and unusual status patterns.
