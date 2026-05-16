import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getConfiguredActor, runActorSync } from "./apify-client.js";
import { getRuntimeVariable } from "./runtime-config.js";
import { getDefaultZernioProfileId, zernioGet } from "./zernio-client.js";
import { deepseekChat } from "./agent/deepseek-client.js";

type JsonRecord = Record<string, unknown>;

const zernioPlatform = z.enum([
  "instagram",
  "tiktok",
  "youtube",
  "facebook",
  "threads",
  "linkedin",
  "reddit",
  "twitter",
  "bluesky",
]);

const SPANISH_STOPWORDS = new Set([
  "de", "la", "el", "que", "y", "en", "a", "los", "del", "se", "las", "por", "un", "para", "con", "no", "una",
  "su", "al", "lo", "como", "más", "pero", "sus", "le", "ya", "o", "este", "sí", "porque", "esta", "entre", "cuando",
  "muy", "sin", "sobre", "también", "me", "hasta", "hay", "donde", "quien", "desde", "todo", "nos", "durante", "todos",
  "uno", "les", "ni", "contra", "otros", "ese", "eso", "ante", "ellos", "e", "esto", "mí", "antes", "algunos", "qué",
  "unos", "yo", "otro", "otras", "otra", "él", "tanto", "esa", "estos", "mucho", "quienes", "nada", "muchos", "cual",
  "poco", "ella", "estar", "estas", "algunas", "algo", "nosotros", "mi", "mis", "tú", "te", "ti", "tu", "tus",
  "ellas", "nosotras", "vosostros", "vosostras", "os", "mío", "mía", "míos", "mías", "tuyo", "tuya", "tuyos", "tuyas",
  "suyo", "suya", "suyos", "suyas", "nuestro", "nuestra", "nuestros", "nuestras", "vuestro", "vuestra", "vuestros", "vuestras",
  "es", "son", "fue", "eran", "ser", "ha", "han", "he", "qué", "si", "hola", "gracias", "favor",
]);

const POSITIVE_TERMS = ["brutal", "duro", "excelente", "gracias", "amo", "genial", "wow", "🔥", "👏", "increible", "buen", "buena", "top"];
const NEGATIVE_TERMS = ["malo", "mal", "caro", "costoso", "peor", "engaño", "mentira", "lento", "no sirve", "terrible", "horrible", "error", "falló"];
const LEAD_TERMS = ["precio", "coste", "costo", "cuánto", "cuanto", "información", "info", "inscripción", "inscripcion", "horario", "horarios", "sede", "curso", "programa", "beca", "cupo", "whatsapp", "dm"];

