// Market research / customer voice / news monitoring tools.
// Colombia-first defaults: language=es, country=co, location_code=2170.
//
// Reddit caveat: Reddit usage in LATAM is significantly lower than in US/EU.
// For Colombia specifically the bigger customer-voice signals live on
// TikTok/IG comments and Facebook groups (not scrapeable cleanly). Reddit
// still has value for English-language nichos (r/musicproduction, r/DJs)
// where Colombian voices appear, plus the Spanish-speaking subreddits
// (r/Colombia, r/Bogota, r/Medellin, etc.).
//
// Both wrappers are pay-per-result via Apify. Defaults are tight.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runActorSync, getConfiguredActor } from "./apify-client.js";

function formatResult(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export function registerMarketResearchTools(server: McpServer) {
  // ============================================================
  // CUSTOMER VOICE: Reddit
  // ============================================================
  server.tool(
    "market_reddit_intelligence",
    "Scrape Reddit for customer voice and topic discovery: posts, comments, subreddit activity. CAVEAT for Colombia: Reddit usage in LATAM is low — for Colombian audience signal, prefer combining this with TikTok/IG comments. Best Reddit nichos for DNA: 'r/musicproduction', 'r/DJs', 'r/edmproduction', 'r/Colombia', 'r/Bogota', 'r/Medellin', 'r/Cali'. USE CASES: (1) discover unmet questions ('¿vale la pena DNA Music?', '¿dónde estudiar DJ en Colombia?'); (2) sentiment on competitors; (3) find niche topics for content. PAY-PER-RESULT. Actor configurable via APIFY_ACTOR_REDDIT.",
    {
      search_terms: z.array(z.string()).optional().describe("Free-text searches across Reddit (e.g. ['DNA Music', 'estudiar DJ colombia', 'academia musica medellin'])."),
      subreddits: z.array(z.string()).optional().describe("Specific subreddits to scan recent posts from (without 'r/' prefix; e.g. ['Colombia', 'musicproduction'])."),
      post_urls: z.array(z.string()).optional().describe("Specific Reddit post URLs to extract comments from."),
      sort: z.enum(["relevance", "hot", "new", "top", "rising"]).optional().describe("Default 'relevance' for searches, 'hot' for subreddits."),
      time_range: z.enum(["hour", "day", "week", "month", "year", "all"]).optional().describe("Default 'month'. Use 'year' for slow-moving market signals."),
      include_comments: z.boolean().optional().describe("Default true — comments are usually the customer-voice asset."),
      max_items: z.number().optional().describe("Hard cap on posts. Default 30."),
      max_comments_per_post: z.number().optional().describe("Default 25. Only relevant when include_comments=true."),
      actor_input_overrides: z.record(z.string(), z.unknown()).optional(),
    },
    async ({ search_terms, subreddits, post_urls, sort, time_range, include_comments, max_items, max_comments_per_post, actor_input_overrides }) => {
      const actorId = await getConfiguredActor("reddit");
      const startUrls: Array<{ url: string }> = [];
      if (search_terms) {
        for (const q of search_terms) {
          startUrls.push({ url: `https://www.reddit.com/search/?q=${encodeURIComponent(q)}&sort=${sort ?? "relevance"}&t=${time_range ?? "month"}` });
        }
      }
      if (subreddits) {
        for (const s of subreddits) {
          startUrls.push({ url: `https://www.reddit.com/r/${s}/${sort ?? "hot"}/?t=${time_range ?? "month"}` });
        }
      }
      if (post_urls) for (const u of post_urls) startUrls.push({ url: u });
      const input: Record<string, unknown> = {
        startUrls,
        searches: search_terms ?? [],
        type: include_comments === false ? "posts" : "comments",
        sort: sort ?? "relevance",
        time: time_range ?? "month",
        maxItems: max_items ?? 30,
        maxComments: max_comments_per_post ?? 25,
        skipComments: include_comments === false,
        ...(actor_input_overrides ?? {}),
      };
      const items = await runActorSync(actorId, input, { max_items: max_items ?? 30 });
      return { content: [{ type: "text" as const, text: formatResult({ actor: actorId, items_count: items.length, items }) }] };
    }
  );

  // ============================================================
  // NEWS MONITORING: Google News, Colombia-first
  // ============================================================
  server.tool(
    "market_news_monitor",
    "Monitor Google News for brand/keyword/category mentions. Colombia-first defaults: country='co', language='es' so it returns El Tiempo, Semana, El Espectador, Las2Orillas, Shock, El Heraldo, La FM, Caracol, Blu Radio, etc. USE CASES: (1) brand mention tracking (DNA Music, La Tienda de Audio); (2) competitor news (SAE Colombia, Audio Designer, Universidad Javeriana música); (3) regulatory/category news (ETDH, educación técnica, créditos educativos ICETEX); (4) industry trends (música, producción musical, DJs en Colombia). PAY-PER-RESULT. Actor configurable via APIFY_ACTOR_NEWS.",
    {
      queries: z.array(z.string()).describe("Search queries (e.g. ['DNA Music', 'SAE Colombia', 'ETDH educación técnica', 'créditos educativos ICETEX'])."),
      country: z.string().optional().describe("ISO-2 country code. Default 'co' (Colombia)."),
      language: z.string().optional().describe("ISO language. Default 'es'."),
      time_range: z.enum(["1h", "1d", "7d", "1m", "1y"]).optional().describe("Default '7d'. Use '1d' for breaking-news monitoring, '1m' for quarterly research."),
      max_items: z.number().optional().describe("Hard cap on articles per query. Default 20."),
      actor_input_overrides: z.record(z.string(), z.unknown()).optional(),
    },
    async ({ queries, country, language, time_range, max_items, actor_input_overrides }) => {
      const actorId = await getConfiguredActor("news");
      const input: Record<string, unknown> = {
        queries: queries.map((q) => ({ query: q })),
        searchTerms: queries,
        countryCode: country ?? "co",
        languageCode: language ?? "es",
        gl: country ?? "co",
        hl: language ?? "es",
        timeRange: time_range ?? "7d",
        maxItems: max_items ?? 20,
        maxResults: max_items ?? 20,
        ...(actor_input_overrides ?? {}),
      };
      const items = await runActorSync(actorId, input, { max_items: max_items ?? 20 });
      return { content: [{ type: "text" as const, text: formatResult({ actor: actorId, items_count: items.length, items }) }] };
    }
  );

  // ============================================================
  // TIKTOK CONTENT (organic, not ads): videos by keyword/hashtag/profile
  // ============================================================
  server.tool(
    "social_tiktok_content",
    "Scrape organic TikTok videos by keyword, hashtag, or profile (NOT ads — for ads use adlib_tiktok_search). Returns video metadata: caption, music/sound, hashtags, plays/likes/shares/comments counts, video URL, author. CORE for Colombia customer voice: DNA's audience persona (gen Z interested in DJ/music production) lives on TikTok — this is where you see WHAT content they consume, WHICH sounds and trends are emerging, WHO the local creators are. Pair with social_tiktok_comments to get actual sentiment. PAY-PER-RESULT. Actor configurable via APIFY_ACTOR_TIKTOK_CONTENT, defaults to clockworks/tiktok-scraper (174K users, 4.7).",
    {
      hashtags: z.array(z.string()).optional().describe("Hashtags to search (without '#'). E.g. ['djschool', 'produccionmusical', 'djbogota']."),
      profiles: z.array(z.string()).optional().describe("TikTok handles (without '@') to pull recent videos from. E.g. ['dnamusicofficial', 'saeinstitute']."),
      keywords: z.array(z.string()).optional().describe("Free-text searches. E.g. ['estudiar dj colombia', 'academia musica medellin']."),
      country: z.string().optional().describe("ISO-2 code. Default 'co' for Colombia-focused trends."),
      max_items: z.number().optional().describe("Total videos. Default 30."),
      actor_input_overrides: z.record(z.string(), z.unknown()).optional(),
    },
    async ({ hashtags, profiles, keywords, country, max_items, actor_input_overrides }) => {
      const actorId = await getConfiguredActor("tiktok_content");
      const input: Record<string, unknown> = {
        ...(hashtags && hashtags.length > 0 ? { hashtags } : {}),
        ...(profiles && profiles.length > 0 ? { profiles } : {}),
        ...(keywords && keywords.length > 0 ? { searchQueries: keywords, search: keywords } : {}),
        proxyCountryCode: country ?? "co",
        resultsPerPage: max_items ?? 30,
        shouldDownloadVideos: false,
        shouldDownloadCovers: false,
        shouldDownloadSlideshowImages: false,
        shouldDownloadSubtitles: false,
        ...(actor_input_overrides ?? {}),
      };
      const items = await runActorSync(actorId, input, { max_items: max_items ?? 30 });
      return { content: [{ type: "text" as const, text: formatResult({ actor: actorId, items_count: items.length, items }) }] };
    }
  );

  // ============================================================
  // TIKTOK COMMENTS (customer voice gold for Colombia)
  // ============================================================
  server.tool(
    "social_tiktok_comments",
    "Extract comments from specific TikTok videos. THE PRIMARY customer-voice signal for DNA Music's persona in Colombia: TikTok comments expose what young Colombians actually say about brands/programs/competitors. Use the video URL list returned by social_tiktok_content (or by adlib_tiktok_search for competitor ads' comment threads, when public) and feed it here. Pulls comment text, author, like count, replies. PAY-PER-RESULT — comments are usually $0.30/1000. Actor configurable via APIFY_ACTOR_TIKTOK_COMMENTS, defaults to apidojo/tiktok-comments-scraper.",
    {
      video_urls: z.array(z.string()).describe("TikTok video URLs (e.g. ['https://www.tiktok.com/@user/video/123...'])."),
      max_comments_per_video: z.number().optional().describe("Default 50. Cap per video."),
      include_replies: z.boolean().optional().describe("Default false — replies multiply cost."),
      max_items: z.number().optional().describe("Total cap across all videos. Default 200."),
      actor_input_overrides: z.record(z.string(), z.unknown()).optional(),
    },
    async ({ video_urls, max_comments_per_video, include_replies, max_items, actor_input_overrides }) => {
      const actorId = await getConfiguredActor("tiktok_comments");
      const input: Record<string, unknown> = {
        postURLs: video_urls,
        videoUrls: video_urls,
        urls: video_urls,
        maxCommentsPerVideo: max_comments_per_video ?? 50,
        commentsPerPost: max_comments_per_video ?? 50,
        scrapeReplies: include_replies ?? false,
        ...(actor_input_overrides ?? {}),
      };
      const items = await runActorSync(actorId, input, { max_items: max_items ?? 200 });
      return { content: [{ type: "text" as const, text: formatResult({ actor: actorId, items_count: items.length, items }) }] };
    }
  );
}
