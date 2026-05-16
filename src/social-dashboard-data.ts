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
  profileName: string | null;
  status: string;
  followers: number | null;
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
  published: number;
  scheduled: number;
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
  publishedPosts: number;
  scheduledPosts: number;
  draftPosts: number;
  accounts: SocialAccountRow[];
  posts: SocialPostRow[];
  byPlatform: SocialPlatformSummary[];
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
    published_posts: number;
    scheduled_posts: number;
    draft_posts: number;
    accounts: SocialAccountRow[];
    posts: SocialPostRow[];
    by_platform: SocialPlatformSummary[];
    note: string;
  };
};

export async function collectSocialDashboardData(input: Partial<DashboardFilters>): Promise<SocialDashboardData> {
  const filters = normalizeFilters(input);
  const sites = filters.country === "all" ? (["co", "mx", "lta"] as const) : ([filters.country] as const);
  const configs = await Promise.all(sites.map(getSocialSiteConfig));
  const social = await loadSocialDashboard(configs);
  const sources: SourceStatus[] = [{ name: "Zernio Social", status: sourceStatus(social), message: social.message }];

  const metrics: Metric[] = [
    {
      label: "Cuentas conectadas",
      value: social.connectedAccounts ? formatNumber(social.connectedAccounts) : "Sin datos",
      delta: null,
      detail: `${formatNumber(social.profiles)} perfiles activos`,
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
        ? social.byPlatform.map((item) => `${capitalize(item.platform)} (${item.accounts})`).slice(0, 3).join(" · ")
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
      published_posts: social.publishedPosts,
      scheduled_posts: social.scheduledPosts,
      draft_posts: social.draftPosts,
      accounts: social.accounts,
      posts: social.posts,
      by_platform: social.byPlatform,
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

async function loadSocialDashboard(configs: SocialSiteConfig[]): Promise<SocialData> {
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

    const posts = postResults.flatMap((result) => "__error" in asRecord(result) ? [] : getCollection(result, ["posts", "data", "items"]));
    const postErrors = postResults
      .map((result) => asRecord(result))
      .filter((item) => typeof item.__error === "string")
      .map((item) => String(item.__error));

    const accountsRows = accounts.slice(0, 12).map((item) => ({
      id: stringValue(item.id ?? item.accountId ?? item._id),
      platform: stringValue(item.platform ?? item.network ?? "unknown"),
      handle: stringValue(item.handle ?? item.username ?? item.name ?? "Sin handle"),
      profileName: nullableString(item.profile?.name ?? item.profileId?.name ?? item.profileName),
      status: stringValue(item.status ?? item.connectionStatus ?? item.platformStatus ?? (item.isActive === false ? "inactive" : "active")),
      followers: nullableNumber(item.followers ?? item.followersCount ?? item.audience),
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

    const byPlatformMap = new Map<string, SocialPlatformSummary>();
    for (const account of accountsRows) {
      const row = byPlatformMap.get(account.platform) ?? { platform: account.platform, accounts: 0, published: 0, scheduled: 0 };
      row.accounts += 1;
      byPlatformMap.set(account.platform, row);
    }
    for (const post of postRows) {
      for (const platform of post.platforms.length ? post.platforms : ["unknown"]) {
        const row = byPlatformMap.get(platform) ?? { platform, accounts: 0, published: 0, scheduled: 0 };
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
        ? `Datos parciales. ${postErrors.join(" | ")}`
        : "Datos sociales disponibles desde Zernio.",
      profiles: profileCount,
      connectedAccounts: accountsRows.length,
      publishedPosts,
      scheduledPosts,
      draftPosts,
      accounts: accountsRows,
      posts: postRows,
      byPlatform: [...byPlatformMap.values()].sort((a, b) => a.platform.localeCompare(b.platform)),
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
    publishedPosts: 0,
    scheduledPosts: 0,
    draftPosts: 0,
    accounts: [],
    posts: [],
    byPlatform: [],
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

function formatNumber(value: number): string {
  return new Intl.NumberFormat("es-CO").format(Math.round(value));
}

function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}
