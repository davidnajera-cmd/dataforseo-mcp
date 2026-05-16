import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDefaultZernioProfileId, zernioGet, zernioPost } from "./zernio-client.js";

function formatResult(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

const zernioPlatform = z.enum([
  "facebook",
  "instagram",
  "linkedin",
  "twitter",
  "tiktok",
  "youtube",
  "threads",
  "reddit",
  "pinterest",
  "bluesky",
  "googlebusiness",
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
      const result = await zernioGet(`/connect/${platform}`, {
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
}

async function summarizePlatformAccounts(platform: "instagram" | "tiktok", profileId: string | undefined) {
  const resolvedProfileId = profileId ?? await getDefaultZernioProfileId();
  const accounts = await fetchPlatformAccounts(platform, resolvedProfileId);
  return {
    platform,
    profile_id: resolvedProfileId ?? null,
    total: accounts.length,
    accounts: accounts.map((account) => summarizeAccount(account)),
  };
}

async function fetchPlatformAccounts(platform: "instagram" | "tiktok", profileId?: string) {
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

async function resolvePlatformTarget(platform: "instagram" | "tiktok", accountId?: string, profileId?: string) {
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
  };
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