export function registerSocialIntelligenceTools(server: McpServer) {
  server.tool(
    "social_intel_comments_analyze",
    "Deep analysis of social comments: fetches real comments, detects sentiment and intent signals, extracts themes, and returns actionable audience intelligence.",
    {
      source: z.enum(["instagram_post", "tiktok_urls"]).describe("Comment source."),
      post_id: z.string().optional().describe("Instagram/Zernio post ID for source=instagram_post."),
      account_id: z.string().optional().describe("Instagram connected account ID for source=instagram_post."),
      video_urls: z.array(z.string()).optional().describe("TikTok video URLs for source=tiktok_urls."),
      max_comments: z.number().int().min(1).max(200).optional().describe("Cap comments analyzed. Default 80."),
      include_replies: z.boolean().optional().describe("Include replies when available. Default true."),
    },
    async ({ source, post_id, account_id, video_urls, max_comments, include_replies }) => {
      let comments: CommentRow[] = [];
      if (source === "instagram_post") {
        if (!post_id || !account_id) throw new Error("post_id and account_id are required for source=instagram_post.");
        comments = await fetchInstagramComments(post_id, account_id, max_comments ?? 80, include_replies ?? true);
      } else {
        if (!video_urls || video_urls.length === 0) throw new Error("video_urls is required for source=tiktok_urls.");
        comments = await fetchTikTokComments(video_urls, max_comments ?? 80, include_replies ?? true);
      }
      const analysis = await analyzeComments({
        source,
        comments,
        objective: "Resume sentimiento, objeciones, preguntas, intención comercial y oportunidades editoriales.",
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(analysis, null, 2) }] };
    }
  );

  server.tool(
    "social_intel_reputation_alerts",
    "Scan recent social comments and flag negative spikes, objections, repeated questions, and possible reputation risks.",
    {
      profile_id: z.string().optional().describe("Zernio profile ID. Uses ZERNIO_DEFAULT_PROFILE_ID if omitted."),
      platform: z.enum(["instagram"]).optional().describe("Current implementation uses Zernio comment inbox. Default instagram."),
      min_comments: z.number().int().min(0).optional().describe("Only posts with at least this many comments. Default 1."),
      limit_posts: z.number().int().min(1).max(30).optional().describe("How many recent commented posts to scan. Default 10."),
      comments_per_post: z.number().int().min(1).max(100).optional().describe("How many comments to inspect per post. Default 20."),
    },
    async ({ profile_id, platform, min_comments, limit_posts, comments_per_post }) => {
      const resolvedProfileId = profile_id ?? await getDefaultZernioProfileId();
      const postsRaw = await zernioGet("/inbox/comments", {
        profileId: resolvedProfileId,
        platform: platform ?? "instagram",
        minComments: min_comments ?? 1,
        limit: limit_posts ?? 10,
        sortBy: "comments",
        sortOrder: "desc",
      });
      const posts = getArray(asRecord(postsRaw).data).map(asRecord);
      const alerts: JsonRecord[] = [];
      for (const post of posts) {
        const postId = stringValue(post.id);
        const accountId = stringValue(post.accountId);
        if (!postId || !accountId) continue;
        const comments = await fetchInstagramComments(postId, accountId, comments_per_post ?? 20, true);
        const snapshot = quickCommentHeuristics(comments);
        if (snapshot.negative_comments > 0 || snapshot.lead_questions > 0) {
          alerts.push({
            post_id: postId,
            permalink: stringValue(post.permalink),
            content_preview: clip(stringValue(post.content), 160),
            comment_count: numberValue(post.commentCount) ?? comments.length,
            negative_comments: snapshot.negative_comments,
            lead_questions: snapshot.lead_questions,
            repeated_topics: snapshot.top_terms.slice(0, 5),
            sample_negative: snapshot.sample_negative,
            sample_leads: snapshot.sample_leads,
          });
        }
      }
      return { content: [{ type: "text" as const, text: JSON.stringify({ profile_id: resolvedProfileId ?? null, alerts }, null, 2) }] };
    }
  );

  server.tool(
    "social_intel_top_posts_report",
    "Build a performance report of top social posts by platform and metric, with content pattern detection and editorial takeaways.",
    {
      profile_id: z.string().optional().describe("Zernio profile ID. Uses ZERNIO_DEFAULT_PROFILE_ID if omitted."),
      platform: zernioPlatform.optional().describe("Filter by platform."),
      from_date: z.string().optional().describe("YYYY-MM-DD lower bound."),
      to_date: z.string().optional().describe("YYYY-MM-DD upper bound."),
      sort_by: z.enum(["engagement", "impressions", "reach", "likes", "comments", "shares", "saves", "clicks", "views"]).optional(),
      limit: z.number().int().min(1).max(25).optional(),
    },
    async ({ profile_id, platform, from_date, to_date, sort_by, limit }) => {
      const result = await zernioGet("/analytics", {
        profileId: profile_id ?? await getDefaultZernioProfileId(),
        platform,
        fromDate: from_date,
        toDate: to_date,
        sortBy: sort_by ?? "engagement",
        order: "desc",
        limit: limit ?? 10,
        page: 1,
      });
      const rows = normalizeAnalyticsRows(result);
      const brief = await summarizeTopPosts(rows, sort_by ?? "engagement");
      return { content: [{ type: "text" as const, text: JSON.stringify(brief, null, 2) }] };
    }
  );

  server.tool(
    "social_intel_channel_brief",
    "Strategic channel brief for Instagram or TikTok: account metrics, best posting times, cadence, growth, and content strategy recommendations.",
    {
      platform: z.enum(["instagram", "tiktok"]).describe("Target platform."),
      account_id: z.string().optional().describe("Specific account ID. Auto-selects when only one account exists for that platform in the default profile."),
      profile_id: z.string().optional().describe("Profile ID. Uses ZERNIO_DEFAULT_PROFILE_ID if omitted."),
      since: z.string().optional().describe("Start date YYYY-MM-DD."),
      until: z.string().optional().describe("End date YYYY-MM-DD."),
    },
    async ({ platform, account_id, profile_id, since, until }) => {
      const target = await resolvePlatformTarget(platform, account_id, profile_id);
      const [accountInsights, bestTime, postingFrequency, dailyMetrics] = await Promise.all([
        platform === "instagram"
          ? zernioGet("/analytics/instagram/account-insights", { accountId: target.accountId, since, until, metricType: "total_value" })
          : zernioGet("/analytics/tiktok/account-insights", { accountId: target.accountId, since, until, metricType: "total_value" }),
        zernioGet("/analytics/best-time", { accountId: target.accountId, platform, source: "all" }),
        zernioGet("/analytics/posting-frequency", { accountId: target.accountId, platform, source: "all" }),
        zernioGet("/analytics/daily-metrics", { profileId: target.profileId, platform, fromDate: since, toDate: until }),
      ]);
      const payload = {
        platform,
        account_id: target.accountId,
        profile_id: target.profileId,
        account_insights: accountInsights,
        best_time: bestTime,
        posting_frequency: postingFrequency,
        daily_metrics: dailyMetrics,
      };
      const brief = await summarizeStructured(
        "Eres un estratega de social media. Resume performance, cadence, timing, risks y 5 recomendaciones concretas. Devuelve JSON con overview, findings, risks, opportunities y action_plan.",
        payload,
        fallbackChannelBrief(payload)
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(brief, null, 2) }] };
    }
  );

  server.tool(
    "social_intel_youtube_transcript_analyze",
    "Transcribe YouTube videos and extract themes, hooks, repeated topics, lesson structure, and content opportunities from the transcript.",
    {
      video_urls: z.array(z.string()).optional().describe("Specific YouTube video URLs."),
      channel_urls: z.array(z.string()).optional().describe("Optional channel URLs to fetch recent videos from."),
      language: z.string().optional().describe("Preferred transcript language, e.g. es."),
      max_items: z.number().int().min(1).max(20).optional().describe("Max videos to analyze. Default 5."),
    },
    async ({ video_urls, channel_urls, language, max_items }) => {
      if ((!video_urls || video_urls.length === 0) && (!channel_urls || channel_urls.length === 0)) {
        throw new Error("Pass video_urls or channel_urls.");
      }
      const actorId = await getConfiguredActor("youtube");
      const items = await runActorSync(actorId, {
        ...(video_urls && video_urls.length > 0 ? { videoUrls: video_urls, urls: video_urls } : {}),
        ...(channel_urls && channel_urls.length > 0 ? { channelUrls: channel_urls } : {}),
        ...(language ? { language, languageCode: language } : {}),
      }, { max_items: max_items ?? 5 });
      const normalized = items.map(asRecord).map((item) => ({
        title: stringValue(item.title ?? item.videoTitle ?? item.name),
        url: stringValue(item.url ?? item.videoUrl),
        transcript: stringValue(item.transcript ?? item.text ?? item.content ?? item.subtitles),
      })).filter((item) => item.transcript);
      const summary = await summarizeStructured(
        "Eres un analista editorial y de customer research. Analiza transcripts de YouTube y devuelve JSON con topics, repeated_questions, hooks, content_gaps y content_opportunities.",
        normalized,
        fallbackTranscriptSummary(normalized)
      );
      return { content: [{ type: "text" as const, text: JSON.stringify({ items: normalized, analysis: summary }, null, 2) }] };
    }
  );
}

