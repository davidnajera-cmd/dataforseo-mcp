// Research/intelligence wrappers backed by Apify actors. These extend the
// MCP beyond ads-library (which lives in tools-adlib.ts) into broader
// competitive and content intelligence: local SEO via Google Maps, content
// recovery and competitive crawls via Website Content Crawler, social signal
// (relevant for AI optimization / LLM citations) via Instagram and YouTube.
//
// Architecture: opinionated wrappers for the 4 recurring DNA workflows. The
// actor IDs are configurable via runtime variables so we can swap to better
// scrapers without touching this file. For any other actor (the long tail of
// 28K+ in the Apify Store), use apify_run_actor as the escape hatch.
//
// COST: every Apify run charges. max_items defaults are tight (10–25); raise
// them only for intentional bulk pulls. Free tier is $5/month.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runActorSync, getConfiguredActor } from "./apify-client.js";

function formatResult(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export function registerApifyResearchTools(server: McpServer) {
  // ============================================================
  // LOCAL SEO: Google Maps competitive scan
  // ============================================================
  server.tool(
    "local_google_maps_scraper",
    "Pull Google Maps places by keyword + location for local SEO competitive analysis. Returns business name, category, address, phone, website, rating, review count, photo count, opening hours, popular times, GBP completeness signals. CRITICAL for DNA Music: 5 sedes, 97% of traffic is Colombia, queries like 'academia musica medellin' compete on the local 3-pack. Compare your sede listing against competitors (SAE Bogotá, Audio Designer, etc.) on each city. Pairs with serp_google_organic_live to see who ranks both organically and in maps. PAY-PER-RESULT — keep max_items tight. Actor configurable via APIFY_ACTOR_GOOGLE_MAPS, defaults to compass/crawler-google-places.",
    {
      keyword: z.string().describe("Search query as a user would type it (e.g. 'academia de musica medellin', 'escuela de dj bogota')."),
      location: z.string().optional().describe("City or geo-location string (e.g. 'Medellín, Colombia'). Either this or location_query must be set."),
      country_code: z.string().optional().describe("ISO-2 country code (e.g. 'co', 'mx'). Default 'co'."),
      max_items: z.number().optional().describe("Default 20. Each Maps listing is one result."),
      include_reviews: z.boolean().optional().describe("Default false — reviews multiply cost; only enable for selective deep dives on top competitors."),
      max_reviews_per_place: z.number().optional().describe("Cap reviews fetched per place when include_reviews=true. Default 10."),
      actor_input_overrides: z.record(z.string(), z.unknown()).optional(),
    },
    async ({ keyword, location, country_code, max_items, include_reviews, max_reviews_per_place, actor_input_overrides }) => {
      const actorId = await getConfiguredActor("google_maps");
      const input: Record<string, unknown> = {
        searchStringsArray: [keyword],
        ...(location ? { locationQuery: location } : {}),
        countryCode: country_code ?? "co",
        maxCrawledPlacesPerSearch: max_items ?? 20,
        includeReviews: include_reviews ?? false,
        maxReviews: include_reviews ? (max_reviews_per_place ?? 10) : 0,
        scrapeReviewsPersonalData: false,
        ...(actor_input_overrides ?? {}),
      };
      const items = await runActorSync(actorId, input, { max_items: max_items ?? 20 });
      return { content: [{ type: "text" as const, text: formatResult({ actor: actorId, items_count: items.length, items }) }] };
    }
  );

  // ============================================================
  // CONTENT INTELLIGENCE: Website Content Crawler
  // ============================================================
  server.tool(
    "web_content_crawler",
    "Crawl any website and extract clean Markdown text content from each page. Built for AI/LLM ingestion: HTML cleaned, navigation stripped, output ready for RAG or analysis. USE CASES for DNA: (1) recover legacy blog post content from Wayback URLs to rebuild SEO-009 (15 lost posts) — point at the Wayback URL directly. (2) crawl competitor blogs (SAE, Audio Designer, Pioneer DJ School) to detect content gaps. (3) audit your own /experiencia/blog topology before reorganizing. Returns one item per page: url, title, markdown, word_count, links. PAY-PER-RESULT — depth + max_items control cost. Actor configurable via APIFY_ACTOR_WEB_CRAWLER, defaults to apify/website-content-crawler.",
    {
      start_urls: z.array(z.string()).describe("URLs to start crawling from. For a single page set max_items=1 + max_depth=0."),
      max_items: z.number().optional().describe("Hard cap on pages crawled. Default 25. Higher = more $. For Wayback recovery use 1; for site audit use 50–100."),
      max_depth: z.number().optional().describe("How many link levels deep to follow from start_urls. Default 1. Set 0 to fetch only the start_urls themselves (cheapest)."),
      include_url_patterns: z.array(z.string()).optional().describe("Glob patterns; only matching URLs are crawled (e.g. ['**/blog/**'])."),
      exclude_url_patterns: z.array(z.string()).optional().describe("Glob patterns to skip (e.g. ['**/wp-admin/**', '**/feed/**'])."),
      crawler_type: z.enum(["playwright:firefox", "playwright:chrome", "cheerio"]).optional().describe("'cheerio' = fast, no JS (most blogs); 'playwright:*' = handles JS-heavy SPAs. Default cheerio."),
      actor_input_overrides: z.record(z.string(), z.unknown()).optional(),
    },
    async ({ start_urls, max_items, max_depth, include_url_patterns, exclude_url_patterns, crawler_type, actor_input_overrides }) => {
      const actorId = await getConfiguredActor("web_crawler");
      const input: Record<string, unknown> = {
        startUrls: start_urls.map((url) => ({ url })),
        maxCrawlPages: max_items ?? 25,
        maxCrawlDepth: max_depth ?? 1,
        ...(include_url_patterns && include_url_patterns.length > 0 ? { includeUrlGlobs: include_url_patterns.map((g) => ({ glob: g })) } : {}),
        ...(exclude_url_patterns && exclude_url_patterns.length > 0 ? { excludeUrlGlobs: exclude_url_patterns.map((g) => ({ glob: g })) } : {}),
        crawlerType: crawler_type ?? "cheerio",
        saveMarkdown: true,
        saveHtml: false,
        ...(actor_input_overrides ?? {}),
      };
      const items = await runActorSync(actorId, input, { max_items: max_items ?? 25 });
      return { content: [{ type: "text" as const, text: formatResult({ actor: actorId, items_count: items.length, items }) }] };
    }
  );

  // ============================================================
  // SOCIAL SIGNAL: Instagram (broad scraper — profile, posts, hashtags)
  // ============================================================
  server.tool(
    "social_instagram_scraper",
    "Scrape Instagram public data: profile info, posts, hashtags, places, comments. USE CASES for DNA: (1) audit your own DNA Music IG vs competitor IGs (followers, post frequency, engagement). (2) AI optimization signal — when ChatGPT/Perplexity recommend music schools, social proof from IG influences citations. (3) hashtag tracking (#djschool, #produccionmusical) to find emerging trends and influencer brand mentions. PAY-PER-RESULT. Actor configurable via APIFY_ACTOR_INSTAGRAM, defaults to apify/instagram-scraper (broad — handles profiles, posts, hashtags, comments by URL).",
    {
      direct_urls: z.array(z.string()).optional().describe("Instagram URLs to scrape: profile URLs (instagram.com/username), post URLs (/p/ID), hashtag URLs (/explore/tags/X), or place URLs."),
      search: z.string().optional().describe("Free-text search if direct_urls not provided. Use 'usernames', 'hashtags', or 'places' with search_type."),
      search_type: z.enum(["user", "hashtag", "place"]).optional().describe("Type of search when 'search' is set."),
      results_type: z.enum(["posts", "comments", "details", "stories", "mentions"]).optional().describe("What to extract per URL. Default 'posts'."),
      results_limit: z.number().optional().describe("Posts/items per source URL. Default 30."),
      max_items: z.number().optional().describe("Total cap across the run. Default 50."),
      actor_input_overrides: z.record(z.string(), z.unknown()).optional(),
    },
    async ({ direct_urls, search, search_type, results_type, results_limit, max_items, actor_input_overrides }) => {
      const actorId = await getConfiguredActor("instagram");
      const input: Record<string, unknown> = {
        ...(direct_urls && direct_urls.length > 0 ? { directUrls: direct_urls } : {}),
        ...(search ? { search, searchType: search_type ?? "user" } : {}),
        resultsType: results_type ?? "posts",
        resultsLimit: results_limit ?? 30,
        addParentData: false,
        ...(actor_input_overrides ?? {}),
      };
      const items = await runActorSync(actorId, input, { max_items: max_items ?? 50 });
      return { content: [{ type: "text" as const, text: formatResult({ actor: actorId, items_count: items.length, items }) }] };
    }
  );

  // ============================================================
  // SOCIAL SIGNAL: YouTube transcripts (NOT just channel scraper)
  // ============================================================
  server.tool(
    "social_youtube_transcript",
    "Extract full transcripts from YouTube videos. CHOSEN over a generic channel scraper because transcripts are the actually useful asset for SEO+AI: (1) analyze competitor educational videos for keywords/topics they cover (DNA could spot content gaps). (2) audit your own DNA Music YT for searchability. (3) feed transcripts into LLM analysis for AI visibility prep — when ChatGPT cites video content, it's pulling transcripts. Pass video URLs (or channel URLs to crawl recent videos). Actor configurable via APIFY_ACTOR_YOUTUBE, defaults to happitap/youtube-transcript-scraper.",
    {
      video_urls: z.array(z.string()).optional().describe("Specific YouTube video URLs to transcribe."),
      channel_urls: z.array(z.string()).optional().describe("Channel URLs — actor pulls recent videos and transcribes them."),
      language: z.string().optional().describe("Preferred transcript language (e.g. 'es', 'en'). Auto-detects if not set."),
      max_items: z.number().optional().describe("Max videos to transcribe. Default 10."),
      actor_input_overrides: z.record(z.string(), z.unknown()).optional(),
    },
    async ({ video_urls, channel_urls, language, max_items, actor_input_overrides }) => {
      const actorId = await getConfiguredActor("youtube");
      const input: Record<string, unknown> = {
        ...(video_urls && video_urls.length > 0 ? { videoUrls: video_urls, urls: video_urls } : {}),
        ...(channel_urls && channel_urls.length > 0 ? { channelUrls: channel_urls } : {}),
        ...(language ? { language, languageCode: language } : {}),
        ...(actor_input_overrides ?? {}),
      };
      const items = await runActorSync(actorId, input, { max_items: max_items ?? 10 });
      return { content: [{ type: "text" as const, text: formatResult({ actor: actorId, items_count: items.length, items }) }] };
    }
  );
}
