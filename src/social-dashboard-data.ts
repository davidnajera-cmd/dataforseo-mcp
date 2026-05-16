import { getRuntimeVariable } from "./runtime-config.js";
import { zernioGet } from "./zernio-client.js";
import { normalizeFilters, type DashboardFilters, type CountryCode } from "./dashboard-data.js";

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

type SiteCode = Exclude<CountryCode, "all">;

type SocialSiteConfig = {
  code: SiteCode;
  profileId: string | null;
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
    note: string;
  };
};

export async function collectSocialDashboardData(input: Partial<DashboardFilters>): Promise<SocialDashboardData> {
  const filters = normalizeFilters(input);
  const sites = filters.country === "all" ? (["co", "mx", "lta"] as const) : ([filters.country] as const);
  const configs = await Promise.all(sites.map(getSocialSiteConfig));
  const social = await loadSocialDashboard(configs, filters);
  const sources: SourceStatus[] = [{ name: "Zernio Social", status: sourceStatus(social), message: social.message }];

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
      note: social.message,
    },
  };
}

async function getSocialSiteConfig(site: SiteCode): Promise<SocialSiteConfig> {
  if (site === "co") {
    return { code: "co", profileId: (await getRuntimeVariable("ZERNIO_PROFILE_ID_CO")) ?? (await getRuntimeVariable("ZERNIO_DEFAULT_PROFILE_ID")) ?? null };
  }
  if (site === "mx") {
    return { code: "mx", profileId: (await getRuntimeVariable("ZERNIO_PROFILE_ID_MX")) ?? (await getRuntimeVariable("ZERNIO_DEFAULT_PROFILE_ID")) ?? null };
  }
  return { code: "lta", profileId: (await getRuntimeVariable("ZERNIO_PROFILE_ID_LTA")) ?? (await getRuntimeVariable("ZERNIO_DEFAULT_PROFILE_ID")) ?? null };
}

async function loadSocialDashboard(configs: SocialSiteConfig[], filters: DashboardFilters): Promise<SocialData> {
  if (!await getRuntimeVariable("ZERNIO_API_KEY")) {
    return emptySocial("Falta ZERNIO_API_KEY.");
  }

  const profileIds = [...new Set(configs.map((config) => config.profileId).filter(Boolean) as string[])];
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
      for (const platform of post.platforms.length ? post.platforms : ["unknown"]) {
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
  return typeof value === "string" && value.trim() ? value : null;
}

function nullableNumber(value: unknown): number | null {
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
