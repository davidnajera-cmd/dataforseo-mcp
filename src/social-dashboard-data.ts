import { getRuntimeVariable } from "./runtime-config.js";
import { zernioGet } from "./zernio-client.js";
import { normalizeFilters, type DashboardFilters, type CountryCode } from "./dashboard-data.js";
import {
  listGoogleBusinessAccounts,
  listGoogleBusinessKeywordHistory,
  listGoogleBusinessLocationHistory,
  listGoogleBusinessPerformanceHistory,
  listGoogleBusinessReviews,
} from "./google-business-store.js";

type SourceStatus = {
  name: string;
  status: "live" | "pending" | "error";
  message: string;
};

type Metric = {
  label: string;
  value: string;
  delta: number | null;
  detail: string;
  source: string;
};

type SocialAccountRow = {
  id: string;
  platform: string;
  handle: string;
  displayName: string | null;
  profileName: string | null;
  status: string;
  followers: number | null;
  accountType: string | null;
  permissionsCount: number;
  profileUrl: string | null;
  tokenExpiresAt: string | null;
  publishReady: boolean;
  analyticsReady: boolean;
  privacyLevels: string[];
};

type SocialPostRow = {
  id: string;
  title: string;
  excerpt: string;
  platforms: string[];
  status: string;
  scheduledFor: string | null;
  publishedAt: string | null;
  profileName: string | null;
};

type SocialPlatformSummary = {
  platform: string;
  accounts: number;
  publishReady: number;
  published: number;
  scheduled: number;
};

type SocialVoiceQuote = {
  platform: string;
  author: string | null;
  text: string;
  signal: "lead" | "negative" | "positive" | "question";
};

type SocialAlert = {
  postId: string;
  permalink: string | null;
  contentPreview: string;
  commentCount: number;
  negativeComments: number;
  leadQuestions: number;
  sampleNegative: string | null;
};

type SocialTopPost = {
  postId: string;
  platform: string;
  content: string;
  publishedAt: string | null;
  engagementRate: number | null;
  impressions: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  views: number | null;
};

type SocialBestSlot = {
  platform: string;
  dayOfWeek: number;
  hour: number;
  avgEngagement: number;
  postCount: number;
};

type SocialCadenceRow = {
  platform: string;
  postsPerWeek: number;
  avgEngagementRate: number;
  avgEngagement: number;
  weeksCount: number;
};

type SocialLocalLocationRow = {
  locationId: string;
  accountId: string;
  locationName: string;
  city: string | null;
  category: string | null;
  websiteUri: string | null;
  phonePrimary: string | null;
  reviewUrl: string | null;
  mapsUri: string | null;
  averageRating: number | null;
  totalReviewCount: number | null;
  unansweredReviews: number;
  lowRatingReviews: number;
  recentReviews30d: number;
  latestReviewAt: string | null;
  completenessScore: number;
  topKeyword: string | null;
  topKeywordImpressions: number | null;
  websiteClicks: number;
  callClicks: number;
  directionRequests: number;
};

type SocialLocalKeywordRow = {
  keyword: string;
  impressions: number;
  locationName: string;
};

type SocialLocalTrendPoint = {
  date: string;
  websiteClicks: number;
  callClicks: number;
  directionRequests: number;
};

type SocialLocalData = {
  live: boolean;
  error?: boolean;
  message: string;
  snapshotDate: string | null;
  accounts: number;
  locations: number;
  reviews: number;
  unansweredReviews: number;
  avgRating: number | null;
  coverageScore: number | null;
  recentReviews30d: number;
  lowRatingReviews: number;
  websiteClicks: number;
  callClicks: number;
  directionRequests: number;
  locationsRows: SocialLocalLocationRow[];
  topKeywords: SocialLocalKeywordRow[];
  trend: SocialLocalTrendPoint[];
};

type SiteCode = Exclude<CountryCode, "all">;

type SocialSiteConfig = {
  code: SiteCode;
  profileIds: string[];
};

type SocialData = {
  live: boolean;
  error?: boolean;
  message: string;
  profiles: number;
  connectedAccounts: number;
  publishReadyAccounts: number;
  analyticsReadyAccounts: number;
  publishedPosts: number;
  scheduledPosts: number;
  draftPosts: number;
  accounts: SocialAccountRow[];
  posts: SocialPostRow[];
  byPlatform: SocialPlatformSummary[];
  customerVoice: {
    commentsAnalyzed: number;
    leadQuestions: number;
    negativeSignals: number;
    questionComments: number;
    topTerms: Array<{ term: string; count: number }>;
    quotes: SocialVoiceQuote[];
  };
  reputationAlerts: SocialAlert[];
  topPosts: SocialTopPost[];
  calendar: {
    bestSlots: SocialBestSlot[];
    cadence: SocialCadenceRow[];
    recommendation: string;
  };
};