type CommentRow = {
  id: string;
  text: string;
  author: string | null;
  created_at: string | null;
  like_count: number | null;
  reply_count: number | null;
  parent_id: string | null;
  platform: string;
  source_url: string | null;
};

async function fetchInstagramComments(postId: string, accountId: string, maxComments: number, includeReplies: boolean): Promise<CommentRow[]> {
  const raw = await zernioGet(`/inbox/comments/${encodeURIComponent(postId)}`, {
    accountId,
    limit: Math.min(maxComments, 100),
  });
  const comments = getArray(asRecord(raw).comments).map(asRecord);
  const rows: CommentRow[] = [];
  for (const comment of comments) {
    rows.push(toCommentRow(comment, null, "instagram"));
    if (includeReplies) {
      for (const reply of getArray(comment.replies).map(asRecord)) rows.push(toCommentRow(reply, stringValue(comment.id), "instagram"));
    }
  }
  return rows.slice(0, maxComments);
}

async function fetchTikTokComments(videoUrls: string[], maxComments: number, includeReplies: boolean): Promise<CommentRow[]> {
  const actorId = await getConfiguredActor("tiktok_comments");
  const items = await runActorSync(actorId, {
    videoUrls,
    maxCommentsPerVideo: maxComments,
    commentsPerPost: maxComments,
    includeReplies,
  }, { max_items: Math.max(maxComments, videoUrls.length) });
  return items.map(asRecord).map((item) => ({
    id: stringValue(item.id ?? item.commentId ?? item.cid),
    text: stringValue(item.text ?? item.comment ?? item.content ?? item.message),
    author: nullableString(item.authorName ?? item.author ?? item.username ?? asRecord(item.user).nickname),
    created_at: nullableString(item.createTimeISO ?? item.createdAt ?? item.timestamp),
    like_count: numberValue(item.likes ?? item.likeCount ?? item.diggCount),
    reply_count: numberValue(item.replyCount ?? item.repliesCount),
    parent_id: nullableString(item.parentCommentId ?? item.parentId),
    platform: "tiktok",
    source_url: nullableString(item.videoUrl ?? item.url),
  })).filter((row) => row.text);
}

