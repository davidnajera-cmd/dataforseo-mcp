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

const mediaItemSchema = z.object({
  type: z.enum(["image", "video", "carousel", "document"]).describe("Media type recognized by Zernio."),
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
}