export type SocialDashboardData = {
  generatedAt: string;
  filters: DashboardFilters;
  overview: {
    verdict: string;
    summary: string;
    metrics: Metric[];
  };
  sources: SourceStatus[];
  social: {
    profiles: number;
    connected_accounts: number;
    publish_ready_accounts: number;
    analytics_ready_accounts: number;
    published_posts: number;
    scheduled_posts: number;
    draft_posts: number;
    accounts: SocialAccountRow[];
    posts: SocialPostRow[];
    by_platform: SocialPlatformSummary[];
    customer_voice: SocialData["customerVoice"];
    reputation_alerts: SocialAlert[];
    top_posts: SocialTopPost[];
    calendar: SocialData["calendar"];
    local_presence: {
      snapshot_date: string | null;
      accounts: number;
      locations: number;
      reviews: number;
      unanswered_reviews: number;
      avg_rating: number | null;
      coverage_score: number | null;
      recent_reviews_30d: number;
      low_rating_reviews: number;
      website_clicks: number;
      call_clicks: number;
      direction_requests: number;
      locations_rows: SocialLocalLocationRow[];
      top_keywords: SocialLocalKeywordRow[];
      trend: SocialLocalTrendPoint[];
      note: string;
    };
    note: string;
  };
};

export async function collectSocialDashboardData(input: Partial<DashboardFilters>): Promise<SocialDashboardData> {
  const filters = normalizeFilters(input);
  const sites = filters.country === "all" ? (["co", "mx", "lta"] as const) : ([filters.country] as const);
  const configs = await Promise.all(sites.map(getSocialSiteConfig));
  const [social, localPresence] = await Promise.all([
    loadSocialDashboard(configs, filters),
    loadGoogleBusinessLocalPresence(configs),
  ]);
  const sources: SourceStatus[] = [
    { name: "Zernio Social", status: sourceStatus(social), message: social.message },
    { name: "Google Business History", status: sourceStatus(localPresence), message: localPresence.message },
  ];

  const metrics: Metric[] = [
    {
      label: "Cuentas conectadas",
      value: social.connectedAccounts ? formatNumber(social.connectedAccounts) : "Sin datos",
      delta: null,
      detail: `${formatNumber(social.profiles)} perfiles activos · ${formatNumber(social.publishReadyAccounts)} listas para publicar`,
      source: social.live ? "Zernio" : "Pendiente",
    },
    {
      label: "Posts publicados",
      value: social.publishedPosts ? formatNumber(social.publishedPosts) : "Sin datos",
      delta: null,
      detail: "Tomados de los posts recientes del submódulo social.",
      source: social.live ? "Zernio" : "Pendiente",
    },
    {
      label: "Programados",
      value: social.scheduledPosts ? formatNumber(social.scheduledPosts) : "Sin datos",
      delta: null,
      detail: `${formatNumber(social.draftPosts)} drafts`,
      source: social.live ? "Zernio" : "Pendiente",
    },
    {
      label: "Plataformas activas",
      value: social.byPlatform.length ? formatNumber(social.byPlatform.length) : "Sin datos",
      delta: null,
      detail: social.byPlatform.length
        ? social.byPlatform.map((item) => `${capitalize(item.platform)} (${item.publishReady}/${item.accounts} publish-ready)`).slice(0, 3).join(" · ")
        : social.message,
      source: social.live ? "Zernio" : "Pendiente",
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    filters,
    overview: {
      verdict: social.live ? "Redes sociales conectadas" : "Submódulo social pendiente",
      summary: social.message,
      metrics,
    },
    sources,
    social: {
      profiles: social.profiles,
      connected_accounts: social.connectedAccounts,
      publish_ready_accounts: social.publishReadyAccounts,
      analytics_ready_accounts: social.analyticsReadyAccounts,
      published_posts: social.publishedPosts,
      scheduled_posts: social.scheduledPosts,
      draft_posts: social.draftPosts,
      accounts: social.accounts,
      posts: social.posts,
      by_platform: social.byPlatform,
      customer_voice: social.customerVoice,
      reputation_alerts: social.reputationAlerts,
      top_posts: social.topPosts,
      calendar: social.calendar,
      local_presence: {
        snapshot_date: localPresence.snapshotDate,
        accounts: localPresence.accounts,
        locations: localPresence.locations,
        reviews: localPresence.reviews,
        unanswered_reviews: localPresence.unansweredReviews,
        avg_rating: localPresence.avgRating,
        coverage_score: localPresence.coverageScore,
        recent_reviews_30d: localPresence.recentReviews30d,
        low_rating_reviews: localPresence.lowRatingReviews,
        website_clicks: localPresence.websiteClicks,
        call_clicks: localPresence.callClicks,
        direction_requests: localPresence.directionRequests,
        locations_rows: localPresence.locationsRows,
        top_keywords: localPresence.topKeywords,
        trend: localPresence.trend,
        note: localPresence.message,
      },
      note: social.message,
    },
  };
}

async function getSocialSiteConfig(site: SiteCode): Promise<SocialSiteConfig> {
  if (site === "co") {
    return { code: "co", profileIds: await getConfiguredProfileIds("ZERNIO_PROFILE_ID_CO") };
  }
  if (site === "mx") {
    return { code: "mx", profileIds: await getConfiguredProfileIds("ZERNIO_PROFILE_ID_MX") };
  }
  return { code: "lta", profileIds: await getConfiguredProfileIds("ZERNIO_PROFILE_ID_LTA") };
}

async function loadSocialDashboard(configs: SocialSiteConfig[], filters: DashboardFilters): Promise<SocialData> {
  if (!await getRuntimeVariable("ZERNIO_API_KEY")) {
    return emptySocial("Falta ZERNIO_API_KEY.");
  }

  const profileIds = [...new Set(configs.flatMap((config) => config.profileIds).filter(Boolean))];
  if (!profileIds.length) {
    return emptySocial("Configura ZERNIO_PROFILE_ID_* o ZERNIO_DEFAULT_PROFILE_ID para mapear redes al submódulo.");
  }

  try {
    const [profilesRaw, accountsRaw] = await Promise.all([
      zernioGet("/profiles"),
      zernioGet("/accounts"),
    ]);

    const profiles = getCollection(profilesRaw, ["profiles", "data", "items"]);
    const accounts = getCollection(accountsRaw, ["accounts", "data", "items"])
      .filter((item) => {
        const profileRef = asRecord(item.profileId);
        const profileValue = profileRef._id ?? profileRef.id ?? item.profileId ?? item.profile?._id ?? item.profile?.id ?? item.profile?.profileId;
        return profileIds.includes(stringValue(profileValue));
      });

    const postResults = await Promise.all(profileIds.map(async (profileId) => {
      try {
        return await zernioGet("/posts", { profileId, limit: 25 });
      } catch (error) {
        return { __error: error instanceof Error ? error.message : "Zernio posts failed", profileId };
      }
    }));

    const analyticsResults = await Promise.all(profileIds.map(async (profileId) => {
      try {
        return await zernioGet("/analytics", {
          profileId,
          fromDate: filters.startDate,
          toDate: filters.endDate,
          sortBy: "engagement",
          order: "desc",
          limit: 12,
          page: 1,
        });
      } catch (error) {
        return { __error: error instanceof Error ? error.message : "Zernio analytics failed", profileId };
      }
    }));

    const commentsResults = await Promise.all(profileIds.map(async (profileId) => {
      try {
        return await zernioGet("/inbox/comments", {
          profileId,
          platform: "instagram",
          minComments: 1,
          limit: 5,
          sortBy: "comments",
          sortOrder: "desc",
        });
      } catch (error) {
        return { __error: error instanceof Error ? error.message : "Zernio comments failed", profileId };
      }
    }));

    const bestTimeResults = await Promise.all(profileIds.map(async (profileId) => {
      try {
        return await zernioGet("/analytics/best-time", { profileId, source: "all" });
      } catch (error) {
        return { __error: error instanceof Error ? error.message : "Zernio best-time failed", profileId };
      }
    }));

    const cadenceResults = await Promise.all(profileIds.map(async (profileId) => {
      try {
        return await zernioGet("/analytics/posting-frequency", { profileId, source: "all" });
      } catch (error) {
        return { __error: error instanceof Error ? error.message : "Zernio posting-frequency failed", profileId };
      }
    }));

    const posts = postResults.flatMap((result) => "__error" in asRecord(result) ? [] : getCollection(result, ["posts", "data", "items"]));
    const analyticsRows = analyticsResults.flatMap((result) => "__error" in asRecord(result) ? [] : getCollection(result, ["data", "posts", "items"]));
    const postErrors = postResults
      .map((result) => asRecord(result))
      .filter((item) => typeof item.__error === "string")
      .map((item) => String(item.__error));
    const analyticsErrors = analyticsResults
      .map((result) => asRecord(result))
      .filter((item) => typeof item.__error === "string")
      .map((item) => String(item.__error));

    const accountsRows = accounts.slice(0, 12).map((item) => ({
      id: stringValue(item.id ?? item.accountId ?? item._id),
      platform: stringValue(item.platform ?? item.network ?? "unknown"),
      handle: stringValue(item.handle ?? item.username ?? item.name ?? "Sin handle"),
      displayName: nullableString(item.displayName ?? item.metadata?.profileData?.displayName ?? item.name),
      profileName: nullableString(item.profile?.name ?? item.profileId?.name ?? item.profileName),
      status: stringValue(item.status ?? item.connectionStatus ?? item.platformStatus ?? (item.isActive === false ? "inactive" : "active")),
      followers: nullableNumber(item.followers ?? item.followersCount ?? item.audience),
      accountType: nullableString(item.metadata?.profileData?.extraData?.accountType ?? item.metadata?.profileData?.accountType ?? item.accountType),
      permissionsCount: stringArray(item.permissions).length,
      profileUrl: nullableString(item.profileUrl ?? item.metadata?.profileData?.profileUrl),
      tokenExpiresAt: nullableString(item.tokenExpiresAt),
      publishReady: item.enabled !== false && item.isActive !== false && stringValue(item.platformStatus ?? item.status ?? "active") === "active",
      analyticsReady: Boolean(item.analyticsLastSyncedAt ?? item.xCapabilities?.analytics),
      privacyLevels: stringArray(item.metadata?.availablePrivacyLevels ?? item.metadata?.privacyLevels ?? item.metadata?.creatorPrivacyLevels ?? item.metadata?.postPrivacyOptions),
    }));

    const postRows = posts.slice(0, 12).map((item) => ({
      id: stringValue(item.id ?? item.postId ?? item._id),
      title: stringValue(item.title ?? item.name ?? "Post"),
      excerpt: stringValue(item.content ?? item.caption ?? item.text ?? "").slice(0, 140),
      platforms: stringArray(item.platforms ?? item.channels ?? item.accounts?.map((account: unknown) => asRecord(account).platform)),
      status: stringValue(item.status ?? "unknown"),
      scheduledFor: nullableString(item.scheduledFor ?? item.scheduledAt ?? item.publishAt),
      publishedAt: nullableString(item.publishedAt ?? item.postedAt),
      profileName: nullableString(item.profile?.name ?? item.profileName),
    }));

    const topPosts = analyticsRows.slice(0, 10).map((item) => {
      const analytics = asRecord(item.analytics);
      return {
        postId: stringValue(item.postId ?? item.id ?? item._id),
        platform: stringValue(item.platform ?? "unknown"),
        content: stringValue(item.content ?? item.caption ?? item.text),
        publishedAt: nullableString(item.publishedAt ?? item.createdAt ?? item.scheduledFor),
        engagementRate: nullableNumber(analytics.engagementRate),
        impressions: nullableNumber(analytics.impressions),
        reach: nullableNumber(analytics.reach),
        likes: nullableNumber(analytics.likes),
        comments: nullableNumber(analytics.comments),
        shares: nullableNumber(analytics.shares),
        saves: nullableNumber(analytics.saves),
        views: nullableNumber(analytics.views),
      };
    });

    const commentedPosts = commentsResults.flatMap((result) => "__error" in asRecord(result) ? [] : getCollection(result, ["data", "items", "posts"]));
    const commentThreads = await Promise.all(commentedPosts.slice(0, 5).map(async (post) => {
      const postId = stringValue(post.id);
      const accountId = stringValue(post.accountId);
      if (!postId || !accountId) return null;
      try {
        const detail = await zernioGet(`/inbox/comments/${encodeURIComponent(postId)}`, { accountId, limit: 10 });
        const comments = getCollection(detail, ["comments"]);
        const heuristics = buildCommentHeuristics(comments);
        return {
          postId,
          permalink: nullableString(post.permalink),
          contentPreview: stringValue(post.content).slice(0, 160),
          commentCount: nullableNumber(post.commentCount) ?? comments.length,
          negativeComments: heuristics.negativeSignals,
          leadQuestions: heuristics.leadQuestions,
          sampleNegative: heuristics.quotes.find((item) => item.signal === "negative")?.text ?? null,
          quotes: heuristics.quotes,
          topTerms: heuristics.topTerms,
          questionComments: heuristics.questionComments,
        };
      } catch {
        return null;
      }
    }));
    const validThreads = commentThreads.filter(Boolean) as Array<{
      postId: string;
      permalink: string | null;
      contentPreview: string;
      commentCount: number;
      negativeComments: number;
      leadQuestions: number;
      sampleNegative: string | null;
      quotes: SocialVoiceQuote[];
      topTerms: Array<{ term: string; count: number }>;
      questionComments: number;
    }>;
    const customerVoice = mergeCustomerVoice(validThreads);

    const bestSlots = bestTimeResults.flatMap((result) => {
      const record = asRecord(result);
      if (typeof record.__error === "string") return [];
      return getArray(record.slots).map((item: unknown) => {
        const row = asRecord(item);
        return {
          platform: stringValue(row.platform ?? "mixed"),
          dayOfWeek: nullableNumber(row.day_of_week) ?? 0,
          hour: nullableNumber(row.hour) ?? 0,
          avgEngagement: nullableNumber(row.avg_engagement) ?? 0,
          postCount: nullableNumber(row.post_count) ?? 0,
        };
      });
    }).sort((a, b) => b.avgEngagement - a.avgEngagement).slice(0, 6);

    const cadence = cadenceResults.flatMap((result) => {
      const record = asRecord(result);
      if (typeof record.__error === "string") return [];
      return getArray(record.frequency).map((item: unknown) => {
        const row = asRecord(item);
        return {
          platform: stringValue(row.platform ?? "mixed"),
          postsPerWeek: nullableNumber(row.posts_per_week) ?? 0,
          avgEngagementRate: nullableNumber(row.avg_engagement_rate) ?? 0,
          avgEngagement: nullableNumber(row.avg_engagement) ?? 0,
          weeksCount: nullableNumber(row.weeks_count) ?? 0,
        };
      });
    }).sort((a, b) => b.avgEngagementRate - a.avgEngagementRate);

    const byPlatformMap = new Map<string, SocialPlatformSummary>();
    for (const account of accountsRows) {
      const row = byPlatformMap.get(account.platform) ?? { platform: account.platform, accounts: 0, publishReady: 0, published: 0, scheduled: 0 };
      row.accounts += 1;
      if (account.publishReady) row.publishReady += 1;
      byPlatformMap.set(account.platform, row);
    }
    for (const post of postRows) {
      const platforms = Array.isArray(post.platforms) && post.platforms.length ? post.platforms : ["unknown"];
      for (const platform of platforms) {
        const row = byPlatformMap.get(platform) ?? { platform, accounts: 0, publishReady: 0, published: 0, scheduled: 0 };
        if (post.status === "published") row.published += 1;
        if (post.status === "scheduled") row.scheduled += 1;
        byPlatformMap.set(platform, row);
      }
    }

    const publishedPosts = postRows.filter((item) => item.status === "published").length;
    const scheduledPosts = postRows.filter((item) => item.status === "scheduled").length;
    const draftPosts = postRows.filter((item) => item.status === "draft").length;
    const profileCount = profiles.filter((item) => profileIds.includes(stringValue(item.id ?? item.profileId ?? item._id))).length || profileIds.length;

    return {
      live: accountsRows.length > 0 || postRows.length > 0,
      message: postErrors.length
        ? `Datos parciales. ${[...postErrors, ...analyticsErrors].join(" | ")}`
        : "Datos sociales disponibles desde Zernio.",
      profiles: profileCount,
      connectedAccounts: accountsRows.length,
      publishReadyAccounts: accountsRows.filter((item) => item.publishReady).length,
      analyticsReadyAccounts: accountsRows.filter((item) => item.analyticsReady).length,
      publishedPosts,
      scheduledPosts,
      draftPosts,
      accounts: accountsRows,
      posts: postRows,
      byPlatform: [...byPlatformMap.values()].sort((a, b) => a.platform.localeCompare(b.platform)),
      customerVoice,
      reputationAlerts: validThreads
        .filter((item) => item.negativeComments > 0 || item.leadQuestions > 0)
        .map(({ quotes, topTerms, questionComments, ...item }) => item),
      topPosts,
      calendar: {
        bestSlots,
        cadence,
        recommendation: buildCalendarRecommendation(bestSlots, cadence),
      },
    };
  } catch (error) {
    return {
      ...emptySocial(error instanceof Error ? error.message : "Zernio no respondio."),
      error: true,
    };
  }
}

async function getConfiguredProfileIds(primaryVariable: "ZERNIO_PROFILE_ID_CO" | "ZERNIO_PROFILE_ID_MX" | "ZERNIO_PROFILE_ID_LTA"): Promise<string[]> {
  const primary = parseProfileIds(await getRuntimeVariable(primaryVariable));
  if (primary.length) return primary;
  return parseProfileIds(await getRuntimeVariable("ZERNIO_DEFAULT_PROFILE_ID"));
}

function parseProfileIds(raw: string | null | undefined): string[] {
  return String(raw ?? "")
    .split(/[,\n]/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function sourceStatus(data: { live: boolean; error?: boolean }): SourceStatus["status"] {
  if (data.live) return "live";
  if (data.error) return "error";
  return "pending";
}

function emptySocial(message: string): SocialData {
  return {
    live: false,
    error: message.includes("error") || message.includes("Error"),
    message,
    profiles: 0,
    connectedAccounts: 0,
    publishReadyAccounts: 0,
    analyticsReadyAccounts: 0,
    publishedPosts: 0,
    scheduledPosts: 0,
    draftPosts: 0,
    accounts: [],
    posts: [],
    byPlatform: [],
    customerVoice: {
      commentsAnalyzed: 0,
      leadQuestions: 0,
      negativeSignals: 0,
      questionComments: 0,
      topTerms: [],
      quotes: [],
    },
    reputationAlerts: [],
    topPosts: [],
    calendar: {
      bestSlots: [],
      cadence: [],
      recommendation: message,
    },
  };
}

async function loadGoogleBusinessLocalPresence(configs: SocialSiteConfig[]): Promise<SocialLocalData> {
  const profileIds = new Set(configs.flatMap((config) => config.profileIds).filter(Boolean));
  if (!profileIds.size) {
    return emptyLocalPresence("Sin perfiles Zernio mapeados para historizar Google Business en este sitio.");
  }

  try {
    const [accountsRaw, locationsRaw, reviewsRaw, performanceRaw, keywordsRaw] = await Promise.all([
      listGoogleBusinessAccounts(),
      listGoogleBusinessLocationHistory({ days: 365 }),
      listGoogleBusinessReviews({ limit: 2000 }),
      listGoogleBusinessPerformanceHistory({ days: 365 }),
      listGoogleBusinessKeywordHistory({ days: 365 }),
    ]);

    const accounts = accountsRaw.filter((row) => profileIds.has(stringValue(row.profile_id)));
    if (!accounts.length) {
      return emptyLocalPresence("Todavía no hay cuentas Google Business historizadas para este sitio.");
    }

    const accountIds = new Set(accounts.map((row) => stringValue(row.account_id)).filter(Boolean));
    const locationRows = locationsRaw.filter((row) => accountIds.has(stringValue(row.account_id)));
    const latestLocations = latestLocationsById(locationRows);
    const reviews = reviewsRaw.filter((row) => accountIds.has(stringValue(row.account_id)));
    const performanceRows = latestRowsByAccount(performanceRaw.filter((row) => accountIds.has(stringValue(row.account_id))));
    const keywordRows = latestRowsByAccount(keywordsRaw.filter((row) => accountIds.has(stringValue(row.account_id))));

    const reviewStats = buildReviewStatsByLocation(reviews);
    const performanceByAccount = new Map(performanceRows.map((row) => [stringValue(row.account_id), row]));
    const keywordsByAccount = new Map(keywordRows.map((row) => [stringValue(row.account_id), row]));

    const locationsRows = latestLocations.map((row) => {
      const locationId = stringValue(row.location_id);
      const accountId = stringValue(row.account_id);
      const stats = reviewStats.get(locationId);
      const performance = performanceByAccount.get(accountId);
      const keywords = keywordsByAccount.get(accountId);
      const keywordWinner = topKeyword(keywords?.keywords);
      return {
        locationId,
        accountId,
        locationName: stringValue(row.location_name),
        city: inferCity(stringValue(row.location_name)),
        category: nullableString(row.category_primary),
        websiteUri: nullableString(row.website_uri),
        phonePrimary: nullableString(row.phone_primary),
        reviewUrl: nullableString(row.review_url),
        mapsUri: nullableString(row.maps_uri),
        averageRating: nullableNumber(row.average_rating) ?? stats?.avgRating ?? null,
        totalReviewCount: nullableNumber(row.total_review_count) ?? stats?.count ?? null,
        unansweredReviews: stats?.unanswered ?? 0,
        lowRatingReviews: stats?.lowRatings ?? 0,
        recentReviews30d: stats?.recent30d ?? 0,
        latestReviewAt: stats?.latestReviewAt ?? null,
        completenessScore: locationCompletenessScore(row),
        topKeyword: keywordWinner?.keyword ?? null,
        topKeywordImpressions: keywordWinner?.impressions ?? null,
        websiteClicks: metricTotal(performance?.metrics, ["WEBSITE_CLICKS"]),
        callClicks: metricTotal(performance?.metrics, ["CALL_CLICKS"]),
        directionRequests: metricTotal(performance?.metrics, ["BUSINESS_DIRECTION_REQUESTS", "DIRECTION_REQUESTS"]),
      };
    }).sort((a, b) => {
      const weightA = (a.totalReviewCount ?? 0) + a.recentReviews30d * 2 + a.websiteClicks + a.callClicks;
      const weightB = (b.totalReviewCount ?? 0) + b.recentReviews30d * 2 + b.websiteClicks + b.callClicks;
      return weightB - weightA;
    });

    const topKeywords = keywordRows.flatMap((row) => {
      const account = accounts.find((item) => stringValue(item.account_id) === stringValue(row.account_id));
      const locationName = stringValue(account?.selected_location_name ?? account?.display_name ?? "Sede");
      return getArray(row.keywords).map((keyword) => {
        const entry = asRecord(keyword);
        return {
          keyword: stringValue(entry.keyword),
          impressions: nullableNumber(entry.impressions) ?? 0,
          locationName,
        };
      });
    })
      .filter((row) => row.keyword && row.impressions > 0)
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 12);

    return {
      live: locationsRows.length > 0,
      message: locationsRows.length
        ? `Base GBP historizada: ${formatNumber(locationsRows.length)} sedes, ${formatNumber(reviews.length)} reseñas y señales locales listas para operar.`
        : "Sin sedes historizadas todavía.",
      snapshotDate: latestLocations[0] ? stringValue(latestLocations[0].snapshot_date) : null,
      accounts: accounts.length,
      locations: locationsRows.length,
      reviews: reviews.length,
      unansweredReviews: locationsRows.reduce((sum, row) => sum + row.unansweredReviews, 0),
      avgRating: average(locationsRows.map((row) => row.averageRating).filter(isFiniteNumber)),
      coverageScore: average(locationsRows.map((row) => row.completenessScore).filter(isFiniteNumber)),
      recentReviews30d: locationsRows.reduce((sum, row) => sum + row.recentReviews30d, 0),
      lowRatingReviews: locationsRows.reduce((sum, row) => sum + row.lowRatingReviews, 0),
      websiteClicks: locationsRows.reduce((sum, row) => sum + row.websiteClicks, 0),
      callClicks: locationsRows.reduce((sum, row) => sum + row.callClicks, 0),
      directionRequests: locationsRows.reduce((sum, row) => sum + row.directionRequests, 0),
      locationsRows,
      topKeywords,
      trend: buildLocalTrend(performanceRows),
    };
  } catch (error) {
    return {
      ...emptyLocalPresence(error instanceof Error ? error.message : "No se pudo leer el histórico de Google Business."),
      error: true,
    };
  }
}

function emptyLocalPresence(message: string): SocialLocalData {
  return {
    live: false,
    message,
    snapshotDate: null,
    accounts: 0,
    locations: 0,
    reviews: 0,
    unansweredReviews: 0,
    avgRating: null,
    coverageScore: null,
    recentReviews30d: 0,
    lowRatingReviews: 0,
    websiteClicks: 0,
    callClicks: 0,
    directionRequests: 0,
    locationsRows: [],
    topKeywords: [],
    trend: [],
  };
}

function latestLocationsById(rows: Array<Record<string, unknown>>) {
  const map = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const locationId = stringValue(row.location_id);
    const current = map.get(locationId);
    const snapshot = stringValue(row.snapshot_date);
    if (!current || snapshot > stringValue(current.snapshot_date)) map.set(locationId, row);
  }
  return [...map.values()];
}

function latestRowsByAccount(rows: Array<Record<string, unknown>>) {
  const map = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const accountId = stringValue(row.account_id);
    const current = map.get(accountId);
    const snapshot = stringValue(row.snapshot_date);
    if (!current || snapshot > stringValue(current.snapshot_date)) map.set(accountId, row);
  }
  return [...map.values()];
}