function toCommentRow(comment: JsonRecord, parentId: string | null, platform: string): CommentRow {
  const from = asRecord(comment.from);
  return {
    id: stringValue(comment.id),
    text: stringValue(comment.message ?? comment.text ?? comment.content),
    author: nullableString(from.username ?? from.name),
    created_at: nullableString(comment.createdTime ?? comment.createdAt),
    like_count: numberValue(comment.likeCount),
    reply_count: numberValue(comment.replyCount),
    parent_id: parentId,
    platform,
    source_url: nullableString(comment.url),
  };
}

async function analyzeComments(input: { source: string; comments: CommentRow[]; objective: string }) {
  const quick = quickCommentHeuristics(input.comments);
  const fallback = {
    source: input.source,
    comments_analyzed: input.comments.length,
    overview: {
      positive_comments: quick.positive_comments,
      negative_comments: quick.negative_comments,
      lead_questions: quick.lead_questions,
      question_comments: quick.question_comments,
    },
    top_terms: quick.top_terms,
    sample_positive: quick.sample_positive,
    sample_negative: quick.sample_negative,
    sample_leads: quick.sample_leads,
    recommendations: [
      quick.lead_questions > 0 ? "Responder rápido dudas de precio, horarios y sedes; aquí hay intención comercial real." : "Mantener monitoreo de preguntas comerciales para detectar lead intent.",
      quick.negative_comments > 0 ? "Revisar objeciones o fricciones repetidas antes de que escalen en reputación." : "No hay alerta fuerte de reputación negativa en esta muestra.",
      quick.top_terms.length ? `Convertir los temas dominantes (${quick.top_terms.slice(0, 5).join(", ")}) en líneas editoriales o guiones de video.` : "Ampliar muestra de comentarios para detectar temas dominantes.",
    ],
  };
  return summarizeStructured(
    `Eres un analista de customer voice para DNA Music. ${input.objective} Devuelve JSON con overview, themes, objections, lead_intent, notable_quotes, recommendations.`,
    { comments: input.comments.slice(0, 120) },
    fallback
  );
}

