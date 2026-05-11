// Ads Library tools backed by Apify actors. Three opinionated wrappers
// (Meta, Google, TikTok) plus an escape hatch (apify_run_actor) for any
// other actor in the Apify Store.
//
// Each opinionated tool takes a structured set of search params and forwards
// them as the actor input. Because Apify actors evolve, the actor ID itself
// is configurable via runtime variables (see apify-client.ts). When an actor
// is replaced or its input schema changes, swap the variable instead of
// rewriting the tool.
//
// COST: Apify actors are pay-per-result. Heavy queries can cost real money.
// All adlib tools accept a `max_items` cap (default 25) — keep it tight for
// exploration, raise only for intentional bulk pulls.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runActorSync, getConfiguredActor } from "./apify-client.js";

function formatResult(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export function registerAdLibTools(server: McpServer) {
  // ============================================================
  // META (Facebook + Instagram) AD LIBRARY
  // ============================================================
  server.tool(
    "adlib_meta_search",
    "Search the Meta Ad Library (Facebook + Instagram active ads) via an Apify scraper. Returns full creatives: headline, body copy, CTA, media URLs, advertiser page id, ad delivery start, platforms running, country/region, ad type. Works for ANY country (LATAM included) — bypasses the API restriction that limits the official Meta endpoint to EU political ads. Use this for competitive ads research: see what messaging a competitor is currently testing, what creatives they're scaling. PAY-PER-RESULT — keep max_items tight unless doing intentional bulk. The exact actor used is configurable via APIFY_ACTOR_META_ADLIB; falls back to a community-maintained actor if unset.",
    {
      search_terms: z.string().optional().describe("Free-text query: page name, brand, or keywords appearing in the ad copy."),
      page_ids: z.array(z.string()).optional().describe("Specific Facebook page IDs to pull all active ads for."),
      country: z.string().optional().describe("ISO-3166 country code (e.g. 'CO', 'MX', 'US', 'AR'). Default: 'ALL'."),
      ad_type: z.enum(["all", "political_and_issue_ads", "housing_ads", "employment_ads", "credit_ads"]).optional().describe("Default 'all'. Use 'political_and_issue_ads' for compliance research."),
      ad_active_status: z.enum(["active", "inactive", "all"]).optional().describe("Default 'active' — what's running right now."),
      max_items: z.number().optional().describe("Hard cap on results returned. Default 25. Apify charges per result."),
      actor_input_overrides: z.record(z.string(), z.unknown()).optional().describe("Power-user escape: any extra fields the actor accepts, merged into the input."),
    },
    async ({ search_terms, page_ids, country, ad_type, ad_active_status, max_items, actor_input_overrides }) => {
      const actorId = await getConfiguredActor("meta");
      // The default actor (apify/facebook-ads-scraper) requires `startUrls`,
      // not free-text params. Translate our friendly inputs into proper Meta
      // Ad Library search URLs with embedded filters. If neither search_terms
      // nor page_ids is provided, return an error early.
      if (!search_terms && (!page_ids || page_ids.length === 0)) {
        return { content: [{ type: "text" as const, text: formatResult({ error: "missing_input", hint: "Provide search_terms (keyword) or page_ids (Facebook page IDs)." }) }] };
      }
      const startUrls: Array<{ url: string }> = [];
      const baseCountry = (country ?? "ALL").toUpperCase();
      const baseStatus = ad_active_status ?? "active";
      const baseAdType = ad_type ?? "all";
      if (search_terms) {
        const u = new URL("https://www.facebook.com/ads/library/");
        u.searchParams.set("active_status", baseStatus);
        u.searchParams.set("ad_type", baseAdType);
        u.searchParams.set("country", baseCountry);
        u.searchParams.set("q", search_terms);
        u.searchParams.set("search_type", "keyword_unordered");
        startUrls.push({ url: u.toString() });
      }
      if (page_ids) {
        for (const pid of page_ids) {
          const u = new URL("https://www.facebook.com/ads/library/");
          u.searchParams.set("active_status", baseStatus);
          u.searchParams.set("ad_type", baseAdType);
          u.searchParams.set("country", baseCountry);
          u.searchParams.set("search_type", "page");
          u.searchParams.set("view_all_page_id", pid);
          startUrls.push({ url: u.toString() });
        }
      }
      const input: Record<string, unknown> = {
        startUrls,
        resultsLimit: max_items ?? 25,
        activeStatus: baseStatus,
        isDetailsPerAd: false,
        includeAboutPage: false,
        // Legacy/alternative actors may use these instead — included for
        // forward-compat with overridden actor IDs:
        searchTerms: search_terms,
        country: baseCountry,
        adType: baseAdType,
        ...(actor_input_overrides ?? {}),
      };
      const items = await runActorSync(actorId, input, { max_items: max_items ?? 25 });
      return { content: [{ type: "text" as const, text: formatResult({ actor: actorId, items_count: items.length, items }) }] };
    }
  );

  // ============================================================
  // GOOGLE ADS TRANSPARENCY CENTER
  // ============================================================
  server.tool(
    "adlib_google_search",
    "Pull individual creatives from the Google Ads Transparency Center via an Apify scraper. Returns ad units: format (text/image/video), creative copy, image/video URLs, landing pages, regions where served, first/last seen, targeting hints. Pairs with serp_google_ads_advertisers_live: that one DISCOVERS advertisers and gives you advertiser_ids; this one PULLS the actual creatives for those advertisers. Works for LATAM. PAY-PER-RESULT — keep max_items tight. Actor ID is configurable via APIFY_ACTOR_GOOGLE_ADLIB.",
    {
      advertiser_id: z.string().optional().describe("Google advertiser ID (e.g. 'AR11877675844556029953'). Get from serp_google_ads_advertisers_live."),
      domain: z.string().optional().describe("Advertiser domain (e.g. 'sae.edu') — actor uses this if advertiser_id missing."),
      region: z.string().optional().describe("ISO region (CO, MX, US, AR, BR...). Default 'anywhere'."),
      ad_format: z.enum(["all", "text", "image", "video"]).optional().describe("Default 'all'."),
      date_range_start: z.string().optional().describe("YYYY-MM-DD. Filter by first-seen date if supported by actor."),
      date_range_end: z.string().optional().describe("YYYY-MM-DD."),
      max_items: z.number().optional().describe("Default 25."),
      actor_input_overrides: z.record(z.string(), z.unknown()).optional(),
    },
    async ({ advertiser_id, domain, region, ad_format, date_range_start, date_range_end, max_items, actor_input_overrides }) => {
      const actorId = await getConfiguredActor("google");
      // Default actor (solidcode/ads-transparency-scraper) takes a free-text
      // searchQuery + region. It doesn't accept advertiser_id directly, so we
      // fall back to using the domain (or advertiser_id as a string) as the
      // search query.
      const searchQuery = domain ?? advertiser_id ?? "";
      if (!searchQuery) {
        return { content: [{ type: "text" as const, text: formatResult({ error: "missing_input", hint: "Provide domain (preferred) or advertiser_id. solidcode/ads-transparency-scraper searches by free-text query, so a domain like 'sae.edu' works better than an advertiser ID." }) }] };
      }
      const input: Record<string, unknown> = {
        searchQuery,
        region: region ?? "anywhere",
        maxResults: max_items ?? 25,
        ...(ad_format && ad_format !== "all" ? { platform: ad_format } : {}),
        ...(date_range_start ? { dateFrom: date_range_start } : {}),
        ...(date_range_end ? { dateTo: date_range_end } : {}),
        // forward-compat aliases for alternate actors
        advertiserId: advertiser_id,
        advertiserDomain: domain,
        ...(actor_input_overrides ?? {}),
      };
      const items = await runActorSync(actorId, input, { max_items: max_items ?? 25 });
      return { content: [{ type: "text" as const, text: formatResult({ actor: actorId, items_count: items.length, items }) }] };
    }
  );

  // ============================================================
  // TIKTOK COMMERCIAL CONTENT LIBRARY
  // ============================================================
  server.tool(
    "adlib_tiktok_search",
    "Search TikTok 'Top Ads' (sourced from TikTok Creative Center, NOT the EU-only Commercial Content Library). Covers 80+ countries including Colombia (CO), Mexico (MX), Argentina (AR), Brazil (BR), US, and more. Returns trending paid TikTok creatives with CTR, impressions, likes, conversion rates, video URLs, advertiser info, industry classification. Filter by country, keyword, industry, ad language, or sort by performance. PAY-PER-RESULT. This is the right tool for LATAM competitive ads research on TikTok.",
    {
      advertiser_name: z.string().optional().describe("Advertiser brand name as it appears on TikTok."),
      keyword: z.string().optional().describe("Keyword in the ad description or caption."),
      country: z.string().optional().describe("ISO country (CO, MX, US...). Default 'ALL'."),
      max_items: z.number().optional().describe("Default 25."),
      actor_input_overrides: z.record(z.string(), z.unknown()).optional(),
    },
    async ({ advertiser_name, keyword, country, max_items, actor_input_overrides }) => {
      const actorId = await getConfiguredActor("tiktok");
      // Default actor (burbn/tiktok-top-ads-spy) pulls from TikTok Creative
      // Center which has 80+ country coverage including LATAM. Schema:
      //   required: page (pagination, default 1)
      //   country_code: '' (any) or ISO-2 from 82-entry enum
      //   keyword: free-text search
      //   period: '7' | '30' | '180' days
      //   order_by: ctr | impression | like | cvr | play_6s_rate | play_2s_rate
      //   maxResults / limit
      // The actor doesn't have a dedicated 'advertiser_name' field — pass
      // advertiser as keyword.
      const query = keyword ?? advertiser_name ?? "";
      const input: Record<string, unknown> = {
        page: 1,
        country_code: country ? country.toUpperCase() : "",
        period: "30",
        order_by: "ctr",
        maxResults: max_items ?? 25,
        limit: max_items ?? 25,
        ...(query ? { keyword: query } : {}),
        // forward-compat for alternate actors that use the older schema
        region: country ?? "all",
        query,
        queryType: advertiser_name ? "1" : "2",
        ...(actor_input_overrides ?? {}),
      };
      const items = await runActorSync(actorId, input, { max_items: max_items ?? 25 });
      return { content: [{ type: "text" as const, text: formatResult({
        actor: actorId,
        items_count: items.length,
        country_used: country ?? "any",
        items,
      }) }] };
    }
  );

  // ============================================================
  // ESCAPE HATCH: any Apify actor
  // ============================================================
  server.tool(
    "apify_run_actor",
    "Power-user escape hatch: run ANY Apify actor by ID with arbitrary input and return its dataset items. Use when you find a better/newer actor in the Apify Store than the defaults wired into adlib_meta_search / adlib_google_search / adlib_tiktok_search, or when you need a non-ads actor (e.g. SERP scrapers, web crawlers). Refer to the actor's own page on apify.com/store for the input schema. PAY-PER-RESULT — Apify charges based on the actor's pricing model.",
    {
      actor_id: z.string().describe("Apify actor ID, formatted 'owner/name' (e.g. 'apify/web-scraper') or the 17-char internal ID."),
      actor_input: z.record(z.string(), z.unknown()).describe("Input object matching the actor's schema. See its page on apify.com/store."),
      max_items: z.number().optional().describe("Hard cap on dataset items returned. Default 50."),
      timeout_ms: z.number().optional().describe("Max wait for the actor to finish. Default 240000 (4 min). Vercel kills functions at 300s."),
    },
    async ({ actor_id, actor_input, max_items, timeout_ms }) => {
      const items = await runActorSync(actor_id, actor_input, {
        max_items: max_items ?? 50,
        timeout_ms,
      });
      return { content: [{ type: "text" as const, text: formatResult({ actor: actor_id, items_count: items.length, items }) }] };
    }
  );
}