function buildReviewStatsByLocation(rows: Array<Record<string, unknown>>) {
  const map = new Map<string, {
    count: number;
    unanswered: number;
    lowRatings: number;
    recent30d: number;
    latestReviewAt: string | null;
    ratingSum: number;
    ratingCount: number;
    avgRating: number | null;
  }>();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);

  for (const row of rows) {
    const locationId = stringValue(row.location_id);
    const current = map.get(locationId) ?? {
      count: 0,
      unanswered: 0,
      lowRatings: 0,
      recent30d: 0,
      latestReviewAt: null,
      ratingSum: 0,
      ratingCount: 0,
      avgRating: null,
    };
    current.count += 1;
    const rating = nullableNumber(row.rating);
    if (isFiniteNumber(rating)) {
      current.ratingSum += rating;
      current.ratingCount += 1;
      if (rating <= 3) current.lowRatings += 1;
    }
    if (!Boolean(row.has_reply)) current.unanswered += 1;
    const createdAt = nullableString(row.create_time);
    if (createdAt) {
      if (!current.latestReviewAt || createdAt > current.latestReviewAt) current.latestReviewAt = createdAt;
      const date = new Date(createdAt);
      if (!Number.isNaN(date.getTime()) && date >= cutoff) current.recent30d += 1;
    }
    current.avgRating = current.ratingCount ? current.ratingSum / current.ratingCount : null;
    map.set(locationId, current);
  }
  return map;
}

