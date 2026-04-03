import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { post, get } from "./dataforseo-client.js";

// Helper to format results
function formatResult(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export function registerTools(server: McpServer) {
  // ============================================================
  // SERP API - Google Organic
  // ============================================================
  server.tool(
    "serp_google_organic_live",
    "Search Google organic results in real-time. Returns SERP data for any keyword.",
    {
      keyword: z.string().describe("Search keyword"),
      location_code: z.number().optional().describe("Location code (e.g., 2840 for US)"),
      language_code: z.string().optional().describe("Language code (e.g., 'en')"),
      device: z.enum(["desktop", "mobile"]).optional().describe("Device type"),
      depth: z.number().optional().describe("Number of results (default 100)"),
    },
    async ({ keyword, location_code, language_code, device, depth }) => {
      const result = await post("/serp/google/organic/live/advanced", {
        keyword,
        location_code: location_code ?? 2840,
        language_code: language_code ?? "en",
        device: device ?? "desktop",
        depth: depth ?? 100,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "serp_google_organic_task_post",
    "Create an async task for Google organic SERP results. Use tasks_ready to check status.",
    {
      keyword: z.string().describe("Search keyword"),
      location_code: z.number().optional().describe("Location code"),
      language_code: z.string().optional().describe("Language code"),
      device: z.enum(["desktop", "mobile"]).optional(),
      depth: z.number().optional(),
    },
    async ({ keyword, location_code, language_code, device, depth }) => {
      const result = await post("/serp/google/organic/task_post", {
        keyword,
        location_code: location_code ?? 2840,
        language_code: language_code ?? "en",
        device: device ?? "desktop",
        depth: depth ?? 100,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "serp_google_organic_tasks_ready",
    "Check which Google organic SERP tasks are ready to retrieve.",
    {},
    async () => {
      const result = await get("/serp/google/organic/tasks_ready");
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "serp_google_organic_task_get",
    "Get results of a completed Google organic SERP task.",
    {
      task_id: z.string().describe("Task ID to retrieve"),
    },
    async ({ task_id }) => {
      const result = await get(`/serp/google/organic/task_get/advanced/${task_id}`);
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // SERP API - Google Maps
  // ============================================================
  server.tool(
    "serp_google_maps_live",
    "Search Google Maps results in real-time for local business data.",
    {
      keyword: z.string().describe("Search keyword (e.g., 'pizza near me')"),
      location_code: z.number().optional().describe("Location code"),
      language_code: z.string().optional().describe("Language code"),
      depth: z.number().optional().describe("Number of results"),
    },
    async ({ keyword, location_code, language_code, depth }) => {
      const result = await post("/serp/google/maps/live/advanced", {
        keyword,
        location_code: location_code ?? 2840,
        language_code: language_code ?? "en",
        depth: depth ?? 20,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // SERP API - Google News
  // ============================================================
  server.tool(
    "serp_google_news_live",
    "Search Google News results in real-time.",
    {
      keyword: z.string().describe("Search keyword"),
      location_code: z.number().optional(),
      language_code: z.string().optional(),
    },
    async ({ keyword, location_code, language_code }) => {
      const result = await post("/serp/google/news/live/advanced", {
        keyword,
        location_code: location_code ?? 2840,
        language_code: language_code ?? "en",
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // SERP API - Google Images
  // ============================================================
  server.tool(
    "serp_google_images_live",
    "Search Google Images results in real-time.",
    {
      keyword: z.string().describe("Search keyword"),
      location_code: z.number().optional(),
      language_code: z.string().optional(),
      depth: z.number().optional(),
    },
    async ({ keyword, location_code, language_code, depth }) => {
      const result = await post("/serp/google/images/live/advanced", {
        keyword,
        location_code: location_code ?? 2840,
        language_code: language_code ?? "en",
        depth: depth ?? 100,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // SERP API - Google Autocomplete
  // ============================================================
  server.tool(
    "serp_google_autocomplete_live",
    "Get Google Autocomplete suggestions for a keyword.",
    {
      keyword: z.string().describe("Search keyword"),
      location_code: z.number().optional(),
      language_code: z.string().optional(),
    },
    async ({ keyword, location_code, language_code }) => {
      const result = await post("/serp/google/autocomplete/live/advanced", {
        keyword,
        location_code: location_code ?? 2840,
        language_code: language_code ?? "en",
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // SERP API - YouTube
  // ============================================================
  server.tool(
    "serp_youtube_organic_live",
    "Search YouTube videos in real-time.",
    {
      keyword: z.string().describe("Search keyword"),
      location_code: z.number().optional(),
      language_code: z.string().optional(),
      depth: z.number().optional(),
    },
    async ({ keyword, location_code, language_code, depth }) => {
      const result = await post("/serp/youtube/organic/live/advanced", {
        keyword,
        location_code: location_code ?? 2840,
        language_code: language_code ?? "en",
        depth: depth ?? 20,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "serp_youtube_video_info_live",
    "Get detailed info about a specific YouTube video.",
    {
      video_id: z.string().describe("YouTube video ID"),
    },
    async ({ video_id }) => {
      const result = await post("/serp/youtube/video_info/live/advanced", {
        video_id,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "serp_youtube_video_subtitles_live",
    "Get subtitles/captions of a YouTube video.",
    {
      video_id: z.string().describe("YouTube video ID"),
      subtitle_language: z.string().optional().describe("Subtitle language code"),
    },
    async ({ video_id, subtitle_language }) => {
      const result = await post("/serp/youtube/video_subtitles/live/advanced", {
        video_id,
        subtitle_language: subtitle_language ?? "en",
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "serp_youtube_video_comments_live",
    "Get comments on a YouTube video.",
    {
      video_id: z.string().describe("YouTube video ID"),
      depth: z.number().optional().describe("Number of comments to fetch"),
    },
    async ({ video_id, depth }) => {
      const result = await post("/serp/youtube/video_comments/live/advanced", {
        video_id,
        depth: depth ?? 20,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // SERP API - Bing
  // ============================================================
  server.tool(
    "serp_bing_organic_live",
    "Search Bing organic results in real-time.",
    {
      keyword: z.string().describe("Search keyword"),
      location_code: z.number().optional(),
      language_code: z.string().optional(),
      depth: z.number().optional(),
    },
    async ({ keyword, location_code, language_code, depth }) => {
      const result = await post("/serp/bing/organic/live/advanced", {
        keyword,
        location_code: location_code ?? 2840,
        language_code: language_code ?? "en",
        depth: depth ?? 50,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // SERP API - Google Jobs
  // ============================================================
  server.tool(
    "serp_google_jobs_live",
    "Search Google Jobs listings in real-time.",
    {
      keyword: z.string().describe("Job search keyword"),
      location_code: z.number().optional(),
      language_code: z.string().optional(),
      depth: z.number().optional(),
    },
    async ({ keyword, location_code, language_code, depth }) => {
      const result = await post("/serp/google/jobs/task_post", {
        keyword,
        location_code: location_code ?? 2840,
        language_code: language_code ?? "en",
        depth: depth ?? 20,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // SERP API - Google Events
  // ============================================================
  server.tool(
    "serp_google_events_live",
    "Search Google Events in real-time.",
    {
      keyword: z.string().describe("Event search keyword"),
      location_code: z.number().optional(),
      language_code: z.string().optional(),
    },
    async ({ keyword, location_code, language_code }) => {
      const result = await post("/serp/google/events/live/advanced", {
        keyword,
        location_code: location_code ?? 2840,
        language_code: language_code ?? "en",
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // SERP API - Google AI Mode
  // ============================================================
  server.tool(
    "serp_google_ai_mode_live",
    "Get Google AI Mode (AI Overview) results for a keyword.",
    {
      keyword: z.string().describe("Search keyword"),
      location_code: z.number().optional(),
      language_code: z.string().optional(),
    },
    async ({ keyword, location_code, language_code }) => {
      const result = await post("/serp/google/ai_mode/live/advanced", {
        keyword,
        location_code: location_code ?? 2840,
        language_code: language_code ?? "en",
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // AI OPTIMIZATION API
  // ============================================================
  server.tool(
    "ai_optimization_llm_mentions_search",
    "Search for LLM mentions of a domain or brand across AI models.",
    {
      keyword: z.string().describe("Brand or domain to search"),
      location_code: z.number().optional(),
      language_code: z.string().optional(),
    },
    async ({ keyword, location_code, language_code }) => {
      const result = await post("/ai_optimization/llm_mentions/search/live", {
        keyword,
        location_code: location_code ?? 2840,
        language_code: language_code ?? "en",
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "ai_optimization_llm_mentions_top_domains",
    "Get top domains mentioned by LLMs for a keyword.",
    {
      keyword: z.string().describe("Keyword to analyze"),
      location_code: z.number().optional(),
      language_code: z.string().optional(),
    },
    async ({ keyword, location_code, language_code }) => {
      const result = await post("/ai_optimization/llm_mentions/top_domains/live", {
        keyword,
        location_code: location_code ?? 2840,
        language_code: language_code ?? "en",
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "ai_optimization_chatgpt_live",
    "Get ChatGPT response for a prompt in real-time.",
    {
      prompt: z.string().describe("Prompt to send to ChatGPT"),
    },
    async ({ prompt }) => {
      const result = await post("/ai_optimization/chat_gpt/llm_responses/live", {
        prompt,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "ai_optimization_gemini_live",
    "Get Gemini response for a prompt in real-time.",
    {
      prompt: z.string().describe("Prompt to send to Gemini"),
    },
    async ({ prompt }) => {
      const result = await post("/ai_optimization/gemini/llm_responses/live", {
        prompt,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "ai_optimization_perplexity_live",
    "Get Perplexity response for a prompt in real-time.",
    {
      prompt: z.string().describe("Prompt to send to Perplexity"),
    },
    async ({ prompt }) => {
      const result = await post("/ai_optimization/perplexity/llm_responses/live", {
        prompt,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // KEYWORDS DATA API - Google Ads
  // ============================================================
  server.tool(
    "keywords_google_search_volume_live",
    "Get search volume and keyword metrics from Google Ads for one or more keywords.",
    {
      keywords: z.array(z.string()).describe("Array of keywords (max 700)"),
      location_code: z.number().optional(),
      language_code: z.string().optional(),
      date_from: z.string().optional().describe("Start date (YYYY-MM-DD)"),
      date_to: z.string().optional().describe("End date (YYYY-MM-DD)"),
    },
    async ({ keywords, location_code, language_code, date_from, date_to }) => {
      const result = await post("/keywords_data/google_ads/search_volume/live", {
        keywords,
        location_code: location_code ?? 2840,
        language_code: language_code ?? "en",
        date_from,
        date_to,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "keywords_google_keywords_for_site_live",
    "Get keyword ideas for a specific website from Google Ads.",
    {
      target: z.string().describe("Target domain (e.g., 'example.com')"),
      location_code: z.number().optional(),
      language_code: z.string().optional(),
    },
    async ({ target, location_code, language_code }) => {
      const result = await post("/keywords_data/google_ads/keywords_for_site/live", {
        target,
        location_code: location_code ?? 2840,
        language_code: language_code ?? "en",
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "keywords_google_keywords_for_keywords_live",
    "Get related keyword suggestions from Google Ads based on seed keywords.",
    {
      keywords: z.array(z.string()).describe("Seed keywords"),
      location_code: z.number().optional(),
      language_code: z.string().optional(),
    },
    async ({ keywords, location_code, language_code }) => {
      const result = await post("/keywords_data/google_ads/keywords_for_keywords/live", {
        keywords,
        location_code: location_code ?? 2840,
        language_code: language_code ?? "en",
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "keywords_google_ad_traffic_live",
    "Get estimated ad traffic data for keywords from Google Ads.",
    {
      keywords: z.array(z.string()).describe("Keywords to analyze"),
      location_code: z.number().optional(),
      language_code: z.string().optional(),
      bid: z.number().optional().describe("Max CPC bid in USD"),
    },
    async ({ keywords, location_code, language_code, bid }) => {
      const result = await post("/keywords_data/google_ads/ad_traffic_by_keywords/live", {
        keywords,
        location_code: location_code ?? 2840,
        language_code: language_code ?? "en",
        bid: bid ?? 999,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // KEYWORDS DATA API - Google Trends
  // ============================================================
  server.tool(
    "keywords_google_trends_live",
    "Get Google Trends data for keywords including interest over time.",
    {
      keywords: z.array(z.string()).describe("Keywords to compare (max 5)"),
      location_code: z.number().optional(),
      language_code: z.string().optional(),
      type: z.enum(["web_search", "news_search", "google_shopping", "youtube_search", "image_search"]).optional(),
      date_from: z.string().optional().describe("Start date (YYYY-MM-DD)"),
      date_to: z.string().optional().describe("End date (YYYY-MM-DD)"),
    },
    async ({ keywords, location_code, language_code, type, date_from, date_to }) => {
      const result = await post("/keywords_data/google_trends/explore/live", {
        keywords,
        location_code: location_code ?? 2840,
        language_code: language_code ?? "en",
        type: type ?? "web_search",
        date_from,
        date_to,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // KEYWORDS DATA API - Clickstream
  // ============================================================
  server.tool(
    "keywords_clickstream_search_volume_live",
    "Get clickstream-based search volume data for keywords (DataForSEO proprietary data).",
    {
      keywords: z.array(z.string()).describe("Keywords to get clickstream volume for"),
      location_code: z.number().optional(),
      language_code: z.string().optional(),
    },
    async ({ keywords, location_code, language_code }) => {
      const result = await post("/keywords_data/clickstream_data/dataforseo_search_volume/live", {
        keywords,
        location_code: location_code ?? 2840,
        language_code: language_code ?? "en",
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // KEYWORDS DATA API - Bing
  // ============================================================
  server.tool(
    "keywords_bing_search_volume_live",
    "Get Bing search volume for keywords.",
    {
      keywords: z.array(z.string()).describe("Keywords to analyze"),
      location_code: z.number().optional(),
      language_code: z.string().optional(),
    },
    async ({ keywords, location_code, language_code }) => {
      const result = await post("/keywords_data/bing/search_volume/live", {
        keywords,
        location_code: location_code ?? 2840,
        language_code: language_code ?? "en",
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // DATAFORSEO LABS API - Keyword Research
  // ============================================================
  server.tool(
    "labs_google_keyword_suggestions",
    "Get keyword suggestions from DataForSEO Labs for a seed keyword.",
    {
      keyword: z.string().describe("Seed keyword"),
      location_code: z.number().optional(),
      language_code: z.string().optional(),
      include_seed_keyword: z.boolean().optional(),
      limit: z.number().optional().describe("Max number of results"),
    },
    async ({ keyword, location_code, language_code, include_seed_keyword, limit }) => {
      const result = await post("/dataforseo_labs/google/keyword_suggestions/live", {
        keyword,
        location_code: location_code ?? 2840,
        language_code: language_code ?? "en",
        include_seed_keyword: include_seed_keyword ?? true,
        limit: limit ?? 50,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "labs_google_keyword_ideas",
    "Get keyword ideas based on a seed keyword from DataForSEO Labs.",
    {
      keyword: z.string().describe("Seed keyword"),
      location_code: z.number().optional(),
      language_code: z.string().optional(),
      limit: z.number().optional(),
    },
    async ({ keyword, location_code, language_code, limit }) => {
      const result = await post("/dataforseo_labs/google/keyword_ideas/live", {
        keyword,
        location_code: location_code ?? 2840,
        language_code: language_code ?? "en",
        limit: limit ?? 50,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "labs_google_related_keywords",
    "Get related keywords for a seed keyword.",
    {
      keyword: z.string().describe("Seed keyword"),
      location_code: z.number().optional(),
      language_code: z.string().optional(),
      limit: z.number().optional(),
    },
    async ({ keyword, location_code, language_code, limit }) => {
      const result = await post("/dataforseo_labs/google/related_keywords/live", {
        keyword,
        location_code: location_code ?? 2840,
        language_code: language_code ?? "en",
        limit: limit ?? 50,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "labs_google_keyword_overview",
    "Get overview metrics (volume, difficulty, CPC) for keywords.",
    {
      keywords: z.array(z.string()).describe("Keywords to analyze"),
      location_code: z.number().optional(),
      language_code: z.string().optional(),
    },
    async ({ keywords, location_code, language_code }) => {
      const result = await post("/dataforseo_labs/google/keyword_overview/live", {
        keywords,
        location_code: location_code ?? 2840,
        language_code: language_code ?? "en",
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "labs_google_bulk_keyword_difficulty",
    "Get keyword difficulty scores in bulk.",
    {
      keywords: z.array(z.string()).describe("Keywords to check difficulty for"),
      location_code: z.number().optional(),
      language_code: z.string().optional(),
    },
    async ({ keywords, location_code, language_code }) => {
      const result = await post("/dataforseo_labs/google/bulk_keyword_difficulty/live", {
        keywords,
        location_code: location_code ?? 2840,
        language_code: language_code ?? "en",
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "labs_google_search_intent",
    "Detect search intent (informational, navigational, commercial, transactional) for keywords.",
    {
      keywords: z.array(z.string()).describe("Keywords to classify"),
      location_code: z.number().optional(),
      language_code: z.string().optional(),
    },
    async ({ keywords, location_code, language_code }) => {
      const result = await post("/dataforseo_labs/google/search_intent/live", {
        keywords,
        location_code: location_code ?? 2840,
        language_code: language_code ?? "en",
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "labs_google_keywords_for_site",
    "Get all keywords a domain ranks for in DataForSEO Labs.",
    {
      target: z.string().describe("Target domain (e.g., 'example.com')"),
      location_code: z.number().optional(),
      language_code: z.string().optional(),
      limit: z.number().optional(),
    },
    async ({ target, location_code, language_code, limit }) => {
      const result = await post("/dataforseo_labs/google/keywords_for_site/live", {
        target,
        location_code: location_code ?? 2840,
        language_code: language_code ?? "en",
        limit: limit ?? 100,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "labs_google_historical_keyword_data",
    "Get historical search volume and metrics for keywords.",
    {
      keywords: z.array(z.string()).describe("Keywords to get history for"),
      location_code: z.number().optional(),
      language_code: z.string().optional(),
    },
    async ({ keywords, location_code, language_code }) => {
      const result = await post("/dataforseo_labs/google/historical_keyword_data/live", {
        keywords,
        location_code: location_code ?? 2840,
        language_code: language_code ?? "en",
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // DATAFORSEO LABS API - Competitor Research
  // ============================================================
  server.tool(
    "labs_google_ranked_keywords",
    "Get all keywords a domain is ranked for with positions and traffic.",
    {
      target: z.string().describe("Target domain"),
      location_code: z.number().optional(),
      language_code: z.string().optional(),
      limit: z.number().optional(),
      order_by: z.array(z.string()).optional().describe("Sorting (e.g., ['keyword_data.keyword_info.search_volume,desc'])"),
    },
    async ({ target, location_code, language_code, limit, order_by }) => {
      const result = await post("/dataforseo_labs/google/ranked_keywords/live", {
        target,
        location_code: location_code ?? 2840,
        language_code: language_code ?? "en",
        limit: limit ?? 100,
        order_by,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "labs_google_serp_competitors",
    "Find SERP competitors for a set of keywords.",
    {
      keywords: z.array(z.string()).describe("Keywords to analyze"),
      location_code: z.number().optional(),
      language_code: z.string().optional(),
      limit: z.number().optional(),
    },
    async ({ keywords, location_code, language_code, limit }) => {
      const result = await post("/dataforseo_labs/google/serp_competitors/live", {
        keywords,
        location_code: location_code ?? 2840,
        language_code: language_code ?? "en",
        limit: limit ?? 20,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "labs_google_competitors_domain",
    "Find competitor domains for a given domain.",
    {
      target: z.string().describe("Target domain"),
      location_code: z.number().optional(),
      language_code: z.string().optional(),
      limit: z.number().optional(),
    },
    async ({ target, location_code, language_code, limit }) => {
      const result = await post("/dataforseo_labs/google/competitors_domain/live", {
        target,
        location_code: location_code ?? 2840,
        language_code: language_code ?? "en",
        limit: limit ?? 20,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "labs_google_domain_intersection",
    "Find keyword overlap between two or more domains.",
    {
      targets: z.record(z.string(), z.string()).describe("Domains to compare, e.g. {\"1\": \"domain1.com\", \"2\": \"domain2.com\"}"),
      location_code: z.number().optional(),
      language_code: z.string().optional(),
      limit: z.number().optional(),
    },
    async ({ targets, location_code, language_code, limit }) => {
      const result = await post("/dataforseo_labs/google/domain_intersection/live", {
        targets,
        location_code: location_code ?? 2840,
        language_code: language_code ?? "en",
        limit: limit ?? 100,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "labs_google_domain_rank_overview",
    "Get rank overview metrics for a domain (organic traffic, keywords count, etc.).",
    {
      target: z.string().describe("Target domain"),
      location_code: z.number().optional(),
      language_code: z.string().optional(),
    },
    async ({ target, location_code, language_code }) => {
      const result = await post("/dataforseo_labs/google/domain_rank_overview/live", {
        target,
        location_code: location_code ?? 2840,
        language_code: language_code ?? "en",
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "labs_google_subdomains",
    "Get subdomain rankings for a domain.",
    {
      target: z.string().describe("Target domain"),
      location_code: z.number().optional(),
      language_code: z.string().optional(),
      limit: z.number().optional(),
    },
    async ({ target, location_code, language_code, limit }) => {
      const result = await post("/dataforseo_labs/google/subdomains/live", {
        target,
        location_code: location_code ?? 2840,
        language_code: language_code ?? "en",
        limit: limit ?? 50,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "labs_google_relevant_pages",
    "Get the most relevant pages of a domain for SEO.",
    {
      target: z.string().describe("Target domain"),
      location_code: z.number().optional(),
      language_code: z.string().optional(),
      limit: z.number().optional(),
    },
    async ({ target, location_code, language_code, limit }) => {
      const result = await post("/dataforseo_labs/google/relevant_pages/live", {
        target,
        location_code: location_code ?? 2840,
        language_code: language_code ?? "en",
        limit: limit ?? 50,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "labs_google_bulk_traffic_estimation",
    "Get estimated organic traffic for multiple domains.",
    {
      targets: z.array(z.string()).describe("List of domains"),
      location_code: z.number().optional(),
      language_code: z.string().optional(),
    },
    async ({ targets, location_code, language_code }) => {
      const result = await post("/dataforseo_labs/google/bulk_traffic_estimation/live", {
        targets,
        location_code: location_code ?? 2840,
        language_code: language_code ?? "en",
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "labs_google_top_searches",
    "Get top trending searches for a location.",
    {
      location_code: z.number().optional(),
      language_code: z.string().optional(),
      limit: z.number().optional(),
    },
    async ({ location_code, language_code, limit }) => {
      const result = await post("/dataforseo_labs/google/top_searches/live", {
        location_code: location_code ?? 2840,
        language_code: language_code ?? "en",
        limit: limit ?? 50,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "labs_google_historical_serps",
    "Get historical SERP data for a keyword.",
    {
      keyword: z.string().describe("Keyword to get historical SERPs for"),
      location_code: z.number().optional(),
      language_code: z.string().optional(),
      date_from: z.string().optional(),
      date_to: z.string().optional(),
    },
    async ({ keyword, location_code, language_code, date_from, date_to }) => {
      const result = await post("/dataforseo_labs/google/historical_serps/live", {
        keyword,
        location_code: location_code ?? 2840,
        language_code: language_code ?? "en",
        date_from,
        date_to,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // BACKLINKS API
  // ============================================================
  server.tool(
    "backlinks_summary",
    "Get backlink summary for a domain (total backlinks, referring domains, rank, etc.).",
    {
      target: z.string().describe("Target domain or URL"),
      include_subdomains: z.boolean().optional(),
    },
    async ({ target, include_subdomains }) => {
      const result = await post("/backlinks/summary/live", {
        target,
        include_subdomains: include_subdomains ?? true,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "backlinks_list",
    "Get list of backlinks pointing to a target domain or URL.",
    {
      target: z.string().describe("Target domain or URL"),
      limit: z.number().optional().describe("Max results (default 100)"),
      offset: z.number().optional(),
      include_subdomains: z.boolean().optional(),
      order_by: z.array(z.string()).optional(),
      mode: z.enum(["as_is", "one_per_domain", "one_per_anchor"]).optional(),
    },
    async ({ target, limit, offset, include_subdomains, order_by, mode }) => {
      const result = await post("/backlinks/backlinks/live", {
        target,
        limit: limit ?? 100,
        offset: offset ?? 0,
        include_subdomains: include_subdomains ?? true,
        order_by,
        mode: mode ?? "as_is",
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "backlinks_referring_domains",
    "Get list of referring domains for a target.",
    {
      target: z.string().describe("Target domain or URL"),
      limit: z.number().optional(),
      include_subdomains: z.boolean().optional(),
      order_by: z.array(z.string()).optional(),
    },
    async ({ target, limit, include_subdomains, order_by }) => {
      const result = await post("/backlinks/referring_domains/live", {
        target,
        limit: limit ?? 100,
        include_subdomains: include_subdomains ?? true,
        order_by,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "backlinks_anchors",
    "Get anchor text distribution for backlinks to a target.",
    {
      target: z.string().describe("Target domain or URL"),
      limit: z.number().optional(),
      include_subdomains: z.boolean().optional(),
    },
    async ({ target, limit, include_subdomains }) => {
      const result = await post("/backlinks/anchors/live", {
        target,
        limit: limit ?? 100,
        include_subdomains: include_subdomains ?? true,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "backlinks_history",
    "Get historical backlink data for a domain.",
    {
      target: z.string().describe("Target domain or URL"),
      date_from: z.string().optional(),
      date_to: z.string().optional(),
    },
    async ({ target, date_from, date_to }) => {
      const result = await post("/backlinks/history/live", {
        target,
        date_from,
        date_to,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "backlinks_competitors",
    "Find backlink competitors for a domain.",
    {
      target: z.string().describe("Target domain"),
      limit: z.number().optional(),
    },
    async ({ target, limit }) => {
      const result = await post("/backlinks/competitors/live", {
        target,
        limit: limit ?? 20,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "backlinks_domain_intersection",
    "Find common backlinks between multiple domains.",
    {
      targets: z.record(z.string(), z.string()).describe("Domains to compare, e.g. {\"1\": \"domain1.com\", \"2\": \"domain2.com\"}"),
      limit: z.number().optional(),
    },
    async ({ targets, limit }) => {
      const result = await post("/backlinks/domain_intersection/live", {
        targets,
        limit: limit ?? 100,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "backlinks_bulk_ranks",
    "Get bulk rank data for multiple domains.",
    {
      targets: z.array(z.string()).describe("List of domains (max 1000)"),
    },
    async ({ targets }) => {
      const result = await post("/backlinks/bulk_ranks/live", { targets });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "backlinks_bulk_spam_score",
    "Get spam score for multiple domains.",
    {
      targets: z.array(z.string()).describe("List of domains"),
    },
    async ({ targets }) => {
      const result = await post("/backlinks/bulk_spam_score/live", { targets });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "backlinks_domain_pages",
    "Get pages of a domain with their backlink metrics.",
    {
      target: z.string().describe("Target domain"),
      limit: z.number().optional(),
    },
    async ({ target, limit }) => {
      const result = await post("/backlinks/domain_pages/live", {
        target,
        limit: limit ?? 100,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "backlinks_timeseries_summary",
    "Get backlink time series data over time.",
    {
      target: z.string().describe("Target domain"),
      date_from: z.string().optional(),
      date_to: z.string().optional(),
    },
    async ({ target, date_from, date_to }) => {
      const result = await post("/backlinks/timeseries_summary/live", {
        target,
        date_from,
        date_to,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // ONPAGE API
  // ============================================================
  server.tool(
    "onpage_task_post",
    "Start a website crawl for on-page SEO analysis.",
    {
      target: z.string().describe("Target URL to crawl"),
      max_crawl_pages: z.number().optional().describe("Max pages to crawl (default 100)"),
      enable_javascript: z.boolean().optional(),
    },
    async ({ target, max_crawl_pages, enable_javascript }) => {
      const result = await post("/on_page/task_post", {
        target,
        max_crawl_pages: max_crawl_pages ?? 100,
        enable_javascript: enable_javascript ?? false,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "onpage_tasks_ready",
    "Check which on-page crawl tasks are ready.",
    {},
    async () => {
      const result = await get("/on_page/tasks_ready");
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "onpage_summary",
    "Get crawl summary for a completed on-page task.",
    {
      task_id: z.string().describe("Task ID"),
    },
    async ({ task_id }) => {
      const result = await get(`/on_page/summary/${task_id}`);
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "onpage_pages",
    "Get crawled pages data from an on-page task.",
    {
      task_id: z.string().describe("Task ID"),
      limit: z.number().optional(),
    },
    async ({ task_id, limit }) => {
      const result = await post(`/on_page/pages`, {
        id: task_id,
        limit: limit ?? 100,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "onpage_duplicate_tags",
    "Get duplicate title/description tags from a crawl.",
    {
      task_id: z.string().describe("Task ID"),
    },
    async ({ task_id }) => {
      const result = await post("/on_page/duplicate_tags", { id: task_id });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "onpage_duplicate_content",
    "Get duplicate content pages from a crawl.",
    {
      task_id: z.string().describe("Task ID"),
    },
    async ({ task_id }) => {
      const result = await post("/on_page/duplicate_content", { id: task_id });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "onpage_links",
    "Get link data from a crawl task.",
    {
      task_id: z.string().describe("Task ID"),
      limit: z.number().optional(),
    },
    async ({ task_id, limit }) => {
      const result = await post("/on_page/links", {
        id: task_id,
        limit: limit ?? 100,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "onpage_redirect_chains",
    "Get redirect chains found during crawl.",
    {
      task_id: z.string().describe("Task ID"),
    },
    async ({ task_id }) => {
      const result = await post("/on_page/redirect_chains", { id: task_id });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "onpage_lighthouse_live",
    "Run Google Lighthouse audit on a URL in real-time.",
    {
      url: z.string().describe("URL to audit"),
      for_mobile: z.boolean().optional().describe("Run for mobile (default desktop)"),
      categories: z.array(z.string()).optional().describe("Categories: performance, accessibility, best-practices, seo"),
    },
    async ({ url, for_mobile, categories }) => {
      const result = await post("/on_page/lighthouse/live/json", {
        url,
        for_mobile: for_mobile ?? false,
        categories: categories ?? ["performance", "accessibility", "best-practices", "seo"],
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "onpage_content_parsing_live",
    "Parse and extract content from a URL in real-time.",
    {
      url: z.string().describe("URL to parse"),
    },
    async ({ url }) => {
      const result = await post("/on_page/content_parsing/live", { url });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "onpage_instant_pages",
    "Get instant on-page analysis for a URL without crawling.",
    {
      url: z.string().describe("URL to analyze"),
      enable_javascript: z.boolean().optional(),
    },
    async ({ url, enable_javascript }) => {
      const result = await post("/on_page/instant_pages", {
        url,
        enable_javascript: enable_javascript ?? false,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // DOMAIN ANALYTICS API
  // ============================================================
  server.tool(
    "domain_technologies",
    "Detect technologies used by a domain (CMS, frameworks, analytics, etc.).",
    {
      target: z.string().describe("Target domain"),
    },
    async ({ target }) => {
      const result = await post("/domain_analytics/technologies/domain_technologies/live", {
        target,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "domain_technologies_domains_by_technology",
    "Find domains using a specific technology.",
    {
      technology: z.string().describe("Technology name (e.g., 'WordPress')"),
      limit: z.number().optional(),
    },
    async ({ technology, limit }) => {
      const result = await post("/domain_analytics/technologies/domains_by_technology/live", {
        technology,
        limit: limit ?? 100,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "domain_whois",
    "Get WHOIS information for a domain.",
    {
      target: z.string().describe("Target domain"),
    },
    async ({ target }) => {
      const result = await post("/domain_analytics/whois/overview/live", {
        target,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // CONTENT ANALYSIS API
  // ============================================================
  server.tool(
    "content_analysis_search",
    "Search for content across the web with sentiment and citation data.",
    {
      keyword: z.string().describe("Keyword to search content for"),
      page_type: z.array(z.string()).optional().describe("Page types to search"),
      limit: z.number().optional(),
    },
    async ({ keyword, page_type, limit }) => {
      const result = await post("/content_analysis/search/live", {
        keyword,
        page_type,
        limit: limit ?? 20,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "content_analysis_summary",
    "Get content analysis summary for a keyword.",
    {
      keyword: z.string().describe("Keyword to analyze"),
    },
    async ({ keyword }) => {
      const result = await post("/content_analysis/summary/live", { keyword });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "content_analysis_sentiment",
    "Get sentiment analysis for content mentioning a keyword.",
    {
      keyword: z.string().describe("Keyword to analyze sentiment for"),
    },
    async ({ keyword }) => {
      const result = await post("/content_analysis/sentiment_analysis/live", { keyword });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "content_analysis_rating_distribution",
    "Get rating distribution for content about a keyword.",
    {
      keyword: z.string().describe("Keyword to analyze"),
    },
    async ({ keyword }) => {
      const result = await post("/content_analysis/rating_distribution/live", { keyword });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "content_analysis_phrase_trends",
    "Get phrase/topic trends for a keyword over time.",
    {
      keyword: z.string().describe("Keyword to analyze"),
    },
    async ({ keyword }) => {
      const result = await post("/content_analysis/phrase_trends/live", { keyword });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // BUSINESS DATA API
  // ============================================================
  server.tool(
    "business_listings_search",
    "Search business listings (local businesses data).",
    {
      keyword: z.string().optional().describe("Business search keyword"),
      categories: z.array(z.string()).optional(),
      location_code: z.number().optional(),
      limit: z.number().optional(),
    },
    async ({ keyword, categories, location_code, limit }) => {
      const result = await post("/business_data/business_listings/search/live", {
        keyword,
        categories,
        location_coordinate: undefined,
        limit: limit ?? 20,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "business_google_my_business_info_live",
    "Get Google My Business info for a business in real-time.",
    {
      keyword: z.string().describe("Business name or keyword"),
      location_code: z.number().optional(),
      language_code: z.string().optional(),
    },
    async ({ keyword, location_code, language_code }) => {
      const result = await post("/business_data/google/my_business_info/live", {
        keyword,
        location_code: location_code ?? 2840,
        language_code: language_code ?? "en",
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "business_google_reviews_task_post",
    "Create a task to get Google reviews for a business.",
    {
      keyword: z.string().describe("Business name, place ID, or keyword"),
      location_code: z.number().optional(),
      language_code: z.string().optional(),
      depth: z.number().optional(),
    },
    async ({ keyword, location_code, language_code, depth }) => {
      const result = await post("/business_data/google/reviews/task_post", {
        keyword,
        location_code: location_code ?? 2840,
        language_code: language_code ?? "en",
        depth: depth ?? 20,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "business_google_hotel_searches_live",
    "Search for hotels on Google in real-time.",
    {
      keyword: z.string().describe("Hotel search keyword"),
      location_code: z.number().optional(),
      language_code: z.string().optional(),
      check_in: z.string().optional().describe("Check-in date (YYYY-MM-DD)"),
      check_out: z.string().optional().describe("Check-out date (YYYY-MM-DD)"),
    },
    async ({ keyword, location_code, language_code, check_in, check_out }) => {
      const result = await post("/business_data/google/hotel_searches/live", {
        keyword,
        location_code: location_code ?? 2840,
        language_code: language_code ?? "en",
        check_in,
        check_out,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "business_google_qanda_live",
    "Get Google Q&A for a business in real-time.",
    {
      keyword: z.string().describe("Business name or place ID"),
      location_code: z.number().optional(),
      language_code: z.string().optional(),
    },
    async ({ keyword, location_code, language_code }) => {
      const result = await post("/business_data/google/questions_and_answers/live", {
        keyword,
        location_code: location_code ?? 2840,
        language_code: language_code ?? "en",
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "business_social_media_pinterest",
    "Get Pinterest social media metrics for URLs.",
    {
      targets: z.array(z.string()).describe("URLs to check Pinterest metrics for"),
    },
    async ({ targets }) => {
      const result = await post("/business_data/social_media/pinterest/live", { targets });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "business_social_media_reddit",
    "Get Reddit social media metrics for URLs.",
    {
      targets: z.array(z.string()).describe("URLs to check Reddit metrics for"),
    },
    async ({ targets }) => {
      const result = await post("/business_data/social_media/reddit/live", { targets });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // MERCHANT API - Google Shopping
  // ============================================================
  server.tool(
    "merchant_google_products_live",
    "Search Google Shopping products in real-time.",
    {
      keyword: z.string().describe("Product search keyword"),
      location_code: z.number().optional(),
      language_code: z.string().optional(),
      depth: z.number().optional(),
    },
    async ({ keyword, location_code, language_code, depth }) => {
      const result = await post("/merchant/google/products/task_post", {
        keyword,
        location_code: location_code ?? 2840,
        language_code: language_code ?? "en",
        depth: depth ?? 20,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "merchant_amazon_products_task_post",
    "Create a task to search Amazon products.",
    {
      keyword: z.string().describe("Product search keyword"),
      location_code: z.number().optional(),
      language_code: z.string().optional(),
      depth: z.number().optional(),
    },
    async ({ keyword, location_code, language_code, depth }) => {
      const result = await post("/merchant/amazon/products/task_post", {
        keyword,
        location_code: location_code ?? 2840,
        language_code: language_code ?? "en",
        depth: depth ?? 20,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "merchant_amazon_asin_task_post",
    "Get Amazon product details by ASIN.",
    {
      asin: z.string().describe("Amazon ASIN"),
      location_code: z.number().optional(),
      language_code: z.string().optional(),
    },
    async ({ asin, location_code, language_code }) => {
      const result = await post("/merchant/amazon/asin/task_post", {
        asin,
        location_code: location_code ?? 2840,
        language_code: language_code ?? "en",
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // APP DATA API
  // ============================================================
  server.tool(
    "app_google_play_search",
    "Search apps on Google Play Store.",
    {
      keyword: z.string().describe("App search keyword"),
      location_code: z.number().optional(),
      language_code: z.string().optional(),
      depth: z.number().optional(),
    },
    async ({ keyword, location_code, language_code, depth }) => {
      const result = await post("/app_data/google/app_searches/task_post", {
        keyword,
        location_code: location_code ?? 2840,
        language_code: language_code ?? "en",
        depth: depth ?? 20,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "app_google_play_info",
    "Get detailed info about a Google Play app.",
    {
      app_id: z.string().describe("Google Play app ID (e.g., 'com.example.app')"),
      location_code: z.number().optional(),
      language_code: z.string().optional(),
    },
    async ({ app_id, location_code, language_code }) => {
      const result = await post("/app_data/google/app_info/task_post", {
        app_id,
        location_code: location_code ?? 2840,
        language_code: language_code ?? "en",
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "app_apple_search",
    "Search apps on Apple App Store.",
    {
      keyword: z.string().describe("App search keyword"),
      location_code: z.number().optional(),
      language_code: z.string().optional(),
      depth: z.number().optional(),
    },
    async ({ keyword, location_code, language_code, depth }) => {
      const result = await post("/app_data/apple/app_searches/task_post", {
        keyword,
        location_code: location_code ?? 2840,
        language_code: language_code ?? "en",
        depth: depth ?? 20,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // SERP API - Google Finance
  // ============================================================
  server.tool(
    "serp_google_finance_explore_live",
    "Get Google Finance explore data (market overview).",
    {
      keyword: z.string().optional().describe("Search keyword or ticker"),
      location_code: z.number().optional(),
      language_code: z.string().optional(),
    },
    async ({ keyword, location_code, language_code }) => {
      const result = await post("/serp/google/finance_explore/live/advanced", {
        keyword,
        location_code: location_code ?? 2840,
        language_code: language_code ?? "en",
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "serp_google_finance_quote_live",
    "Get Google Finance quote for a ticker symbol.",
    {
      keyword: z.string().describe("Ticker symbol (e.g., 'AAPL')"),
      location_code: z.number().optional(),
      language_code: z.string().optional(),
    },
    async ({ keyword, location_code, language_code }) => {
      const result = await post("/serp/google/finance_quote/live/advanced", {
        keyword,
        location_code: location_code ?? 2840,
        language_code: language_code ?? "en",
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // SERP API - Google Ads Transparency
  // ============================================================
  server.tool(
    "serp_google_ads_advertisers_live",
    "Search Google Ads Transparency Center for advertisers.",
    {
      keyword: z.string().describe("Advertiser name or keyword"),
      location_code: z.number().optional(),
      language_code: z.string().optional(),
    },
    async ({ keyword, location_code, language_code }) => {
      const result = await post("/serp/google/ads_advertisers/live/advanced", {
        keyword,
        location_code: location_code ?? 2840,
        language_code: language_code ?? "en",
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // APPENDIX / UTILITY
  // ============================================================
  server.tool(
    "appendix_user_data",
    "Get your DataForSEO account data (balance, limits, usage).",
    {},
    async () => {
      const result = await get("/appendix/user_data");
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "appendix_locations",
    "Get list of available location codes for DataForSEO API.",
    {},
    async () => {
      const result = await get("/appendix/locations_and_languages");
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "appendix_categories",
    "Get list of available categories for DataForSEO API.",
    {},
    async () => {
      const result = await get("/appendix/categories");
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );
}