function quickCommentHeuristics(comments: CommentRow[]) {
  const normalized = comments.map((item) => item.text.toLowerCase());
  const positive = normalized.filter((text) => containsAny(text, POSITIVE_TERMS));
  const negative = normalized.filter((text) => containsAny(text, NEGATIVE_TERMS));
  const leads = normalized.filter((text) => text.includes("?") || containsAny(text, LEAD_TERMS));
  return {
    positive_comments: positive.length,
    negative_comments: negative.length,
    lead_questions: leads.length,
    question_comments: normalized.filter((text) => text.includes("?")).length,
    top_terms: topTerms(normalized.join(" "), 12),
    sample_positive: sampleRows(comments, (row) => containsAny(row.text.toLowerCase(), POSITIVE_TERMS)),
    sample_negative: sampleRows(comments, (row) => containsAny(row.text.toLowerCase(), NEGATIVE_TERMS)),
    sample_leads: sampleRows(comments, (row) => row.text.includes("?") || containsAny(row.text.toLowerCase(), LEAD_TERMS)),
  };
}

function normalizeAnalyticsRows(result: unknown) {
  const root = asRecord(result);
  const list = getArray(root.data ?? root.posts ?? root.items).map(asRecord);
  return list.map((row) => {
    const analytics = asRecord(row.analytics);
    return {
      post_id: stringValue(row.postId ?? row.id ?? row._id),
      platform: stringValue(row.platform),
      content: stringValue(row.content ?? row.caption ?? row.text),
      published_at: stringValue(row.publishedAt ?? row.createdAt ?? row.scheduledFor),
      analytics: {
        engagement_rate: numberValue(analytics.engagementRate),
        impressions: numberValue(analytics.impressions),
        reach: numberValue(analytics.reach),
        likes: numberValue(analytics.likes),
        comments: numberValue(analytics.comments),
        shares: numberValue(analytics.shares),
        saves: numberValue(analytics.saves),
        clicks: numberValue(analytics.clicks),
        views: numberValue(analytics.views),
      },
    };
  });
}

async function summarizeTopPosts(rows: Array<{ post_id: string; platform: string; content: string; published_at: string; analytics: JsonRecord }>, sortBy: string) {
  const fallback = {
    sort_by: sortBy,
    total_posts: rows.length,
    top_posts: rows.slice(0, 10),
    patterns: topTerms(rows.map((row) => row.content).join(" "), 10),
    recommendation: rows.length
      ? `Tomar los temas y hooks de los posts top por ${sortBy} para replicarlos en nuevos formatos.`
      : "No hubo posts suficientes para análisis.",
  };
  return summarizeStructured(
    "Eres un estratega de contenido social. Resume top performers, patrones de copy, formatos aparentes y oportunidades editoriales. Devuelve JSON con top_posts, patterns, risks y recommendations.",
    rows,
    fallback
  );
}

function fallbackChannelBrief(payload: JsonRecord) {
  const bestTimeSlots = getArray(asRecord(payload.best_time).slots).slice(0, 3);
  const frequencies = getArray(asRecord(payload.posting_frequency).frequency).slice(0, 5);
  return {
    overview: {
      platform: payload.platform,
      account_id: payload.account_id,
      top_slots: bestTimeSlots,
      cadence_rows: frequencies,
    },
    findings: [
      "Usar los mejores slots históricos como base del calendario.",
      "Cruzar cadence con engagement para no sobrepublicar.",
      "Mirar los picos de daily metrics para detectar qué días/formatos disparan respuesta.",
    ],
    risks: [],
    opportunities: [],
    action_plan: [
      "Programar las próximas piezas en los slots top.",
      "Comparar semanas de mayor engagement contra temas y formatos publicados.",
      "Revisar top performers y comments antes de definir la siguiente parrilla.",
    ],
  };
}