function locationCompletenessScore(row: Record<string, unknown>) {
  const checks = [
    nullableString(row.website_uri),
    nullableString(row.phone_primary),
    nullableString(row.category_primary),
    nullableString(row.review_url),
    nullableString(row.maps_uri),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

function topKeyword(rawKeywords: unknown) {
  return getArray(rawKeywords)
    .map((item) => {
      const row = asRecord(item);
      return {
        keyword: stringValue(row.keyword),
        impressions: nullableNumber(row.impressions) ?? 0,
      };
    })
    .sort((a, b) => b.impressions - a.impressions)[0] ?? null;
}

function metricTotal(rawMetrics: unknown, metricNames: string[]) {
  const metrics = asRecord(rawMetrics);
  for (const name of metricNames) {
    const total = nullableNumber(asRecord(metrics[name]).total);
    if (isFiniteNumber(total)) return total;
  }
  return 0;
}

function buildLocalTrend(rows: Array<Record<string, unknown>>): SocialLocalTrendPoint[] {
  const buckets = new Map<string, SocialLocalTrendPoint>();
  for (const row of rows) {
    addMetricTrend(buckets, row.metrics, "WEBSITE_CLICKS", "websiteClicks");
    addMetricTrend(buckets, row.metrics, "CALL_CLICKS", "callClicks");
    addMetricTrend(buckets, row.metrics, "BUSINESS_DIRECTION_REQUESTS", "directionRequests");
    addMetricTrend(buckets, row.metrics, "DIRECTION_REQUESTS", "directionRequests");
  }
  return [...buckets.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-30);
}

function addMetricTrend(
  buckets: Map<string, SocialLocalTrendPoint>,
  rawMetrics: unknown,
  metricName: string,
  targetKey: keyof Pick<SocialLocalTrendPoint, "websiteClicks" | "callClicks" | "directionRequests">
) {
  const metric = asRecord(asRecord(rawMetrics)[metricName]);
  for (const point of getArray(metric.values)) {
    const row = asRecord(point);
    const date = stringValue(row.date);
    if (!date) continue;
    const bucket = buckets.get(date) ?? { date, websiteClicks: 0, callClicks: 0, directionRequests: 0 };
    bucket[targetKey] += nullableNumber(row.value) ?? 0;
    buckets.set(date, bucket);
  }
}

function inferCity(locationName: string) {
  if (locationName.trim().toLowerCase() === "dna music") return "Bogotá";
  const normalized = locationName
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  const direct = [
    ["bogota", "Bogotá"],
    ["medellin", "Medellín"],
    ["barranquilla", "Barranquilla"],
    ["cali", "Cali"],
    ["ibague", "Ibagué"],
    ["pereira", "Pereira"],
  ].find(([needle]) => normalized.includes(needle));
  return direct?.[1] ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asRecord(value: unknown): Record<string, any> {
  return isRecord(value) ? value as Record<string, any> : {};
}

function getCollection(raw: unknown, keys: string[]): Array<Record<string, any>> {
  const record = asRecord(raw);
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value.map((item) => asRecord(item));
  }
  if (Array.isArray(raw)) return raw.map((item) => asRecord(item));
  return [];
}

function stringValue(value: unknown): string {
  return typeof value === "string" && value.trim() ? value : String(value ?? "");
}

function nullableString(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  return typeof value === "string" && value.trim() ? value : null;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => typeof item === "string" ? item : stringValue(asRecord(item).platform ?? asRecord(item).name))
    .filter(Boolean);
}

function getArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("es-CO").format(Math.round(value));
}

