import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { serpApiRequest } from "./serpapi-client.js";

function formatResult(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export function registerSerpApiTools(server: McpServer) {
  // ============================================================
  // GOOGLE SEARCH
  // ============================================================
  server.tool(
    "serpapi_google_search",
    "Search Google via SerpAPI. Returns organic results, knowledge graph, ads, related searches, etc.",
    {
      q: z.string().describe("Search query"),
      location: z.string().optional().describe("Location (e.g., 'Austin, Texas')"),
      gl: z.string().optional().describe("Country code (e.g., 'us')"),
      hl: z.string().optional().describe("Language (e.g., 'en')"),
      num: z.number().optional().describe("Number of results"),
      start: z.number().optional().describe("Pagination offset"),
      device: z.enum(["desktop", "tablet", "mobile"]).optional(),
      safe: z.enum(["active", "off"]).optional(),
    },
    async ({ q, location, gl, hl, num, start, device, safe }) => {
      const result = await serpApiRequest({
        engine: "google",
        q, location, gl, hl, num, start, device, safe,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // GOOGLE AI MODE
  // ============================================================
  server.tool(
    "serpapi_google_ai_mode",
    "Get Google AI Mode (AI Overview) results via SerpAPI.",
    {
      q: z.string().describe("Search query"),
      location: z.string().optional(),
      gl: z.string().optional(),
      hl: z.string().optional(),
    },
    async ({ q, location, gl, hl }) => {
      const result = await serpApiRequest({
        engine: "google_ai_mode",
        q, location, gl, hl,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // GOOGLE IMAGES
  // ============================================================
  server.tool(
    "serpapi_google_images",
    "Search Google Images via SerpAPI.",
    {
      q: z.string().describe("Image search query"),
      location: z.string().optional(),
      gl: z.string().optional(),
      hl: z.string().optional(),
      device: z.enum(["desktop", "tablet", "mobile"]).optional(),
    },
    async ({ q, location, gl, hl, device }) => {
      const result = await serpApiRequest({
        engine: "google_images",
        q, location, gl, hl, device,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // GOOGLE MAPS
  // ============================================================
  server.tool(
    "serpapi_google_maps",
    "Search Google Maps via SerpAPI for local business data.",
    {
      q: z.string().describe("Search query (e.g., 'pizza near me')"),
      ll: z.string().optional().describe("GPS coordinates (@lat,lng,zoom)"),
      location: z.string().optional(),
      gl: z.string().optional(),
      hl: z.string().optional(),
      type: z.enum(["search", "place"]).optional(),
    },
    async ({ q, ll, location, gl, hl, type }) => {
      const result = await serpApiRequest({
        engine: "google_maps",
        q, ll, location, gl, hl, type,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // GOOGLE MAPS REVIEWS
  // ============================================================
  server.tool(
    "serpapi_google_maps_reviews",
    "Get Google Maps reviews for a place via SerpAPI.",
    {
      place_id: z.string().optional().describe("Google Place ID"),
      data_id: z.string().optional().describe("Google Maps data ID"),
      hl: z.string().optional(),
      sort_by: z.enum(["qualityScore", "newestFirst", "ratingHigh", "ratingLow"]).optional(),
    },
    async ({ place_id, data_id, hl, sort_by }) => {
      const result = await serpApiRequest({
        engine: "google_maps_reviews",
        place_id, data_id, hl, sort_by,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // GOOGLE NEWS
  // ============================================================
  server.tool(
    "serpapi_google_news",
    "Search Google News via SerpAPI.",
    {
      q: z.string().describe("News search query"),
      location: z.string().optional(),
      gl: z.string().optional(),
      hl: z.string().optional(),
    },
    async ({ q, location, gl, hl }) => {
      const result = await serpApiRequest({
        engine: "google_news",
        q, location, gl, hl,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // GOOGLE SHOPPING
  // ============================================================
  server.tool(
    "serpapi_google_shopping",
    "Search Google Shopping via SerpAPI.",
    {
      q: z.string().describe("Product search query"),
      location: z.string().optional(),
      gl: z.string().optional(),
      hl: z.string().optional(),
      tbs: z.string().optional().describe("Price/filter params"),
    },
    async ({ q, location, gl, hl, tbs }) => {
      const result = await serpApiRequest({
        engine: "google_shopping",
        q, location, gl, hl, tbs,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // GOOGLE JOBS
  // ============================================================
  server.tool(
    "serpapi_google_jobs",
    "Search Google Jobs via SerpAPI.",
    {
      q: z.string().describe("Job search query"),
      location: z.string().optional(),
      gl: z.string().optional(),
      hl: z.string().optional(),
    },
    async ({ q, location, gl, hl }) => {
      const result = await serpApiRequest({
        engine: "google_jobs",
        q, location, gl, hl,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // GOOGLE SCHOLAR
  // ============================================================
  server.tool(
    "serpapi_google_scholar",
    "Search Google Scholar for academic papers and citations.",
    {
      q: z.string().describe("Academic search query"),
      hl: z.string().optional(),
      as_ylo: z.string().optional().describe("Year range start"),
      as_yhi: z.string().optional().describe("Year range end"),
      start: z.number().optional(),
    },
    async ({ q, hl, as_ylo, as_yhi, start }) => {
      const result = await serpApiRequest({
        engine: "google_scholar",
        q, hl, as_ylo, as_yhi, start,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // GOOGLE TRENDS
  // ============================================================
  server.tool(
    "serpapi_google_trends",
    "Get Google Trends data via SerpAPI. Compare keyword interest over time.",
    {
      q: z.string().describe("Keyword(s) to analyze (comma-separated for comparison)"),
      data_type: z.enum(["TIMESERIES", "GEO_MAP", "GEO_MAP_0", "RELATED_TOPICS", "RELATED_QUERIES"]).optional(),
      date: z.string().optional().describe("Time range (e.g., 'today 12-m', 'today 5-y', '2020-01-01 2023-12-31')"),
      geo: z.string().optional().describe("Country code (e.g., 'US')"),
      cat: z.string().optional().describe("Category ID"),
      hl: z.string().optional(),
    },
    async ({ q, data_type, date, geo, cat, hl }) => {
      const result = await serpApiRequest({
        engine: "google_trends",
        q, data_type, date, geo, cat, hl,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // GOOGLE LENS
  // ============================================================
  server.tool(
    "serpapi_google_lens",
    "Search by image using Google Lens via SerpAPI.",
    {
      url: z.string().describe("Image URL to search"),
      hl: z.string().optional(),
      gl: z.string().optional(),
    },
    async ({ url, hl, gl }) => {
      const result = await serpApiRequest({
        engine: "google_lens",
        url, hl, gl,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // GOOGLE FLIGHTS
  // ============================================================
  server.tool(
    "serpapi_google_flights",
    "Search Google Flights via SerpAPI.",
    {
      departure_id: z.string().describe("Departure airport code (e.g., 'JFK')"),
      arrival_id: z.string().describe("Arrival airport code (e.g., 'LAX')"),
      outbound_date: z.string().describe("Outbound date (YYYY-MM-DD)"),
      return_date: z.string().optional().describe("Return date (YYYY-MM-DD)"),
      type: z.enum(["1", "2", "3"]).optional().describe("1=round trip, 2=one way, 3=multi-city"),
      travel_class: z.enum(["1", "2", "3", "4"]).optional().describe("1=economy, 2=premium, 3=business, 4=first"),
      adults: z.number().optional(),
      hl: z.string().optional(),
      gl: z.string().optional(),
    },
    async ({ departure_id, arrival_id, outbound_date, return_date, type, travel_class, adults, hl, gl }) => {
      const result = await serpApiRequest({
        engine: "google_flights",
        departure_id, arrival_id, outbound_date, return_date,
        type: type ?? "1",
        travel_class: travel_class ?? "1",
        adults: adults ?? 1,
        hl, gl,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // GOOGLE HOTELS
  // ============================================================
  server.tool(
    "serpapi_google_hotels",
    "Search Google Hotels via SerpAPI.",
    {
      q: z.string().describe("Hotel search query"),
      check_in_date: z.string().describe("Check-in date (YYYY-MM-DD)"),
      check_out_date: z.string().describe("Check-out date (YYYY-MM-DD)"),
      gl: z.string().optional(),
      hl: z.string().optional(),
      adults: z.number().optional(),
    },
    async ({ q, check_in_date, check_out_date, gl, hl, adults }) => {
      const result = await serpApiRequest({
        engine: "google_hotels",
        q, check_in_date, check_out_date, gl, hl, adults,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // GOOGLE FINANCE
  // ============================================================
  server.tool(
    "serpapi_google_finance",
    "Get Google Finance data for a stock ticker via SerpAPI.",
    {
      q: z.string().describe("Ticker symbol (e.g., 'GOOG:NASDAQ')"),
      hl: z.string().optional(),
      gl: z.string().optional(),
    },
    async ({ q, hl, gl }) => {
      const result = await serpApiRequest({
        engine: "google_finance",
        q, hl, gl,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // GOOGLE AUTOCOMPLETE
  // ============================================================
  server.tool(
    "serpapi_google_autocomplete",
    "Get Google Autocomplete suggestions via SerpAPI.",
    {
      q: z.string().describe("Partial search query"),
      gl: z.string().optional(),
      hl: z.string().optional(),
    },
    async ({ q, gl, hl }) => {
      const result = await serpApiRequest({
        engine: "google_autocomplete",
        q, gl, hl,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // GOOGLE EVENTS
  // ============================================================
  server.tool(
    "serpapi_google_events",
    "Search Google Events via SerpAPI.",
    {
      q: z.string().describe("Event search query"),
      location: z.string().optional(),
      gl: z.string().optional(),
      hl: z.string().optional(),
    },
    async ({ q, location, gl, hl }) => {
      const result = await serpApiRequest({
        engine: "google_events",
        q, location, gl, hl,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // GOOGLE PATENTS
  // ============================================================
  server.tool(
    "serpapi_google_patents",
    "Search Google Patents via SerpAPI.",
    {
      q: z.string().describe("Patent search query"),
      hl: z.string().optional(),
    },
    async ({ q, hl }) => {
      const result = await serpApiRequest({
        engine: "google_patents",
        q, hl,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // GOOGLE PLAY STORE
  // ============================================================
  server.tool(
    "serpapi_google_play",
    "Search Google Play Store apps via SerpAPI.",
    {
      q: z.string().describe("App search query"),
      gl: z.string().optional(),
      hl: z.string().optional(),
      store: z.enum(["apps", "books", "movies"]).optional(),
    },
    async ({ q, gl, hl, store }) => {
      const result = await serpApiRequest({
        engine: "google_play",
        q, gl, hl, store: store ?? "apps",
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // GOOGLE RELATED QUESTIONS
  // ============================================================
  server.tool(
    "serpapi_google_related_questions",
    "Get 'People Also Ask' related questions via SerpAPI.",
    {
      q: z.string().describe("Search query"),
      location: z.string().optional(),
      gl: z.string().optional(),
      hl: z.string().optional(),
    },
    async ({ q, location, gl, hl }) => {
      const result = await serpApiRequest({
        engine: "google_related_questions",
        q, location, gl, hl,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // GOOGLE ADS TRANSPARENCY
  // ============================================================
  server.tool(
    "serpapi_google_ads_transparency",
    "Search Google Ads Transparency Center via SerpAPI.",
    {
      q: z.string().describe("Advertiser name or search term"),
      gl: z.string().optional(),
      hl: z.string().optional(),
    },
    async ({ q, gl, hl }) => {
      const result = await serpApiRequest({
        engine: "google_ads_transparency",
        q, gl, hl,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // GOOGLE LOCAL SERVICES
  // ============================================================
  server.tool(
    "serpapi_google_local_services",
    "Search Google Local Services via SerpAPI.",
    {
      q: z.string().describe("Service search query"),
      place_id: z.string().optional(),
      location: z.string().optional(),
      gl: z.string().optional(),
      hl: z.string().optional(),
    },
    async ({ q, place_id, location, gl, hl }) => {
      const result = await serpApiRequest({
        engine: "google_local_services",
        q, place_id, location, gl, hl,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // GOOGLE VIDEOS
  // ============================================================
  server.tool(
    "serpapi_google_videos",
    "Search Google Videos via SerpAPI.",
    {
      q: z.string().describe("Video search query"),
      location: z.string().optional(),
      gl: z.string().optional(),
      hl: z.string().optional(),
    },
    async ({ q, location, gl, hl }) => {
      const result = await serpApiRequest({
        engine: "google_videos",
        q, location, gl, hl,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // GOOGLE FORUMS
  // ============================================================
  server.tool(
    "serpapi_google_forums",
    "Search Google Forums (Discussions) via SerpAPI.",
    {
      q: z.string().describe("Forum search query"),
      location: z.string().optional(),
      gl: z.string().optional(),
      hl: z.string().optional(),
    },
    async ({ q, location, gl, hl }) => {
      const result = await serpApiRequest({
        engine: "google_forums",
        q, location, gl, hl,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // GOOGLE REVERSE IMAGE
  // ============================================================
  server.tool(
    "serpapi_google_reverse_image",
    "Reverse image search on Google via SerpAPI.",
    {
      image_url: z.string().describe("URL of the image to reverse search"),
      gl: z.string().optional(),
      hl: z.string().optional(),
    },
    async ({ image_url, gl, hl }) => {
      const result = await serpApiRequest({
        engine: "google_reverse_image",
        image_url, gl, hl,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // GOOGLE TRAVEL EXPLORE
  // ============================================================
  server.tool(
    "serpapi_google_travel_explore",
    "Explore travel destinations via Google Travel SerpAPI.",
    {
      q: z.string().describe("Origin location"),
      hl: z.string().optional(),
      gl: z.string().optional(),
    },
    async ({ q, hl, gl }) => {
      const result = await serpApiRequest({
        engine: "google_travel_explore",
        q, hl, gl,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // YOUTUBE SEARCH
  // ============================================================
  server.tool(
    "serpapi_youtube_search",
    "Search YouTube videos via SerpAPI.",
    {
      search_query: z.string().describe("YouTube search query"),
      gl: z.string().optional(),
      hl: z.string().optional(),
    },
    async ({ search_query, gl, hl }) => {
      const result = await serpApiRequest({
        engine: "youtube",
        search_query, gl, hl,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // BING SEARCH
  // ============================================================
  server.tool(
    "serpapi_bing_search",
    "Search Bing via SerpAPI.",
    {
      q: z.string().describe("Search query"),
      location: z.string().optional(),
      mkt: z.string().optional().describe("Market code (e.g., 'en-US')"),
      cc: z.string().optional().describe("Country code"),
      device: z.enum(["desktop", "tablet", "mobile"]).optional(),
      first: z.number().optional().describe("Pagination offset"),
    },
    async ({ q, location, mkt, cc, device, first }) => {
      const result = await serpApiRequest({
        engine: "bing",
        q, location, mkt, cc, device, first,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // BING IMAGES
  // ============================================================
  server.tool(
    "serpapi_bing_images",
    "Search Bing Images via SerpAPI.",
    {
      q: z.string().describe("Image search query"),
      mkt: z.string().optional(),
      cc: z.string().optional(),
    },
    async ({ q, mkt, cc }) => {
      const result = await serpApiRequest({
        engine: "bing_images",
        q, mkt, cc,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // BING COPILOT
  // ============================================================
  server.tool(
    "serpapi_bing_copilot",
    "Search Bing Copilot (AI mode) via SerpAPI.",
    {
      q: z.string().describe("Search query"),
      mkt: z.string().optional(),
    },
    async ({ q, mkt }) => {
      const result = await serpApiRequest({
        engine: "bing_copilot",
        q, mkt,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // YAHOO SEARCH
  // ============================================================
  server.tool(
    "serpapi_yahoo_search",
    "Search Yahoo via SerpAPI.",
    {
      p: z.string().describe("Search query"),
      vl: z.string().optional().describe("Language"),
      vc: z.string().optional().describe("Country"),
    },
    async ({ p, vl, vc }) => {
      const result = await serpApiRequest({
        engine: "yahoo",
        p, vl, vc,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // DUCKDUCKGO SEARCH
  // ============================================================
  server.tool(
    "serpapi_duckduckgo_search",
    "Search DuckDuckGo via SerpAPI.",
    {
      q: z.string().describe("Search query"),
      kl: z.string().optional().describe("Region (e.g., 'us-en')"),
    },
    async ({ q, kl }) => {
      const result = await serpApiRequest({
        engine: "duckduckgo",
        q, kl,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // BAIDU SEARCH
  // ============================================================
  server.tool(
    "serpapi_baidu_search",
    "Search Baidu (Chinese search engine) via SerpAPI.",
    {
      q: z.string().describe("Search query"),
    },
    async ({ q }) => {
      const result = await serpApiRequest({
        engine: "baidu",
        q,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // NAVER SEARCH
  // ============================================================
  server.tool(
    "serpapi_naver_search",
    "Search Naver (Korean search engine) via SerpAPI.",
    {
      query: z.string().describe("Search query"),
    },
    async ({ query }) => {
      const result = await serpApiRequest({
        engine: "naver",
        query,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // YANDEX SEARCH
  // ============================================================
  server.tool(
    "serpapi_yandex_search",
    "Search Yandex (Russian search engine) via SerpAPI.",
    {
      text: z.string().describe("Search query"),
      lr: z.string().optional().describe("Region code"),
    },
    async ({ text, lr }) => {
      const result = await serpApiRequest({
        engine: "yandex",
        text, lr,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // BRAVE AI MODE
  // ============================================================
  server.tool(
    "serpapi_brave_ai_mode",
    "Search Brave with AI mode via SerpAPI.",
    {
      q: z.string().describe("Search query"),
    },
    async ({ q }) => {
      const result = await serpApiRequest({
        engine: "brave_ai_mode",
        q,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // AMAZON SEARCH
  // ============================================================
  server.tool(
    "serpapi_amazon_search",
    "Search Amazon products via SerpAPI.",
    {
      q: z.string().describe("Product search query"),
      amazon_domain: z.string().optional().describe("Amazon domain (e.g., 'amazon.com')"),
    },
    async ({ q, amazon_domain }) => {
      const result = await serpApiRequest({
        engine: "amazon",
        q,
        amazon_domain: amazon_domain ?? "amazon.com",
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // AMAZON PRODUCT
  // ============================================================
  server.tool(
    "serpapi_amazon_product",
    "Get Amazon product details by ASIN via SerpAPI.",
    {
      product_id: z.string().describe("Amazon ASIN"),
      amazon_domain: z.string().optional(),
    },
    async ({ product_id, amazon_domain }) => {
      const result = await serpApiRequest({
        engine: "amazon_product",
        product_id,
        amazon_domain: amazon_domain ?? "amazon.com",
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // WALMART SEARCH
  // ============================================================
  server.tool(
    "serpapi_walmart_search",
    "Search Walmart products via SerpAPI.",
    {
      query: z.string().describe("Product search query"),
    },
    async ({ query }) => {
      const result = await serpApiRequest({
        engine: "walmart",
        query,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // EBAY SEARCH
  // ============================================================
  server.tool(
    "serpapi_ebay_search",
    "Search eBay products via SerpAPI.",
    {
      _nkw: z.string().describe("Product search query"),
      ebay_domain: z.string().optional().describe("eBay domain (e.g., 'ebay.com')"),
    },
    async ({ _nkw, ebay_domain }) => {
      const result = await serpApiRequest({
        engine: "ebay",
        _nkw,
        ebay_domain: ebay_domain ?? "ebay.com",
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // HOME DEPOT SEARCH
  // ============================================================
  server.tool(
    "serpapi_home_depot_search",
    "Search Home Depot products via SerpAPI.",
    {
      q: z.string().describe("Product search query"),
    },
    async ({ q }) => {
      const result = await serpApiRequest({
        engine: "home_depot",
        q,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // APPLE APP STORE
  // ============================================================
  server.tool(
    "serpapi_apple_app_store",
    "Search Apple App Store via SerpAPI.",
    {
      term: z.string().describe("App search query"),
      country: z.string().optional().describe("Country code (e.g., 'us')"),
    },
    async ({ term, country }) => {
      const result = await serpApiRequest({
        engine: "apple_app_store",
        term,
        country: country ?? "us",
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // FACEBOOK PROFILE
  // ============================================================
  server.tool(
    "serpapi_facebook_profile",
    "Get public Facebook profile/page data via SerpAPI.",
    {
      q: z.string().describe("Facebook page or profile name"),
    },
    async ({ q }) => {
      const result = await serpApiRequest({
        engine: "facebook_profile",
        q,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // YELP SEARCH
  // ============================================================
  server.tool(
    "serpapi_yelp_search",
    "Search Yelp businesses via SerpAPI.",
    {
      find_desc: z.string().describe("Business type or name"),
      find_loc: z.string().describe("Location (e.g., 'San Francisco, CA')"),
    },
    async ({ find_desc, find_loc }) => {
      const result = await serpApiRequest({
        engine: "yelp",
        find_desc, find_loc,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // TRIPADVISOR SEARCH
  // ============================================================
  server.tool(
    "serpapi_tripadvisor_search",
    "Search Tripadvisor via SerpAPI.",
    {
      q: z.string().describe("Search query"),
    },
    async ({ q }) => {
      const result = await serpApiRequest({
        engine: "tripadvisor",
        q,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  // ============================================================
  // OPENTABLE REVIEWS
  // ============================================================
  server.tool(
    "serpapi_opentable_reviews",
    "Get OpenTable restaurant reviews via SerpAPI.",
    {
      restaurant_id: z.string().describe("OpenTable restaurant ID"),
    },
    async ({ restaurant_id }) => {
      const result = await serpApiRequest({
        engine: "opentable_reviews",
        restaurant_id,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );
}
