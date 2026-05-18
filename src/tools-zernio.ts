import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDefaultZernioProfileId, zernioDelete, zernioGet, zernioPatch, zernioPost, zernioPut } from "./zernio-client.js";

function formatResult(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

const zernioPlatform = z.enum([
  "facebook",
  "instagram",
  "linkedin",
  "linkedinads",
  "twitter",
  "tiktok",
  "tiktokads",
  "youtube",
  "threads",
  "reddit",
  "pinterest",
  "bluesky",
  "googlebusiness",
  "googleads",
  "telegram",
  "snapchat",
  "discord",
]);

const postStatus = z.enum(["draft", "scheduled", "published", "failed"]);
const mediaType = z.enum(["image", "video", "carousel", "document"]);
const instagramMediaType = z.enum(["image", "video"]);
const tiktokPrivacyLevel = z.enum(["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"]);
const analyticsSource = z.enum(["all", "late", "external"]);
const analyticsMetricType = z.enum(["time_series", "total_value"]);
const adTreePlatform = z.enum(["facebook", "instagram", "tiktok", "linkedin", "pinterest", "google", "twitter"]);
const adTreeStatus = z.enum(["active", "paused", "pending_review", "rejected", "completed", "cancelled", "error"]);
const adTreeSource = z.enum(["all", "zernio"]);
const youtubeMetricType = z.enum(["time_series", "total_value"]);
const gmbMediaCategory = z.enum(["COVER", "PROFILE", "LOGO", "EXTERIOR", "INTERIOR", "FOOD_AND_DRINK", "MENU", "PRODUCT", "TEAMS", "ADDITIONAL"]);
const gmbPlaceActionType = z.enum(["APPOINTMENT", "ONLINE_APPOINTMENT", "DINING_RESERVATION", "FOOD_ORDERING", "FOOD_DELIVERY", "FOOD_TAKEOUT", "SHOP_ONLINE"]);
const gmbPostTopicType = z.enum(["STANDARD", "EVENT", "OFFER"]);

const mediaItemSchema = z.object({
  type: mediaType.describe("Media type recognized by Zernio."),
  url: z.string().describe("Public URL for the media asset."),
  altText: z.string().optional().describe("Optional alt text when the target platform supports it."),
});

const platformTargetSchema = z.object({
  platform: zernioPlatform,
  accountId: z.string().optional().describe("Connected social account ID in Zernio."),
  profileId: z.string().optional().describe("Optional Zernio profile scope when accountId is unknown."),
  customContent: z.string().optional().describe("Platform-specific content override."),
  platformSpecificData: z.record(z.string(), z.unknown()).optional().describe("Raw Zernio per-platform payload for advanced options."),
});

const instagramTagSchema = z.object({
  username: z.string().describe("Instagram username to tag."),
  x: z.number().min(0).max(1).describe("Horizontal position from 0 to 1."),
  y: z.number().min(0).max(1).describe("Vertical position from 0 to 1."),
  media_index: z.number().int().min(0).optional().describe("For carousels, which media item should carry the tag."),
});

const instagramSchedulingShape = {
  account_id: z.string().optional().describe("Instagram connected account ID. If omitted and only one IG account exists in the target profile, it is auto-selected."),
  profile_id: z.string().optional().describe("Zernio profile ID. Uses ZERNIO_DEFAULT_PROFILE_ID if omitted."),
  publish_now: z.boolean().optional().describe("Publish immediately."),
  is_draft: z.boolean().optional().describe("Save as draft instead of scheduling/publishing."),
  scheduled_for: z.string().optional().describe("ISO datetime for scheduled publishing."),
  timezone: z.string().optional().describe("Timezone for scheduled publishing. Default UTC."),
};

const tiktokSchedulingShape = {
  account_id: z.string().optional().describe("TikTok connected account ID. If omitted and only one TikTok account exists in the target profile, it is auto-selected."),
  profile_id: z.string().optional().describe("Zernio profile ID. Uses ZERNIO_DEFAULT_PROFILE_ID if omitted."),
  publish_now: z.boolean().optional().describe("Publish immediately."),
  is_draft: z.boolean().optional().describe("Save as draft instead of scheduling/publishing."),
  scheduled_for: z.string().optional().describe("ISO datetime for scheduled publishing."),
  timezone: z.string().optional().describe("Timezone for scheduled publishing. Default UTC."),
};

type ZernioAccount = Record<string, unknown>;
type CorePublishingPlatform = "instagram" | "tiktok" | "linkedin" | "youtube" | "googlebusiness";

export function registerZernioTools(server: McpServer) {
  server.tool(
    "zernio_profiles_list",
    "List Zernio profiles (brand/workspace containers for social accounts).",
    {
      include_over_limit: z.boolean().optional().describe("When true, includes profiles that exceed the current plan limit."),
    },
    async ({ include_over_limit }) => {
      const result = await zernioGet("/profiles", { includeOverLimit: include_over_limit ?? false });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_profiles_create",
    "Create a new Zernio profile to group social accounts for one brand or workspace.",
    {
      name: z.string().describe("Profile name."),
      description: z.string().optional().describe("Optional profile description."),
      color: z.string().optional().describe("Optional hex color, e.g. #ffeda0."),
    },
    async ({ name, description, color }) => {
      const result = await zernioPost("/profiles", { name, description, color });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_accounts_list",
    "List connected Zernio social accounts, optionally filtered by profile or platform.",
    {
      profile_id: z.string().optional().describe("Filter accounts by Zernio profile ID."),
      platform: zernioPlatform.optional().describe("Filter by platform."),
      include_over_limit: z.boolean().optional().describe("When true, includes accounts belonging to over-limit profiles."),
      page: z.number().optional().describe("Page number for server-side pagination."),
      limit: z.number().optional().describe("Page size for server-side pagination."),
    },
    async ({ profile_id, platform, include_over_limit, page, limit }) => {
      const result = await zernioGet("/accounts", {
        profileId: profile_id,
        platform,
        includeOverLimit: include_over_limit ?? false,
        page,
        limit,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_connect_get_url",
    "Get the OAuth connect URL for a social platform in Zernio. Use this to connect a new social account to a profile.",
    {
      platform: zernioPlatform.describe("Social platform to connect."),
      profile_id: z.string().optional().describe("Target Zernio profile ID. Uses ZERNIO_DEFAULT_PROFILE_ID if omitted."),
      redirect_url: z.string().optional().describe("Optional custom redirect URL after OAuth completes."),
      headless: z.boolean().optional().describe("When true, Zernio returns raw OAuth data to the redirect URL for a custom UI flow."),
    },
    async ({ platform, profile_id, redirect_url, headless }) => {
      const resolvedProfileId = profile_id ?? await getDefaultZernioProfileId();
      if (!resolvedProfileId) {
        throw new Error("profile_id is required unless ZERNIO_DEFAULT_PROFILE_ID is configured.");
      }
      const connectPath = resolveConnectPath(platform);
      const result = await zernioGet(connectPath, {
        profileId: resolvedProfileId,
        redirect_url,
        headless: headless ?? false,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_posts_list",
    "List Zernio posts with filters for status, platform, profile, account, date range, and search text.",
    {
      page: z.number().optional().describe("Page number (1-based)."),
      limit: z.number().optional().describe("Page size. Max 100 according to Zernio docs."),
      status: postStatus.optional().describe("Filter by post status."),
      platform: zernioPlatform.optional().describe("Filter by platform."),
      profile_id: z.string().optional().describe("Filter by Zernio profile ID."),
      account_id: z.string().optional().describe("Filter by connected social account ID."),
      date_from: z.string().optional().describe("Lower date bound, YYYY-MM-DD."),
      date_to: z.string().optional().describe("Upper date bound, YYYY-MM-DD."),
      include_hidden: z.boolean().optional().describe("Include hidden posts."),
      search: z.string().optional().describe("Search posts by text content."),
      sort_by: z.enum(["scheduled-desc", "scheduled-asc", "created-desc", "created-asc", "status", "platform"]).optional(),
    },
    async ({ page, limit, status, platform, profile_id, account_id, date_from, date_to, include_hidden, search, sort_by }) => {
      const result = await zernioGet("/posts", {
        page,
        limit,
        status,
        platform,
        profileId: profile_id,
        accountId: account_id,
        dateFrom: date_from,
        dateTo: date_to,
        includeHidden: include_hidden ?? false,
        search,
        sortBy: sort_by,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_posts_get",
    "Fetch one Zernio post by ID, including platform-level publication status and public URLs when available.",
    {
      post_id: z.string().describe("Zernio post ID."),
    },
    async ({ post_id }) => {
      const result = await zernioGet(`/posts/${post_id}`);
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_posts_create",
    "Create a Zernio post as draft, scheduled, or immediate publish. Use publish_now=true for instant publishing, is_draft=true to save without scheduling.",
    {
      title: z.string().optional().describe("Optional title. Useful for YouTube or Pinterest."),
      content: z.string().optional().describe("Post text/caption. Optional when media or custom per-platform content is provided."),
      media_items: z.array(mediaItemSchema).optional().describe("Optional media assets."),
      platforms: z.array(platformTargetSchema).optional().describe("Target platforms/accounts. Required for non-draft posts."),
      scheduled_for: z.string().optional().describe("ISO datetime when the post should publish."),
      publish_now: z.boolean().optional().describe("Publish immediately."),
      is_draft: z.boolean().optional().describe("Save as draft."),
      timezone: z.string().optional().describe("Timezone for scheduled_for. Default UTC."),
      tags: z.array(z.string()).optional().describe("Internal tags / YouTube tags."),
      hashtags: z.array(z.string()).optional().describe("Hashtags stored in the post payload."),
      mentions: z.array(z.string()).optional().describe("Mentions stored in the post payload."),
      crossposting_enabled: z.boolean().optional().describe("Allow Zernio cross-posting logic. Default true."),
      queued_from_profile: z.string().optional().describe("Profile ID to schedule into the next queue slot."),
      queue_id: z.string().optional().describe("Specific queue ID when scheduling via queued_from_profile."),
      metadata: z.record(z.string(), z.unknown()).optional().describe("Raw metadata passthrough for advanced use cases."),
    },
    async ({ title, content, media_items, platforms, scheduled_for, publish_now, is_draft, timezone, tags, hashtags, mentions, crossposting_enabled, queued_from_profile, queue_id, metadata }) => {
      const result = await zernioPost("/posts", {
        title,
        content,
        mediaItems: media_items,
        platforms,
        scheduledFor: scheduled_for,
        publishNow: publish_now ?? false,
        isDraft: is_draft ?? false,
        timezone: timezone ?? "UTC",
        tags,
        hashtags,
        mentions,
        crosspostingEnabled: crossposting_enabled ?? true,
        queuedFromProfile: queued_from_profile,
        queueId: queue_id,
        metadata,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_comments_posts_list",
    "List social posts that currently have comments across connected accounts. Good first step before drilling into comment threads.",
    {
      profile_id: z.string().optional().describe("Filter by Zernio profile ID. Uses ZERNIO_DEFAULT_PROFILE_ID if omitted."),
      platform: z.enum(["facebook", "instagram", "twitter", "bluesky", "threads", "youtube", "linkedin", "reddit", "metaads"]).optional().describe("Filter by platform."),
      account_id: z.string().optional().describe("Filter by connected social account ID."),
      min_comments: z.number().int().min(0).optional().describe("Only return posts with at least this many comments."),
      since: z.string().optional().describe("ISO datetime lower bound for post creation."),
      sort_by: z.enum(["date", "comments"]).optional(),
      sort_order: z.enum(["asc", "desc"]).optional(),
      limit: z.number().int().min(1).max(100).optional(),
      cursor: z.string().optional().describe("Pagination cursor from a previous response."),
    },
    async ({ profile_id, platform, account_id, min_comments, since, sort_by, sort_order, limit, cursor }) => {
      const result = await zernioGet("/inbox/comments", {
        profileId: profile_id ?? await getDefaultZernioProfileId(),
        platform,
        accountId: account_id,
        minComments: min_comments,
        since,
        sortBy: sort_by,
        sortOrder: sort_order,
        limit: limit ?? 50,
        cursor,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_comments_get_post_comments",
    "Fetch comments for a specific social post. Use this to read real audience feedback thread-by-thread.",
    {
      post_id: z.string().describe("Zernio post ID or platform-native post ID."),
      account_id: z.string().describe("Connected social account ID that owns the post."),
      cursor: z.string().optional().describe("Pagination cursor from a previous response."),
      limit: z.number().int().min(1).max(100).optional().describe("Page size. Default 50."),
    },
    async ({ post_id, account_id, cursor, limit }) => {
      const result = await zernioGet(`/inbox/comments/${encodeURIComponent(post_id)}`, {
        accountId: account_id,
        cursor,
        limit: limit ?? 50,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_analytics_posts",
    "Get post-level analytics. With post_id, fetches a single post's metrics; without it, returns a filtered list with overview stats.",
    {
      post_id: z.string().optional().describe("Specific Zernio post ID or external post ID."),
      profile_id: z.string().optional().describe("Filter analytics by Zernio profile ID."),
      account_id: z.string().optional().describe("Filter analytics by connected account."),
      platform: zernioPlatform.optional().describe("Filter by platform."),
      source: analyticsSource.optional().describe("Whether to analyze all, only Zernio-published, or only external/imported posts."),
      from_date: z.string().optional().describe("Lower date bound YYYY-MM-DD. Defaults to 90 days ago in Zernio."),
      to_date: z.string().optional().describe("Upper date bound YYYY-MM-DD."),
      sort_by: z.enum(["date", "engagement", "impressions", "reach", "likes", "comments", "shares", "saves", "clicks", "views"]).optional(),
      order: z.enum(["asc", "desc"]).optional(),
      page: z.number().int().min(1).optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    async ({ post_id, profile_id, account_id, platform, source, from_date, to_date, sort_by, order, page, limit }) => {
      const result = await zernioGet("/analytics", {
        postId: post_id,
        profileId: profile_id,
        accountId: account_id,
        platform,
        source: source ?? "all",
        fromDate: from_date,
        toDate: to_date,
        sortBy: sort_by,
        order,
        page,
        limit: limit ?? 50,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_analytics_daily_metrics",
    "Get daily aggregated social metrics plus platform breakdown. Useful for growth curves, engagement velocity, and cross-platform trend analysis.",
    {
      profile_id: z.string().optional().describe("Filter by profile ID. Uses ZERNIO_DEFAULT_PROFILE_ID if omitted."),
      platform: zernioPlatform.optional().describe("Filter by platform."),
      from_date: z.string().optional().describe("Lower date bound YYYY-MM-DD."),
      to_date: z.string().optional().describe("Upper date bound YYYY-MM-DD."),
    },
    async ({ profile_id, platform, from_date, to_date }) => {
      const result = await zernioGet("/analytics/daily-metrics", {
        profileId: profile_id ?? await getDefaultZernioProfileId(),
        platform,
        fromDate: from_date,
        toDate: to_date,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_analytics_best_time",
    "Get best times to post based on historical engagement. Best used for content scheduling strategy per platform/account.",
    {
      profile_id: z.string().optional().describe("Filter by profile ID. Uses ZERNIO_DEFAULT_PROFILE_ID if omitted."),
      platform: zernioPlatform.optional().describe("Filter by platform."),
      account_id: z.string().optional().describe("Filter by connected account."),
      source: analyticsSource.optional().describe("Whether to use all posts, only Zernio-published, or only external/imported posts."),
    },
    async ({ profile_id, platform, account_id, source }) => {
      const result = await zernioGet("/analytics/best-time", {
        profileId: profile_id ?? await getDefaultZernioProfileId(),
        platform,
        accountId: account_id,
        source: source ?? "all",
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_analytics_posting_frequency",
    "Analyze the relationship between posting frequency and engagement rate. Helps find the right cadence by platform.",
    {
      profile_id: z.string().optional().describe("Filter by profile ID. Uses ZERNIO_DEFAULT_PROFILE_ID if omitted."),
      platform: zernioPlatform.optional().describe("Filter by platform."),
      account_id: z.string().optional().describe("Filter by connected account."),
      source: analyticsSource.optional().describe("Whether to use all posts, only Zernio-published, or only external/imported posts."),
    },
    async ({ profile_id, platform, account_id, source }) => {
      const result = await zernioGet("/analytics/posting-frequency", {
        profileId: profile_id ?? await getDefaultZernioProfileId(),
        platform,
        accountId: account_id,
        source: source ?? "all",
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_analytics_content_decay",
    "Measure how fast posts lose engagement after publishing. Useful for creative lifecycle analysis and repost decisions.",
    {
      profile_id: z.string().optional().describe("Filter by profile ID. Uses ZERNIO_DEFAULT_PROFILE_ID if omitted."),
      platform: zernioPlatform.optional().describe("Filter by platform."),
      account_id: z.string().optional().describe("Filter by connected account."),
      source: analyticsSource.optional().describe("Whether to use all posts, only Zernio-published, or only external/imported posts."),
      from_date: z.string().optional().describe("Lower date bound YYYY-MM-DD."),
      to_date: z.string().optional().describe("Upper date bound YYYY-MM-DD."),
    },
    async ({ profile_id, platform, account_id, source, from_date, to_date }) => {
      const result = await zernioGet("/analytics/content-decay", {
        profileId: profile_id ?? await getDefaultZernioProfileId(),
        platform,
        accountId: account_id,
        source: source ?? "all",
        fromDate: from_date,
        toDate: to_date,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_analytics_post_timeline",
    "Get the day-by-day timeline for one post's metrics since publishing. Best for deep creative autopsies.",
    {
      post_id: z.string().describe("Zernio post ID or external post ID."),
    },
    async ({ post_id }) => {
      const result = await zernioGet("/analytics/post-timeline", {
        postId: post_id,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_instagram_account_insights",
    "Get deep Instagram account-level insights such as reach, views, total interactions, comments, likes, saves, shares, and profile link taps.",
    {
      account_id: z.string().optional().describe("Instagram account ID. Auto-selects when only one IG account is connected in the target profile."),
      profile_id: z.string().optional().describe("Target profile ID. Uses ZERNIO_DEFAULT_PROFILE_ID if omitted."),
      since: z.string().optional().describe("Start date YYYY-MM-DD."),
      until: z.string().optional().describe("End date YYYY-MM-DD."),
      metric_type: analyticsMetricType.optional().describe("time_series for daily values, total_value for totals only."),
      metrics: z.array(z.enum(["reach", "views", "accounts_engaged", "total_interactions", "comments", "likes", "saves", "shares", "replies", "reposts", "follows_and_unfollows", "profile_links_taps"])).optional(),
    },
    async ({ account_id, profile_id, since, until, metric_type, metrics }) => {
      const target = await resolvePlatformTarget("instagram", account_id, profile_id);
      const result = await zernioGet("/analytics/instagram/account-insights", {
        accountId: target.accountId,
        since,
        until,
        metricType: metric_type ?? "total_value",
        metrics: metrics?.join(","),
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_instagram_demographics",
    "Get Instagram audience demographics by age, city, country, and gender. Requires at least 100 followers per Zernio docs.",
    {
      account_id: z.string().optional().describe("Instagram account ID. Auto-selects when only one IG account is connected in the target profile."),
      profile_id: z.string().optional().describe("Target profile ID. Uses ZERNIO_DEFAULT_PROFILE_ID if omitted."),
      breakdown: z.enum(["age", "city", "country", "gender"]).optional().describe("Dimension to prioritize if you only want one slice."),
    },
    async ({ account_id, profile_id, breakdown }) => {
      const target = await resolvePlatformTarget("instagram", account_id, profile_id);
      const result = await zernioGet("/analytics/instagram/demographics", {
        accountId: target.accountId,
        breakdown,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_tiktok_account_insights",
    "Get TikTok account-level insights and follower history. Zernio exposes the public TikTok metrics that are actually available via API.",
    {
      account_id: z.string().optional().describe("TikTok account ID. Auto-selects when only one TikTok account is connected in the target profile."),
      profile_id: z.string().optional().describe("Target profile ID. Uses ZERNIO_DEFAULT_PROFILE_ID if omitted."),
      since: z.string().optional().describe("Start date YYYY-MM-DD."),
      until: z.string().optional().describe("End date YYYY-MM-DD."),
      metric_type: analyticsMetricType.optional().describe("time_series for daily values, total_value for totals only."),
      metrics: z.array(z.enum(["follower_count", "following_count", "likes_count", "video_count", "followers_gained", "followers_lost"])).optional(),
    },
    async ({ account_id, profile_id, since, until, metric_type, metrics }) => {
      const target = await resolvePlatformTarget("tiktok", account_id, profile_id);
      const result = await zernioGet("/analytics/tiktok/account-insights", {
        accountId: target.accountId,
        since,
        until,
        metricType: metric_type ?? "total_value",
        metrics: metrics?.join(","),
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_instagram_accounts_list",
    "Summarize connected Instagram accounts with publishing readiness, account type, permissions, and token expiry.",
    {
      profile_id: z.string().optional().describe("Filter by Zernio profile ID. Uses ZERNIO_DEFAULT_PROFILE_ID if omitted."),
    },
    async ({ profile_id }) => {
      const result = await summarizePlatformAccounts("instagram", profile_id);
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_instagram_post_feed",
    "Create an Instagram feed post in Zernio. Best for one image or one video in the main feed.",
    {
      ...instagramSchedulingShape,
      caption: z.string().optional().describe("Main Instagram caption."),
      media_url: z.string().describe("Direct public URL to the image or video."),
      media_type: instagramMediaType.optional().describe("Defaults to image."),
      first_comment: z.string().optional().describe("Optional first comment."),
      collaborators: z.array(z.string()).optional().describe("Instagram collaborators usernames."),
      user_tags: z.array(instagramTagSchema).optional().describe("Tagged users with normalized x/y positions."),
    },
    async ({ account_id, profile_id, caption, media_url, media_type, first_comment, collaborators, user_tags, publish_now, is_draft, scheduled_for, timezone }) => {
      const target = await resolvePlatformTarget("instagram", account_id, profile_id);
      const result = await zernioPost("/posts", {
        content: caption,
        mediaItems: [{ type: media_type ?? "image", url: media_url }],
        platforms: [{
          platform: "instagram",
          accountId: target.accountId,
          profileId: target.profileId,
          platformSpecificData: compactObject({
            contentType: "feed",
            firstComment: first_comment,
            collaborators,
            userTags: user_tags?.map(({ media_index, ...rest }) => compactObject({ ...rest, mediaIndex: media_index })),
          }),
        }],
        publishNow: publish_now ?? false,
        isDraft: is_draft ?? false,
        scheduledFor: scheduled_for,
        timezone: timezone ?? "UTC",
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_instagram_post_reel",
    "Create an Instagram Reel in Zernio with publish options such as share_to_feed.",
    {
      ...instagramSchedulingShape,
      caption: z.string().optional().describe("Reel caption."),
      video_url: z.string().describe("Direct public URL to the reel video."),
      share_to_feed: z.boolean().optional().describe("Share the reel into the main feed. Defaults true."),
      first_comment: z.string().optional().describe("Optional first comment."),
      audio_name: z.string().optional().describe("Optional audio / track label for internal coordination."),
      thumb_offset_ms: z.number().int().min(0).optional().describe("Frame offset in milliseconds for the cover."),
      cover_image_url: z.string().optional().describe("Optional explicit cover image URL."),
      trial_graduation_strategy: z.enum(["MANUAL", "SS_PERFORMANCE"]).optional().describe("Optional strategy for trial / staged publishing flows."),
    },
    async ({ account_id, profile_id, caption, video_url, share_to_feed, first_comment, audio_name, thumb_offset_ms, cover_image_url, trial_graduation_strategy, publish_now, is_draft, scheduled_for, timezone }) => {
      const target = await resolvePlatformTarget("instagram", account_id, profile_id);
      const result = await zernioPost("/posts", {
        content: caption,
        mediaItems: [{ type: "video", url: video_url }],
        platforms: [{
          platform: "instagram",
          accountId: target.accountId,
          profileId: target.profileId,
          platformSpecificData: compactObject({
            contentType: "reels",
            shareToFeed: share_to_feed ?? true,
            firstComment: first_comment,
            audioName: audio_name,
            videoCoverTimestampMs: thumb_offset_ms,
            videoCoverImageUrl: cover_image_url,
            trialGraduationStrategy: trial_graduation_strategy,
          }),
        }],
        publishNow: publish_now ?? false,
        isDraft: is_draft ?? false,
        scheduledFor: scheduled_for,
        timezone: timezone ?? "UTC",
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_instagram_post_story",
    "Create an Instagram Story in Zernio with image or video media.",
    {
      ...instagramSchedulingShape,
      caption: z.string().optional().describe("Optional story caption / overlay text reference."),
      media_url: z.string().describe("Direct public URL to the story media."),
      media_type: instagramMediaType.optional().describe("Defaults to image."),
    },
    async ({ account_id, profile_id, caption, media_url, media_type, publish_now, is_draft, scheduled_for, timezone }) => {
      const target = await resolvePlatformTarget("instagram", account_id, profile_id);
      const result = await zernioPost("/posts", {
        content: caption,
        mediaItems: [{ type: media_type ?? "image", url: media_url }],
        platforms: [{
          platform: "instagram",
          accountId: target.accountId,
          profileId: target.profileId,
          platformSpecificData: { contentType: "story" },
        }],
        publishNow: publish_now ?? false,
        isDraft: is_draft ?? false,
        scheduledFor: scheduled_for,
        timezone: timezone ?? "UTC",
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_instagram_post_carousel",
    "Create an Instagram carousel with two or more media items.",
    {
      ...instagramSchedulingShape,
      caption: z.string().optional().describe("Carousel caption."),
      media_items: z.array(z.object({
        url: z.string().describe("Direct public URL to an image or video."),
        media_type: instagramMediaType.optional().describe("Defaults to image."),
      })).min(2).describe("Two or more carousel items."),
      first_comment: z.string().optional().describe("Optional first comment."),
      collaborators: z.array(z.string()).optional().describe("Instagram collaborators usernames."),
      user_tags: z.array(instagramTagSchema).optional().describe("Tagged users with normalized x/y positions."),
    },
    async ({ account_id, profile_id, caption, media_items, first_comment, collaborators, user_tags, publish_now, is_draft, scheduled_for, timezone }) => {
      const target = await resolvePlatformTarget("instagram", account_id, profile_id);
      const result = await zernioPost("/posts", {
        content: caption,
        mediaItems: media_items.map((item) => ({ type: item.media_type ?? "image", url: item.url })),
        platforms: [{
          platform: "instagram",
          accountId: target.accountId,
          profileId: target.profileId,
          platformSpecificData: compactObject({
            contentType: "carousel",
            firstComment: first_comment,
            collaborators,
            userTags: user_tags?.map(({ media_index, ...rest }) => compactObject({ ...rest, mediaIndex: media_index })),
          }),
        }],
        publishNow: publish_now ?? false,
        isDraft: is_draft ?? false,
        scheduledFor: scheduled_for,
        timezone: timezone ?? "UTC",
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_tiktok_accounts_list",
    "Summarize connected TikTok accounts with publishing readiness, permissions, privacy options, and token expiry.",
    {
      profile_id: z.string().optional().describe("Filter by Zernio profile ID. Uses ZERNIO_DEFAULT_PROFILE_ID if omitted."),
    },
    async ({ profile_id }) => {
      const result = await summarizePlatformAccounts("tiktok", profile_id);
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_tiktok_privacy_options",
    "List TikTok privacy levels advertised by the connected account metadata. Falls back to the known Zernio-safe values when the API does not expose them.",
    {
      account_id: z.string().optional().describe("Specific TikTok account ID."),
      profile_id: z.string().optional().describe("Zernio profile ID. Uses ZERNIO_DEFAULT_PROFILE_ID if omitted."),
    },
    async ({ account_id, profile_id }) => {
      const target = await resolvePlatformTarget("tiktok", account_id, profile_id);
      const account = target.account;
      const metadata = asRecord(account.metadata);
      const levels = stringArray(
        metadata.availablePrivacyLevels
        ?? metadata.privacyLevels
        ?? metadata.creatorPrivacyLevels
        ?? metadata.postPrivacyOptions
      );
      const result = {
        account_id: target.accountId,
        profile_id: target.profileId,
        handle: stringValue(account.username ?? account.handle ?? account.displayName),
        privacy_levels: levels.length ? levels : tiktokPrivacyLevel.options,
        note: levels.length
          ? "Valores tomados de la metadata actual de la cuenta."
          : "La API no expuso privacy_levels en la metadata; se devuelve el set conocido de Zernio/TikTok.",
      };
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_tiktok_post_video",
    "Create a TikTok video post with privacy, consent flags, cover options, and publish timing.",
    {
      ...tiktokSchedulingShape,
      caption: z.string().optional().describe("TikTok caption / description."),
      video_url: z.string().describe("Direct public URL to the video file."),
      privacy_level: tiktokPrivacyLevel.optional().describe("Defaults to PUBLIC_TO_EVERYONE."),
      allow_comments: z.boolean().optional().describe("Allow comments. Defaults true."),
      allow_duet: z.boolean().optional().describe("Allow duets. Defaults true."),
      allow_stitch: z.boolean().optional().describe("Allow stitch. Defaults true."),
      content_preview_confirmed: z.boolean().optional().describe("Required confirmation for TikTok publishing. Defaults true."),
      express_consent_given: z.boolean().optional().describe("Required consent flag for TikTok publishing. Defaults true."),
      video_cover_timestamp_ms: z.number().int().min(0).optional().describe("Select the cover frame by timestamp."),
      video_cover_image_url: z.string().optional().describe("Optional explicit cover image URL."),
    },
    async ({ account_id, profile_id, caption, video_url, privacy_level, allow_comments, allow_duet, allow_stitch, content_preview_confirmed, express_consent_given, video_cover_timestamp_ms, video_cover_image_url, publish_now, is_draft, scheduled_for, timezone }) => {
      const target = await resolvePlatformTarget("tiktok", account_id, profile_id);
      const result = await zernioPost("/posts", {
        content: caption,
        mediaItems: [{ type: "video", url: video_url }],
        platforms: [{
          platform: "tiktok",
          accountId: target.accountId,
          profileId: target.profileId,
        }],
        tiktokSettings: compactObject({
          media_type: "video",
          privacy_level: privacy_level ?? "PUBLIC_TO_EVERYONE",
          allow_comments: allow_comments ?? true,
          allow_duet: allow_duet ?? true,
          allow_stitch: allow_stitch ?? true,
          content_preview_confirmed: content_preview_confirmed ?? true,
          express_consent_given: express_consent_given ?? true,
          video_cover_timestamp_ms,
          video_cover_image_url,
        }),
        publishNow: publish_now ?? false,
        isDraft: is_draft ?? false,
        scheduledFor: scheduled_for,
        timezone: timezone ?? "UTC",
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_tiktok_post_photo_carousel",
    "Create a TikTok photo carousel with privacy, music, consent flags, and cover selection.",
    {
      ...tiktokSchedulingShape,
      caption: z.string().optional().describe("Optional TikTok caption."),
      description: z.string().optional().describe("Optional long-form description for the post payload."),
      media_urls: z.array(z.string()).min(2).describe("Two or more direct public image URLs."),
      photo_cover_index: z.number().int().min(0).optional().describe("Which photo should be used as cover."),
      auto_add_music: z.boolean().optional().describe("Let TikTok auto-attach music. Defaults true."),
      privacy_level: tiktokPrivacyLevel.optional().describe("Defaults to PUBLIC_TO_EVERYONE."),
      allow_comments: z.boolean().optional().describe("Allow comments. Defaults true."),
      allow_duet: z.boolean().optional().describe("Allow duets. Defaults true."),
      allow_stitch: z.boolean().optional().describe("Allow stitch. Defaults true."),
      content_preview_confirmed: z.boolean().optional().describe("Required confirmation for TikTok publishing. Defaults true."),
      express_consent_given: z.boolean().optional().describe("Required consent flag for TikTok publishing. Defaults true."),
    },
    async ({ account_id, profile_id, caption, description, media_urls, photo_cover_index, auto_add_music, privacy_level, allow_comments, allow_duet, allow_stitch, content_preview_confirmed, express_consent_given, publish_now, is_draft, scheduled_for, timezone }) => {
      const target = await resolvePlatformTarget("tiktok", account_id, profile_id);
      const result = await zernioPost("/posts", {
        content: caption,
        mediaItems: media_urls.map((url) => ({ type: "image", url })),
        platforms: [{
          platform: "tiktok",
          accountId: target.accountId,
          profileId: target.profileId,
        }],
        tiktokSettings: compactObject({
          media_type: "photo",
          description,
          photo_cover_index,
          auto_add_music: auto_add_music ?? true,
          privacy_level: privacy_level ?? "PUBLIC_TO_EVERYONE",
          allow_comments: allow_comments ?? true,
          allow_duet: allow_duet ?? true,
          allow_stitch: allow_stitch ?? true,
          content_preview_confirmed: content_preview_confirmed ?? true,
          express_consent_given: express_consent_given ?? true,
        }),
        publishNow: publish_now ?? false,
        isDraft: is_draft ?? false,
        scheduledFor: scheduled_for,
        timezone: timezone ?? "UTC",
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_googlebusiness_accounts_list",
    "Summarize connected Google Business Profile accounts with selected location metadata, publish readiness, and local profile context.",
    {
      profile_id: z.string().optional().describe("Filter by Zernio profile ID. Uses ZERNIO_DEFAULT_PROFILE_ID if omitted."),
    },
    async ({ profile_id }) => {
      const result = await summarizePlatformAccounts("googlebusiness", profile_id);
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_googlebusiness_locations_list",
    "List all Google Business locations available to one connected GBP account and show which one is currently selected.",
    {
      account_id: z.string().optional().describe("Google Business account ID. Auto-selects when only one account exists in the target profile."),
      profile_id: z.string().optional().describe("Zernio profile ID. Uses ZERNIO_DEFAULT_PROFILE_ID if omitted."),
    },
    async ({ account_id, profile_id }) => {
      const target = await resolvePlatformTarget("googlebusiness", account_id, profile_id);
      const result = await zernioGet(`/accounts/${encodeURIComponent(target.accountId)}/gmb-locations`);
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_googlebusiness_location_select",
    "Switch the selected GBP location on a connected account. Useful when one OAuth connection manages multiple locations.",
    {
      account_id: z.string().optional().describe("Google Business account ID. Auto-selects when only one account exists in the target profile."),
      profile_id: z.string().optional().describe("Zernio profile ID. Uses ZERNIO_DEFAULT_PROFILE_ID if omitted."),
      selected_location_id: z.string().describe("The location ID that should become the selected/default location for this account."),
    },
    async ({ account_id, profile_id, selected_location_id }) => {
      const target = await resolvePlatformTarget("googlebusiness", account_id, profile_id);
      const result = await zernioPut(`/accounts/${encodeURIComponent(target.accountId)}/gmb-locations`, {
        selectedLocationId: selected_location_id,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_googlebusiness_location_details",
    "Fetch detailed Google Business Profile location data including hours, phone, website, categories, services, and profile description.",
    {
      account_id: z.string().optional().describe("Google Business account ID. Auto-selects when only one account exists in the target profile."),
      profile_id: z.string().optional().describe("Zernio profile ID. Uses ZERNIO_DEFAULT_PROFILE_ID if omitted."),
      location_id: z.string().optional().describe("Override the selected GBP location ID."),
      read_mask: z.array(z.enum(["name", "title", "phoneNumbers", "categories", "storefrontAddress", "websiteUri", "regularHours", "specialHours", "serviceArea", "serviceItems", "profile", "openInfo", "metadata", "moreHours"])).optional().describe("Specific location fields to request from Zernio/Google."),
    },
    async ({ account_id, profile_id, location_id, read_mask }) => {
      const target = await resolvePlatformTarget("googlebusiness", account_id, profile_id);
      const result = await zernioGet(`/accounts/${encodeURIComponent(target.accountId)}/gmb-location-details`, {
        locationId: location_id,
        readMask: read_mask?.join(","),
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_googlebusiness_location_update",
    "Update Google Business location details such as hours, special hours, description, website, phone numbers, categories, or service items.",
    {
      account_id: z.string().optional().describe("Google Business account ID. Auto-selects when only one account exists in the target profile."),
      profile_id: z.string().optional().describe("Zernio profile ID. Uses ZERNIO_DEFAULT_PROFILE_ID if omitted."),
      location_id: z.string().optional().describe("Override the selected GBP location ID."),
      update_mask: z.array(z.string()).min(1).describe("Google Business fields to patch, e.g. ['regularHours','websiteUri','profile.description']."),
      payload: z.record(z.string(), z.unknown()).describe("Raw GBP location patch payload. Include only the fields you want to set."),
    },
    async ({ account_id, profile_id, location_id, update_mask, payload }) => {
      const target = await resolvePlatformTarget("googlebusiness", account_id, profile_id);
      const result = await zernioPut(
        `/accounts/${encodeURIComponent(target.accountId)}/gmb-location-details`,
        { ...payload, updateMask: update_mask.join(",") },
        { locationId: location_id }
      );
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_googlebusiness_reviews_list",
    "List Google Business reviews for one connected location, including ratings, comments, owner replies, and pagination token.",
    {
      account_id: z.string().optional().describe("Google Business account ID. Auto-selects when only one account exists in the target profile."),
      profile_id: z.string().optional().describe("Zernio profile ID. Uses ZERNIO_DEFAULT_PROFILE_ID if omitted."),
      location_id: z.string().optional().describe("Override the selected GBP location ID."),
      page_size: z.number().int().min(1).max(50).optional().describe("Reviews per page. Default 50."),
      page_token: z.string().optional().describe("Pagination token from a previous response."),
    },
    async ({ account_id, profile_id, location_id, page_size, page_token }) => {
      const target = await resolvePlatformTarget("googlebusiness", account_id, profile_id);
      const result = await zernioGet(`/accounts/${encodeURIComponent(target.accountId)}/gmb-reviews`, {
        locationId: location_id,
        pageSize: page_size ?? 50,
        pageToken: page_token,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_googlebusiness_reviews_batch",
    "Fetch reviews across multiple Google Business locations in one request. Best for multi-location monitoring.",
    {
      account_id: z.string().optional().describe("Google Business account ID. Auto-selects when only one account exists in the target profile."),
      profile_id: z.string().optional().describe("Zernio profile ID. Uses ZERNIO_DEFAULT_PROFILE_ID if omitted."),
      location_names: z.array(z.string()).describe("Full Google resource names, e.g. accounts/123/locations/456."),
      page_size: z.number().int().min(1).max(50).optional().describe("Reviews per location. Default 50."),
      page_token: z.string().optional().describe("Pagination token from a previous response."),
    },
    async ({ account_id, profile_id, location_names, page_size, page_token }) => {
      const target = await resolvePlatformTarget("googlebusiness", account_id, profile_id);
      const result = await zernioPost(`/accounts/${encodeURIComponent(target.accountId)}/gmb-reviews/batch`, {
        locationNames: location_names,
        pageSize: page_size ?? 50,
        pageToken: page_token,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_googlebusiness_reviews_inbox",
    "List Google Business reviews across all connected GBP accounts using Zernio's aggregated inbox endpoint.",
    {
      profile_id: z.string().optional().describe("Zernio profile ID filter."),
      account_id: z.string().optional().describe("Specific GBP account ID filter."),
      min_rating: z.number().int().min(1).max(5).optional().describe("Minimum rating filter."),
      max_rating: z.number().int().min(1).max(5).optional().describe("Maximum rating filter."),
      has_reply: z.boolean().optional().describe("Filter by whether the review already has an owner reply."),
      sort_by: z.enum(["date", "rating"]).optional(),
      sort_order: z.enum(["asc", "desc"]).optional(),
      limit: z.number().int().min(1).max(50).optional(),
      cursor: z.string().optional().describe("Pagination cursor from a previous response."),
    },
    async ({ profile_id, account_id, min_rating, max_rating, has_reply, sort_by, sort_order, limit, cursor }) => {
      const result = await zernioGet("/inbox/reviews", {
        profileId: profile_id,
        platform: "googlebusiness",
        accountId: account_id,
        minRating: min_rating,
        maxRating: max_rating,
        hasReply: has_reply,
        sortBy: sort_by ?? "date",
        sortOrder: sort_order ?? "desc",
        limit: limit ?? 25,
        cursor,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_googlebusiness_services_get",
    "Get structured/free-form services configured on a Google Business Profile location.",
    {
      account_id: z.string().optional().describe("Google Business account ID. Auto-selects when only one account exists in the target profile."),
      profile_id: z.string().optional().describe("Zernio profile ID. Uses ZERNIO_DEFAULT_PROFILE_ID if omitted."),
      location_id: z.string().optional().describe("Override the selected GBP location ID."),
    },
    async ({ account_id, profile_id, location_id }) => {
      const target = await resolvePlatformTarget("googlebusiness", account_id, profile_id);
      const result = await zernioGet(`/accounts/${encodeURIComponent(target.accountId)}/gmb-services`, {
        locationId: location_id,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_googlebusiness_services_replace",
    "Replace the full service list for a Google Business location. Google requires full replacement rather than item-by-item mutation.",
    {
      account_id: z.string().optional().describe("Google Business account ID. Auto-selects when only one account exists in the target profile."),
      profile_id: z.string().optional().describe("Zernio profile ID. Uses ZERNIO_DEFAULT_PROFILE_ID if omitted."),
      location_id: z.string().optional().describe("Override the selected GBP location ID."),
      service_items: z.array(z.record(z.string(), z.unknown())).describe("Full array of service items, structured or free-form."),
    },
    async ({ account_id, profile_id, location_id, service_items }) => {
      const target = await resolvePlatformTarget("googlebusiness", account_id, profile_id);
      const result = await zernioPut(
        `/accounts/${encodeURIComponent(target.accountId)}/gmb-services`,
        { serviceItems: service_items },
        { locationId: location_id }
      );
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_googlebusiness_attributes_get",
    "Get GBP location attributes such as amenities, services, and payment-related flags.",
    {
      account_id: z.string().optional().describe("Google Business account ID. Auto-selects when only one account exists in the target profile."),
      profile_id: z.string().optional().describe("Zernio profile ID. Uses ZERNIO_DEFAULT_PROFILE_ID if omitted."),
      location_id: z.string().optional().describe("Override the selected GBP location ID."),
    },
    async ({ account_id, profile_id, location_id }) => {
      const target = await resolvePlatformTarget("googlebusiness", account_id, profile_id);
      const result = await zernioGet(`/accounts/${encodeURIComponent(target.accountId)}/gmb-attributes`, {
        locationId: location_id,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_googlebusiness_attributes_update",
    "Update GBP location attributes. Use attribute_mask to specify which attributes you want to write.",
    {
      account_id: z.string().optional().describe("Google Business account ID. Auto-selects when only one account exists in the target profile."),
      profile_id: z.string().optional().describe("Zernio profile ID. Uses ZERNIO_DEFAULT_PROFILE_ID if omitted."),
      location_id: z.string().optional().describe("Override the selected GBP location ID."),
      attribute_mask: z.array(z.string()).min(1).describe("Comma-joined attribute keys to update, e.g. ['has_wifi','takeout']."),
      attributes: z.record(z.string(), z.unknown()).describe("Attribute payload keyed by attribute name."),
    },
    async ({ account_id, profile_id, location_id, attribute_mask, attributes }) => {
      const target = await resolvePlatformTarget("googlebusiness", account_id, profile_id);
      const result = await zernioPut(
        `/accounts/${encodeURIComponent(target.accountId)}/gmb-attributes`,
        { attributes, attributeMask: attribute_mask.join(",") },
        { locationId: location_id }
      );
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_googlebusiness_media_list",
    "List Google Business media items (photos) for a location, including source URLs, Google URLs, categories, and pagination.",
    {
      account_id: z.string().optional().describe("Google Business account ID. Auto-selects when only one account exists in the target profile."),
      profile_id: z.string().optional().describe("Zernio profile ID. Uses ZERNIO_DEFAULT_PROFILE_ID if omitted."),
      location_id: z.string().optional().describe("Override the selected GBP location ID."),
      page_size: z.number().int().min(1).max(100).optional().describe("Media items per page. Default 100."),
      page_token: z.string().optional().describe("Pagination token from a previous response."),
    },
    async ({ account_id, profile_id, location_id, page_size, page_token }) => {
      const target = await resolvePlatformTarget("googlebusiness", account_id, profile_id);
      const result = await zernioGet(`/accounts/${encodeURIComponent(target.accountId)}/gmb-media`, {
        locationId: location_id,
        pageSize: page_size ?? 100,
        pageToken: page_token,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_googlebusiness_media_upload",
    "Upload a photo to a Google Business location from a public URL.",
    {
      account_id: z.string().optional().describe("Google Business account ID. Auto-selects when only one account exists in the target profile."),
      profile_id: z.string().optional().describe("Zernio profile ID. Uses ZERNIO_DEFAULT_PROFILE_ID if omitted."),
      location_id: z.string().optional().describe("Override the selected GBP location ID."),
      source_url: z.string().describe("Publicly accessible image URL."),
      description: z.string().optional().describe("Optional media description."),
      category: gmbMediaCategory.optional().describe("Where the photo should appear on the listing."),
      media_format: z.enum(["PHOTO", "VIDEO"]).optional().describe("Default PHOTO."),
    },
    async ({ account_id, profile_id, location_id, source_url, description, category, media_format }) => {
      const target = await resolvePlatformTarget("googlebusiness", account_id, profile_id);
      const result = await zernioPost(
        `/accounts/${encodeURIComponent(target.accountId)}/gmb-media`,
        {
          sourceUrl: source_url,
          description,
          category,
          mediaFormat: media_format ?? "PHOTO",
        },
        { locationId: location_id }
      );
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_googlebusiness_media_delete",
    "Delete a Google Business media item (photo/video) from a location.",
    {
      account_id: z.string().optional().describe("Google Business account ID. Auto-selects when only one account exists in the target profile."),
      profile_id: z.string().optional().describe("Zernio profile ID. Uses ZERNIO_DEFAULT_PROFILE_ID if omitted."),
      location_id: z.string().optional().describe("Override the selected GBP location ID."),
      media_name: z.string().describe("Full GBP media resource name to delete."),
    },
    async ({ account_id, profile_id, location_id, media_name }) => {
      const target = await resolvePlatformTarget("googlebusiness", account_id, profile_id);
      const result = await zernioDelete(`/accounts/${encodeURIComponent(target.accountId)}/gmb-media`, {
        locationId: location_id,
        name: media_name,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_googlebusiness_place_actions_list",
    "List GBP place action links such as appointment, ordering, delivery, reservation, or shop buttons.",
    {
      account_id: z.string().optional().describe("Google Business account ID. Auto-selects when only one account exists in the target profile."),
      profile_id: z.string().optional().describe("Zernio profile ID. Uses ZERNIO_DEFAULT_PROFILE_ID if omitted."),
      location_id: z.string().optional().describe("Override the selected GBP location ID."),
      page_size: z.number().int().min(1).max(100).optional().describe("Items per page. Default 100."),
      page_token: z.string().optional().describe("Pagination token from a previous response."),
    },
    async ({ account_id, profile_id, location_id, page_size, page_token }) => {
      const target = await resolvePlatformTarget("googlebusiness", account_id, profile_id);
      const result = await zernioGet(`/accounts/${encodeURIComponent(target.accountId)}/gmb-place-actions`, {
        locationId: location_id,
        pageSize: page_size ?? 100,
        pageToken: page_token,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_googlebusiness_place_action_create",
    "Create a GBP place action link like appointment, booking, ordering, delivery, takeout, or shop.",
    {
      account_id: z.string().optional().describe("Google Business account ID. Auto-selects when only one account exists in the target profile."),
      profile_id: z.string().optional().describe("Zernio profile ID. Uses ZERNIO_DEFAULT_PROFILE_ID if omitted."),
      location_id: z.string().optional().describe("Override the selected GBP location ID."),
      uri: z.string().describe("Action URL."),
      place_action_type: gmbPlaceActionType.describe("Type of place action."),
    },
    async ({ account_id, profile_id, location_id, uri, place_action_type }) => {
      const target = await resolvePlatformTarget("googlebusiness", account_id, profile_id);
      const result = await zernioPost(
        `/accounts/${encodeURIComponent(target.accountId)}/gmb-place-actions`,
        {
          uri,
          placeActionType: place_action_type,
        },
        { locationId: location_id }
      );
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_googlebusiness_place_action_update",
    "Update an existing GBP place action link's URL or type.",
    {
      account_id: z.string().optional().describe("Google Business account ID. Auto-selects when only one account exists in the target profile."),
      profile_id: z.string().optional().describe("Zernio profile ID. Uses ZERNIO_DEFAULT_PROFILE_ID if omitted."),
      location_id: z.string().optional().describe("Override the selected GBP location ID."),
      name: z.string().describe("Full resource name of the place action link."),
      uri: z.string().optional().describe("New action URL."),
      place_action_type: gmbPlaceActionType.optional().describe("New action type."),
    },
    async ({ account_id, profile_id, location_id, name, uri, place_action_type }) => {
      const target = await resolvePlatformTarget("googlebusiness", account_id, profile_id);
      const result = await zernioPatch(
        `/accounts/${encodeURIComponent(target.accountId)}/gmb-place-actions`,
        compactObject({
          name,
          uri,
          placeActionType: place_action_type,
        }),
        { locationId: location_id }
      );
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_googlebusiness_place_action_delete",
    "Delete a GBP place action link from a location.",
    {
      account_id: z.string().optional().describe("Google Business account ID. Auto-selects when only one account exists in the target profile."),
      profile_id: z.string().optional().describe("Zernio profile ID. Uses ZERNIO_DEFAULT_PROFILE_ID if omitted."),
      location_id: z.string().optional().describe("Override the selected GBP location ID."),
      name: z.string().describe("Full resource name of the place action link to delete."),
    },
    async ({ account_id, profile_id, location_id, name }) => {
      const target = await resolvePlatformTarget("googlebusiness", account_id, profile_id);
      const result = await zernioDelete(`/accounts/${encodeURIComponent(target.accountId)}/gmb-place-actions`, {
        locationId: location_id,
        name,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_googlebusiness_food_menus_get",
    "Get GBP food menus for locations that support menu management.",
    {
      account_id: z.string().optional().describe("Google Business account ID. Auto-selects when only one account exists in the target profile."),
      profile_id: z.string().optional().describe("Zernio profile ID. Uses ZERNIO_DEFAULT_PROFILE_ID if omitted."),
      location_id: z.string().optional().describe("Override the selected GBP location ID."),
    },
    async ({ account_id, profile_id, location_id }) => {
      const target = await resolvePlatformTarget("googlebusiness", account_id, profile_id);
      const result = await zernioGet(`/accounts/${encodeURIComponent(target.accountId)}/gmb-food-menus`, {
        locationId: location_id,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_googlebusiness_food_menus_update",
    "Replace the full GBP food menu payload for restaurant/cafe locations that support menus.",
    {
      account_id: z.string().optional().describe("Google Business account ID. Auto-selects when only one account exists in the target profile."),
      profile_id: z.string().optional().describe("Zernio profile ID. Uses ZERNIO_DEFAULT_PROFILE_ID if omitted."),
      location_id: z.string().optional().describe("Override the selected GBP location ID."),
      menus: z.array(z.record(z.string(), z.unknown())).describe("Full menus array to write."),
      update_mask: z.array(z.string()).optional().describe("Optional partial update mask if supported by the location/menu type."),
    },
    async ({ account_id, profile_id, location_id, menus, update_mask }) => {
      const target = await resolvePlatformTarget("googlebusiness", account_id, profile_id);
      const result = await zernioPut(
        `/accounts/${encodeURIComponent(target.accountId)}/gmb-food-menus`,
        compactObject({
          menus,
          updateMask: update_mask?.join(","),
        }),
        { locationId: location_id }
      );
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_googlebusiness_post_create",
    "Create a Google Business post/update, including standard updates plus EVENT and OFFER topic types.",
    {
      account_id: z.string().optional().describe("Google Business account ID. Auto-selects when only one account exists in the target profile."),
      profile_id: z.string().optional().describe("Zernio profile ID. Uses ZERNIO_DEFAULT_PROFILE_ID if omitted."),
      location_id: z.string().optional().describe("Optional target location ID for multi-location posting."),
      content: z.string().optional().describe("Post text. Optional if media or custom content is sufficient."),
      media_url: z.string().optional().describe("Optional public image URL for the GBP post."),
      topic_type: gmbPostTopicType.optional().describe("STANDARD, EVENT, or OFFER. Defaults to STANDARD."),
      event: z.record(z.string(), z.unknown()).optional().describe("Event payload when topic_type=EVENT. Include title and schedule.startDate at minimum."),
      offer: z.record(z.string(), z.unknown()).optional().describe("Offer payload when topic_type=OFFER."),
      publish_now: z.boolean().optional().describe("Publish immediately."),
      is_draft: z.boolean().optional().describe("Save as draft."),
      scheduled_for: z.string().optional().describe("ISO datetime for scheduled publishing."),
      timezone: z.string().optional().describe("Timezone for scheduled publishing. Default UTC."),
    },
    async ({ account_id, profile_id, location_id, content, media_url, topic_type, event, offer, publish_now, is_draft, scheduled_for, timezone }) => {
      const target = await resolvePlatformTarget("googlebusiness", account_id, profile_id);
      const result = await zernioPost("/posts", {
        content,
        mediaItems: media_url ? [{ type: "image", url: media_url }] : undefined,
        platforms: [{
          platform: "googlebusiness",
          accountId: target.accountId,
          profileId: target.profileId,
          platformSpecificData: compactObject({
            locationId: location_id,
            topicType: topic_type ?? "STANDARD",
            event,
            offer,
          }),
        }],
        publishNow: publish_now ?? false,
        isDraft: is_draft ?? false,
        scheduledFor: scheduled_for,
        timezone: timezone ?? "UTC",
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_googlebusiness_performance",
    "Get Google Business Profile performance metrics such as calls, website clicks, directions, views, and interactions.",
    {
      account_id: z.string().optional().describe("Google Business account ID. Auto-selects when only one account exists in the target profile."),
      profile_id: z.string().optional().describe("Zernio profile ID. Uses ZERNIO_DEFAULT_PROFILE_ID if omitted."),
      start_date: z.string().optional().describe("YYYY-MM-DD start date."),
      end_date: z.string().optional().describe("YYYY-MM-DD end date."),
      metrics: z.array(z.string()).optional().describe("Optional metric keys if you want a narrower payload."),
    },
    async ({ account_id, profile_id, start_date, end_date, metrics }) => {
      const target = await resolvePlatformTarget("googlebusiness", account_id, profile_id);
      const result = await zernioGet("/analytics/googlebusiness/performance", {
        accountId: target.accountId,
        startDate: start_date,
        endDate: end_date,
        metrics: metrics?.join(","),
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_googlebusiness_search_keywords",
    "Get the Google search queries/keywords that are driving discovery for a Google Business Profile.",
    {
      account_id: z.string().optional().describe("Google Business account ID. Auto-selects when only one account exists in the target profile."),
      profile_id: z.string().optional().describe("Zernio profile ID. Uses ZERNIO_DEFAULT_PROFILE_ID if omitted."),
      start_date: z.string().optional().describe("YYYY-MM-DD start date."),
      end_date: z.string().optional().describe("YYYY-MM-DD end date."),
      start_month: z.string().optional().describe("YYYY-MM month lower bound for the monthly keyword report."),
      end_month: z.string().optional().describe("YYYY-MM month upper bound for the monthly keyword report."),
      limit: z.number().int().min(1).max(100).optional().describe("Keyword rows to return. Default 25."),
    },
    async ({ account_id, profile_id, start_date, end_date, start_month, end_month, limit }) => {
      const target = await resolvePlatformTarget("googlebusiness", account_id, profile_id);
      const result = await zernioGet("/analytics/googlebusiness/search-keywords", {
        accountId: target.accountId,
        startMonth: start_month ?? toYearMonth(start_date),
        endMonth: end_month ?? toYearMonth(end_date),
        limit: limit ?? 25,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_linkedin_accounts_list",
    "Summarize connected LinkedIn accounts with account type, publishing readiness, permissions, and token status.",
    {
      profile_id: z.string().optional().describe("Filter by Zernio profile ID. Uses ZERNIO_DEFAULT_PROFILE_ID if omitted."),
    },
    async ({ profile_id }) => {
      const result = await summarizePlatformAccounts("linkedin", profile_id);
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_linkedin_aggregate_analytics",
    "Get LinkedIn aggregate analytics and automatically choose the correct endpoint for a personal profile vs. organization page.",
    {
      account_id: z.string().optional().describe("LinkedIn account ID. Auto-selects when only one account exists in the target profile."),
      profile_id: z.string().optional().describe("Zernio profile ID. Uses ZERNIO_DEFAULT_PROFILE_ID if omitted."),
      aggregation: z.enum(["TOTAL", "DAILY"]).optional().describe("TOTAL for lifetime totals, DAILY for time series."),
    },
    async ({ account_id, profile_id, aggregation }) => {
      const target = await resolvePlatformTarget("linkedin", account_id, profile_id);
      const accountSummary = summarizeAccount(target.account);
      const accountType = stringValue(accountSummary.account_type ?? target.account.accountType ?? target.account.displayName).toLowerCase();
      const isOrg = accountType.includes("org") || accountType.includes("company") || accountType.includes("organization");
      const result = isOrg
        ? await zernioGet("/analytics/linkedin/org-aggregate-analytics", {
            accountId: target.accountId,
            metricType: aggregation === "DAILY" ? "time_series" : "total_value",
          })
        : await zernioGet(`/accounts/${encodeURIComponent(target.accountId)}/linkedin-aggregate-analytics`, {
            aggregation: aggregation ?? "TOTAL",
          });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_linkedin_post_analytics",
    "Get analytics for a specific LinkedIn post by URN. Useful when you already know the native LinkedIn post identifier.",
    {
      account_id: z.string().optional().describe("LinkedIn account ID. Auto-selects when only one account exists in the target profile."),
      profile_id: z.string().optional().describe("Zernio profile ID. Uses ZERNIO_DEFAULT_PROFILE_ID if omitted."),
      urn: z.string().describe("LinkedIn post URN."),
    },
    async ({ account_id, profile_id, urn }) => {
      const target = await resolvePlatformTarget("linkedin", account_id, profile_id);
      const result = await zernioGet(`/accounts/${encodeURIComponent(target.accountId)}/linkedin-post-analytics`, {
        urn,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_linkedin_post_text",
    "Create a LinkedIn text post. Best practice from Zernio docs: keep external URLs in first_comment rather than in the main caption.",
    {
      account_id: z.string().optional().describe("LinkedIn account ID. Auto-selects when only one account exists in the target profile."),
      profile_id: z.string().optional().describe("Zernio profile ID. Uses ZERNIO_DEFAULT_PROFILE_ID if omitted."),
      content: z.string().describe("Main LinkedIn post text."),
      first_comment: z.string().optional().describe("Optional first comment. Good place for external links."),
      publish_now: z.boolean().optional().describe("Publish immediately."),
      is_draft: z.boolean().optional().describe("Save as draft."),
      scheduled_for: z.string().optional().describe("ISO datetime for scheduled publishing."),
      timezone: z.string().optional().describe("Timezone for scheduled publishing. Default UTC."),
    },
    async ({ account_id, profile_id, content, first_comment, publish_now, is_draft, scheduled_for, timezone }) => {
      const target = await resolvePlatformTarget("linkedin", account_id, profile_id);
      const result = await zernioPost("/posts", {
        content,
        platforms: [{
          platform: "linkedin",
          accountId: target.accountId,
          profileId: target.profileId,
          platformSpecificData: compactObject({ firstComment: first_comment }),
        }],
        publishNow: publish_now ?? false,
        isDraft: is_draft ?? false,
        scheduledFor: scheduled_for,
        timezone: timezone ?? "UTC",
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_linkedin_post_document",
    "Create a LinkedIn document post. LinkedIn requires a document title.",
    {
      account_id: z.string().optional().describe("LinkedIn account ID. Auto-selects when only one account exists in the target profile."),
      profile_id: z.string().optional().describe("Zernio profile ID. Uses ZERNIO_DEFAULT_PROFILE_ID if omitted."),
      content: z.string().optional().describe("Optional post text shown above the document."),
      document_url: z.string().describe("Public URL to the PDF/PPT/PPTX/DOC/DOCX file."),
      document_title: z.string().describe("Title shown on LinkedIn for the document."),
      first_comment: z.string().optional().describe("Optional first comment."),
      publish_now: z.boolean().optional(),
      is_draft: z.boolean().optional(),
      scheduled_for: z.string().optional(),
      timezone: z.string().optional(),
    },
    async ({ account_id, profile_id, content, document_url, document_title, first_comment, publish_now, is_draft, scheduled_for, timezone }) => {
      const target = await resolvePlatformTarget("linkedin", account_id, profile_id);
      const result = await zernioPost("/posts", {
        content,
        mediaItems: [{ type: "document", url: document_url }],
        platforms: [{
          platform: "linkedin",
          accountId: target.accountId,
          profileId: target.profileId,
          platformSpecificData: compactObject({
            firstComment: first_comment,
            documentTitle: document_title,
          }),
        }],
        publishNow: publish_now ?? false,
        isDraft: is_draft ?? false,
        scheduledFor: scheduled_for,
        timezone: timezone ?? "UTC",
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_youtube_accounts_list",
    "Summarize connected YouTube accounts with publishing readiness, analytics status, permissions, and token expiry.",
    {
      profile_id: z.string().optional().describe("Filter by Zernio profile ID. Uses ZERNIO_DEFAULT_PROFILE_ID if omitted."),
    },
    async ({ profile_id }) => {
      const result = await summarizePlatformAccounts("youtube", profile_id);
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_youtube_channel_insights",
    "Get YouTube channel-level insights such as views, watch time, likes, comments, shares, and subscriber deltas.",
    {
      account_id: z.string().optional().describe("YouTube account ID. Auto-selects when only one account exists in the target profile."),
      profile_id: z.string().optional().describe("Zernio profile ID. Uses ZERNIO_DEFAULT_PROFILE_ID if omitted."),
      since: z.string().optional().describe("Start date YYYY-MM-DD."),
      until: z.string().optional().describe("End date YYYY-MM-DD."),
      metric_type: youtubeMetricType.optional().describe("time_series for daily values, total_value for aggregate totals."),
      metrics: z.array(z.string()).optional().describe("Optional metric keys if you want a narrower payload."),
    },
    async ({ account_id, profile_id, since, until, metric_type, metrics }) => {
      const target = await resolvePlatformTarget("youtube", account_id, profile_id);
      const result = await zernioGet("/analytics/youtube/channel-insights", {
        accountId: target.accountId,
        since,
        until,
        metricType: metric_type ?? "total_value",
        metrics: metrics?.join(","),
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_youtube_video_daily_views",
    "Get daily YouTube video analytics including views, watch time, average view duration, subscriber changes, likes, comments, and shares.",
    {
      account_id: z.string().optional().describe("YouTube account ID. Auto-selects when only one account exists in the target profile."),
      profile_id: z.string().optional().describe("Zernio profile ID. Uses ZERNIO_DEFAULT_PROFILE_ID if omitted."),
      video_id: z.string().describe("Native YouTube video ID, e.g. dQw4w9WgXcQ."),
      start_date: z.string().optional().describe("YYYY-MM-DD start date."),
      end_date: z.string().optional().describe("YYYY-MM-DD end date."),
    },
    async ({ account_id, profile_id, video_id, start_date, end_date }) => {
      const target = await resolvePlatformTarget("youtube", account_id, profile_id);
      const result = await zernioGet("/analytics/youtube/daily-views", {
        accountId: target.accountId,
        videoId: video_id,
        startDate: start_date,
        endDate: end_date,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_youtube_demographics",
    "Get YouTube audience demographics broken down by age, gender, and/or country.",
    {
      account_id: z.string().optional().describe("YouTube account ID. Auto-selects when only one account exists in the target profile."),
      profile_id: z.string().optional().describe("Zernio profile ID. Uses ZERNIO_DEFAULT_PROFILE_ID if omitted."),
      dimensions: z.array(z.enum(["age", "gender", "country"])).optional().describe("Dimensions to request. Defaults to all available slices."),
      start_date: z.string().optional().describe("YYYY-MM-DD start date."),
      end_date: z.string().optional().describe("YYYY-MM-DD end date."),
    },
    async ({ account_id, profile_id, dimensions, start_date, end_date }) => {
      const target = await resolvePlatformTarget("youtube", account_id, profile_id);
      const result = await zernioGet("/analytics/youtube/demographics", {
        accountId: target.accountId,
        dimensions: dimensions?.join(","),
        since: start_date,
        until: end_date,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_youtube_post_video",
    "Create a YouTube video upload or scheduled publication with title, description, tags, visibility, thumbnail, and COPPA flags.",
    {
      account_id: z.string().optional().describe("YouTube account ID. Auto-selects when only one account exists in the target profile."),
      profile_id: z.string().optional().describe("Zernio profile ID. Uses ZERNIO_DEFAULT_PROFILE_ID if omitted."),
      title: z.string().describe("YouTube video title."),
      description: z.string().optional().describe("YouTube description."),
      video_url: z.string().describe("Public URL to the source video."),
      thumbnail_url: z.string().optional().describe("Optional custom thumbnail URL."),
      tags: z.array(z.string()).optional().describe("Optional YouTube tags."),
      visibility: z.enum(["private", "unlisted", "public"]).optional().describe("Default private for safe upload flows."),
      is_short: z.boolean().optional().describe("Flag this video as a Short when appropriate."),
      made_for_kids: z.boolean().optional().describe("COPPA flag."),
      publish_now: z.boolean().optional().describe("Publish immediately."),
      is_draft: z.boolean().optional().describe("Save as draft/private in Zernio."),
      scheduled_for: z.string().optional().describe("ISO datetime for scheduled publishing."),
      timezone: z.string().optional().describe("Timezone for scheduled publishing. Default UTC."),
    },
    async ({ account_id, profile_id, title, description, video_url, thumbnail_url, tags, visibility, is_short, made_for_kids, publish_now, is_draft, scheduled_for, timezone }) => {
      const target = await resolvePlatformTarget("youtube", account_id, profile_id);
      const result = await zernioPost("/posts", {
        title,
        content: description,
        mediaItems: [{ type: "video", url: video_url }],
        tags,
        platforms: [{
          platform: "youtube",
          accountId: target.accountId,
          profileId: target.profileId,
          platformSpecificData: compactObject({
            visibility: visibility ?? "private",
            thumbnailUrl: thumbnail_url,
            isShort: is_short,
            madeForKids: made_for_kids,
          }),
        }],
        publishNow: publish_now ?? false,
        isDraft: is_draft ?? false,
        scheduledFor: scheduled_for,
        timezone: timezone ?? "UTC",
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_googleads_accounts_list",
    "Summarize connected Google Ads accounts with customer IDs, ads status, and operational readiness.",
    {
      profile_id: z.string().optional().describe("Filter by Zernio profile ID. Uses ZERNIO_DEFAULT_PROFILE_ID if omitted."),
    },
    async ({ profile_id }) => {
      const result = await summarizePlatformAccounts("googleads", profile_id);
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_tiktokads_accounts_list",
    "Summarize connected TikTok Ads accounts with operational readiness, permissions, and token status.",
    {
      profile_id: z.string().optional().describe("Filter by Zernio profile ID. Uses ZERNIO_DEFAULT_PROFILE_ID if omitted."),
    },
    async ({ profile_id }) => {
      const result = await summarizePlatformAccounts("tiktokads", profile_id);
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_ads_campaign_tree",
    "Get the nested paid media hierarchy (campaign > ad set > ad) with rolled-up metrics. Works across Meta, TikTok Ads, LinkedIn Ads, Google Ads, Pinterest, and X.",
    {
      page: z.number().int().min(1).optional().describe("Page number. Default 1."),
      limit: z.number().int().min(1).max(100).optional().describe("Campaigns per page. Default 20."),
      source: adTreeSource.optional().describe("all includes external platform-managed campaigns; zernio limits to ads created through Zernio."),
      platform: adTreePlatform.optional().describe("Paid platform family filter."),
      status: adTreeStatus.optional().describe("Derived campaign status filter."),
      ad_account_id: z.string().optional().describe("Platform ad account ID filter."),
      account_id: z.string().optional().describe("Connected Zernio account ID filter."),
      profile_id: z.string().optional().describe("Zernio profile ID filter."),
      from_date: z.string().optional().describe("Metrics lower bound YYYY-MM-DD. Defaults to last 90 days."),
      to_date: z.string().optional().describe("Metrics upper bound YYYY-MM-DD."),
    },
    async ({ page, limit, source, platform, status, ad_account_id, account_id, profile_id, from_date, to_date }) => {
      const result = await zernioGet("/ads/tree", {
        page: page ?? 1,
        limit: limit ?? 20,
        source: source ?? "all",
        platform,
        status,
        adAccountId: ad_account_id,
        accountId: account_id,
        profileId: profile_id,
        fromDate: from_date,
        toDate: to_date,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "zernio_ads_boost_post",
    "Boost an existing post as an ad. Supports platforms where Zernio exposes ad boosting, including TikTok Ads, LinkedIn Ads, Meta, Pinterest, X, and Google where applicable.",
    {
      post_id: z.string().optional().describe("Zernio post ID. Provide this or platform_post_id."),
      platform_post_id: z.string().optional().describe("Native platform post ID alternative."),
      account_id: z.string().describe("Connected social/posting account ID."),
      ad_account_id: z.string().describe("Ad account ID to spend from."),
      name: z.string().describe("Ad name."),
      goal: z.enum(["engagement", "traffic", "awareness", "video_views", "lead_generation", "conversions", "app_promotion"]).describe("Campaign objective."),
      budget_amount: z.number().positive().describe("Budget amount."),
      budget_type: z.enum(["daily", "lifetime"]).describe("Budget type."),
      currency: z.string().optional().describe("Optional ISO currency code."),
      start_date: z.string().optional().describe("ISO start datetime."),
      end_date: z.string().optional().describe("ISO end datetime."),
      link_url: z.string().optional().describe("Destination URL when the platform/goal supports it."),
      call_to_action: z.string().optional().describe("CTA label when supported by the platform."),
    },
    async ({ post_id, platform_post_id, account_id, ad_account_id, name, goal, budget_amount, budget_type, currency, start_date, end_date, link_url, call_to_action }) => {
      if (!post_id && !platform_post_id) {
        throw new Error("Pass post_id or platform_post_id.");
      }
      const result = await zernioPost("/ads/boost", {
        postId: post_id,
        platformPostId: platform_post_id,
        accountId: account_id,
        adAccountId: ad_account_id,
        name,
        goal,
        budget: {
          amount: budget_amount,
          type: budget_type,
        },
        currency,
        schedule: compactObject({
          startDate: start_date,
          endDate: end_date,
        }),
        creative: compactObject({
          linkUrl: link_url,
          callToAction: call_to_action,
        }),
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );
}

async function summarizePlatformAccounts(platform: string, profileId: string | undefined) {
  const resolvedProfileId = profileId ?? await getDefaultZernioProfileId();
  const accounts = await fetchPlatformAccounts(platform, resolvedProfileId);
  return {
    platform,
    profile_id: resolvedProfileId ?? null,
    total: accounts.length,
    accounts: accounts.map((account) => summarizeAccount(account)),
  };
}

async function fetchPlatformAccounts(platform: string, profileId?: string) {
  const response = await zernioGet("/accounts", {
    platform,
    profileId,
    limit: 100,
  });
  return getCollection(response, ["accounts", "data", "items"])
    .filter((account) => {
      const accountPlatform = stringValue(account.platform ?? account.network).toLowerCase();
      if (accountPlatform !== platform) return false;
      if (!profileId) return true;
      const profileRef = asRecord(account.profileId);
      const accountProfileId = stringValue(profileRef._id ?? profileRef.id ?? account.profile?._id ?? account.profile?.id ?? account.profileId);
      return accountProfileId === profileId;
    });
}

async function resolvePlatformTarget(platform: CorePublishingPlatform | "googleads" | "tiktokads", accountId?: string, profileId?: string) {
  const resolvedProfileId = profileId ?? await getDefaultZernioProfileId();
  const accounts = await fetchPlatformAccounts(platform, resolvedProfileId);
  if (accountId) {
    const account = accounts.find((item) => stringValue(item._id ?? item.id ?? item.accountId) === accountId);
    if (!account) {
      throw new Error(`Account ${accountId} was not found for ${platform} in profile ${resolvedProfileId ?? "(default profile)"}.`);
    }
    return { accountId, profileId: resolvedProfileId, account };
  }

  if (accounts.length === 1) {
    const account = accounts[0];
    return {
      accountId: stringValue(account._id ?? account.id ?? account.accountId),
      profileId: resolvedProfileId,
      account,
    };
  }

  if (accounts.length === 0) {
    throw new Error(`No ${platform} accounts are connected in profile ${resolvedProfileId ?? "(default profile)"}. Use zernio_connect_get_url first.`);
  }

  const options = accounts
    .map((account) => `${stringValue(account._id ?? account.id ?? account.accountId)}:${stringValue(account.username ?? account.handle ?? account.displayName ?? "unknown")}`)
    .join(", ");
  throw new Error(`Multiple ${platform} accounts are connected. Pass account_id explicitly. Options: ${options}`);
}

function summarizeAccount(account: ZernioAccount) {
  const metadata = asRecord(account.metadata);
  const profileData = asRecord(metadata.profileData);
  const extraData = asRecord(profileData.extraData);
  const profileRef = asRecord(account.profileId);
  const profile = asRecord(account.profile);
  const googleBusinessLocation = asRecord(metadata.googleBusinessLocation);
  return {
    id: stringValue(account._id ?? account.id ?? account.accountId),
    profile_id: stringValue(profileRef._id ?? profileRef.id ?? profile._id ?? profile.id),
    profile_name: stringValue(profileRef.name ?? profile.name),
    platform: stringValue(account.platform),
    handle: stringValue(account.username ?? account.handle ?? profileData.username ?? account.displayName),
    display_name: stringValue(account.displayName ?? profileData.displayName ?? profileData.username),
    account_type: stringValue(extraData.accountType ?? profileData.accountType ?? account.accountType),
    followers: numberValue(account.followersCount ?? profileData.followersCount),
    profile_url: stringValue(account.profileUrl ?? profileData.profileUrl),
    publish_ready: Boolean(account.enabled !== false && account.isActive !== false && stringValue(account.platformStatus || "active") === "active"),
    analytics_ready: Boolean(account.analyticsLastSyncedAt ?? asRecord(account.xCapabilities).analytics),
    permissions: stringArray(account.permissions),
    permissions_count: stringArray(account.permissions).length,
    privacy_levels: stringArray(metadata.availablePrivacyLevels ?? metadata.privacyLevels ?? metadata.creatorPrivacyLevels ?? metadata.postPrivacyOptions),
    platform_status: stringValue(account.platformStatus ?? account.status ?? account.connectionStatus),
    token_expires_at: stringValue(account.tokenExpiresAt),
    ads_status: stringValue(account.adsStatus),
    external_post_count: numberValue(account.externalPostCount),
    customer_ids: stringArray(metadata.googleAdsCustomerIds ?? metadata.customerIds),
    selected_location_id: stringValue(metadata.selectedLocationId ?? googleBusinessLocation.locationId),
    selected_location_name: stringValue(metadata.selectedLocationName ?? googleBusinessLocation.name),
    location_address: stringValue(metadata.locationAddress ?? googleBusinessLocation.address),
  };
}

function resolveConnectPath(platform: z.infer<typeof zernioPlatform>) {
  if (platform === "googleads") return "/connect/googleads/ads";
  if (platform === "tiktokads") return "/connect/tiktok/ads";
  if (platform === "linkedinads") return "/connect/linkedin/ads";
  return `/connect/${platform}`;
}

function toYearMonth(value: string | undefined) {
  if (!value) return undefined;
  const trimmed = value.trim();
  return /^\d{4}-\d{2}/.test(trimmed) ? trimmed.slice(0, 7) : undefined;
}

function getCollection(payload: unknown, keys: string[]) {
  const record = asRecord(payload);
  for (const key of keys) {
    const candidate = record[key];
    if (Array.isArray(candidate)) return candidate.map(asRecord);
    if (candidate && typeof candidate === "object") {
      const nested = asRecord(candidate);
      if (Array.isArray(nested.items)) return nested.items.map(asRecord);
      if (Array.isArray(nested.data)) return nested.data.map(asRecord);
    }
  }
  return [];
}

function compactObject<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ""));
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" ? value as Record<string, any> : {};
}

function stringValue(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => stringValue(item)).filter(Boolean);
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}