function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function buildCommentHeuristics(comments: Array<Record<string, any>>) {
  const negativeTerms = ["caro", "costoso", "malo", "mal", "error", "terrible", "no sirve", "engaño", "lento", "peor"];
  const leadTerms = ["precio", "informacion", "información", "horario", "curso", "programa", "sede", "whatsapp", "dm", "inscripcion", "inscripción", "cupo"];
  const positiveTerms = ["brutal", "excelente", "gracias", "duro", "top", "increible", "increíble", "🔥", "👏"];
  const quotes: SocialVoiceQuote[] = [];
  let leadQuestions = 0;
  let negativeSignals = 0;
  let questionComments = 0;
  const counter = new Map<string, number>();
  for (const item of comments) {
    const text = stringValue(item.message ?? item.text ?? item.content).trim();
    if (!text) continue;
    const lowered = text.toLowerCase();
    const signal = lowered.includes("?")
      ? "question"
      : negativeTerms.some((term) => lowered.includes(term))
        ? "negative"
        : leadTerms.some((term) => lowered.includes(term))
          ? "lead"
          : positiveTerms.some((term) => lowered.includes(term))
            ? "positive"
            : "positive";
    if (signal === "question") questionComments += 1;
    if (signal === "lead" || leadTerms.some((term) => lowered.includes(term))) leadQuestions += 1;
    if (signal === "negative") negativeSignals += 1;
    if (quotes.length < 8) {
      quotes.push({
        platform: "instagram",
        author: nullableString(item.from?.username ?? item.from?.name),
        text,
        signal,
      });
    }
    for (const token of tokenize(lowered)) {
      counter.set(token, (counter.get(token) ?? 0) + 1);
    }
  }
  const topTerms = [...counter.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([term, count]) => ({ term, count }));
  return { leadQuestions, negativeSignals, questionComments, quotes, topTerms };
}