function fallbackTranscriptSummary(items: Array<{ title: string; url: string; transcript: string }>) {
  const corpus = items.map((item) => item.transcript).join(" ");
  return {
    total_videos: items.length,
    topics: topTerms(corpus, 15),
    repeated_questions: extractQuestions(corpus).slice(0, 10),
    hooks: items.map((item) => ({ title: item.title, intro: clip(item.transcript, 180) })).slice(0, 5),
    content_gaps: [],
    content_opportunities: [
      "Transformar las preguntas repetidas del transcript en shorts, reels o carruseles.",
      "Detectar módulos o conceptos que se repiten y convertirlos en series editoriales.",
    ],
  };
}

async function summarizeStructured(systemPrompt: string, payload: unknown, fallback: unknown) {
  const deepseekKey = await getRuntimeVariable("DEEPSEEK_API_KEY");
  if (!deepseekKey) return fallback;
  try {
    const res = await deepseekChat([
      { role: "system", content: `${systemPrompt} Responde SIEMPRE JSON válido.` },
      { role: "user", content: JSON.stringify(payload).slice(0, 120000) },
    ], { temperature: 0.2, max_tokens: 2500, json_mode: true });
    return JSON.parse(res.text);
  } catch {
    return fallback;
  }
}

async function resolvePlatformTarget(platform: "instagram" | "tiktok", accountId?: string, profileId?: string) {
  const resolvedProfileId = profileId ?? await getDefaultZernioProfileId();
  const response = await zernioGet("/accounts", {
    platform,
    profileId: resolvedProfileId,
    limit: 100,
  });
  const accounts = getArray(asRecord(response).accounts ?? asRecord(response).data ?? asRecord(response).items).map(asRecord)
    .filter((item) => stringValue(item.platform) === platform);
  if (accountId) {
    const match = accounts.find((item) => stringValue(item._id ?? item.id ?? item.accountId) === accountId);
    if (!match) throw new Error(`Account ${accountId} not found for ${platform}.`);
    return { accountId, profileId: resolvedProfileId, account: match };
  }
  if (accounts.length === 1) {
    return {
      accountId: stringValue(accounts[0]._id ?? accounts[0].id ?? accounts[0].accountId),
      profileId: resolvedProfileId,
      account: accounts[0],
    };
  }
  if (accounts.length === 0) throw new Error(`No ${platform} accounts connected in the selected profile.`);
  throw new Error(`Multiple ${platform} accounts connected. Pass account_id explicitly.`);
}

function topTerms(text: string, limit: number) {
  const counts = new Map<string, number>();
  for (const raw of text.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").split(/[^a-z0-9@#áéíóúüñ]+/i)) {
    const token = raw.trim();
    if (!token || token.length < 3 || SPANISH_STOPWORDS.has(token)) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([term, count]) => ({ term, count }));
}

function sampleRows(rows: CommentRow[], predicate: (row: CommentRow) => boolean) {
  return rows.filter(predicate).slice(0, 5).map((row) => ({
    text: row.text,
    author: row.author,
    created_at: row.created_at,
  }));
}

function extractQuestions(text: string) {
  const matches = text.match(/[^.?!]*\?/g) ?? [];
  return matches.map((item) => item.trim()).filter((item) => item.length > 12);
}

function containsAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function clip(value: string, limit: number) {
  return value.length <= limit ? value : `${value.slice(0, limit)}...`;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" ? value as JsonRecord : {};
}

function getArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

function nullableString(value: unknown) {
  const text = stringValue(value).trim();
  return text ? text : null;
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}