function mergeCustomerVoice(threads: Array<{ quotes: SocialVoiceQuote[]; topTerms: Array<{ term: string; count: number }>; leadQuestions: number; negativeComments: number; questionComments: number }>) {
  const termCounter = new Map<string, number>();
  const quotes = threads.flatMap((item) => item.quotes).slice(0, 8);
  for (const thread of threads) {
    for (const term of thread.topTerms) termCounter.set(term.term, (termCounter.get(term.term) ?? 0) + term.count);
  }
  return {
    commentsAnalyzed: threads.reduce((sum, item) => sum + item.quotes.length, 0),
    leadQuestions: threads.reduce((sum, item) => sum + item.leadQuestions, 0),
    negativeSignals: threads.reduce((sum, item) => sum + item.negativeComments, 0),
    questionComments: threads.reduce((sum, item) => sum + item.questionComments, 0),
    topTerms: [...termCounter.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([term, count]) => ({ term, count })),
    quotes,
  };
}

function buildCalendarRecommendation(bestSlots: SocialBestSlot[], cadence: SocialCadenceRow[]) {
  if (!bestSlots.length && !cadence.length) return "Sin suficiente histórico para recomendar calendario.";
  const topSlot = bestSlots[0];
  const topCadence = cadence[0];
  const dayLabel = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"][topSlot?.dayOfWeek ?? 0];
  return topSlot && topCadence
    ? `Prioriza ${capitalize(topCadence.platform)} con ${formatNumber(topCadence.postsPerWeek)} posts/semana. Mejor slot observado: ${dayLabel} ${String(topSlot.hour).padStart(2, "0")}:00 con engagement promedio ${formatNumber(topSlot.avgEngagement)}.`
    : "Usa los slots con mayor engagement histórico y evita subir frecuencia sin validar el rendimiento por semana.";
}

function tokenize(text: string) {
  const stop = new Set(["que", "para", "con", "una", "por", "los", "las", "del", "está", "esta", "como", "pero", "sin", "hola", "gracias", "favor", "porque", "muy", "todo", "desde", "sobre", "entre", "cuando"]);
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .split(/[^a-z0-9#@]+/i)
    .map((item) => item.trim())
    .filter((item) => item.length > 2 && !stop.has(item));
}

function average(values: number[]) {
  const valid = values.filter(isFiniteNumber);
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
