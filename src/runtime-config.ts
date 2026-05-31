import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { neon } from "@neondatabase/serverless";

export type RuntimeVariableSpec = {
  name: string;
  group: string;
  label: string;
  description: string;
  sensitive: boolean;
  requiredFor: string;
};

export const RUNTIME_VARIABLE_SPECS: RuntimeVariableSpec[] = [
  { name: "DATAFORSEO_LOGIN", group: "DataForSEO", label: "Login", description: "Usuario de DataForSEO API.", sensitive: true, requiredFor: "Keywords, backlinks, SERP, competencia" },
  { name: "DATAFORSEO_PASSWORD", group: "DataForSEO", label: "Password", description: "Password/API password de DataForSEO.", sensitive: true, requiredFor: "Keywords, backlinks, SERP, competencia" },
  { name: "SERPAPI_API_KEY", group: "SerpAPI", label: "API key", description: "Llave de SerpAPI para motores adicionales.", sensitive: true, requiredFor: "SERP externos" },
  { name: "SGAI_API_KEY", group: "ScrapeGraphAI", label: "API key", description: "API key de ScrapeGraphAI para smartscraper, searchscraper y markdownify.", sensitive: true, requiredFor: "scrapegraph_* tools" },
  { name: "ZERNIO_API_KEY", group: "Zernio", label: "API key", description: "API key de Zernio para perfiles, cuentas conectadas y publicación en redes sociales.", sensitive: true, requiredFor: "zernio_* social tools" },
  { name: "ZERNIO_DEFAULT_PROFILE_ID", group: "Zernio", label: "Default profile ID", description: "Profile ID por defecto para conectar cuentas o encolar publicaciones cuando no se pasa profile_id en la tool. Acepta uno o varios IDs separados por coma.", sensitive: false, requiredFor: "zernio_connect_get_url, zernio_posts_create (queue)" },
  { name: "ZERNIO_PROFILE_ID_CO", group: "Zernio", label: "Profile Colombia", description: "Profile ID de Zernio para dnamusic.edu.co. Acepta uno o varios IDs separados por coma.", sensitive: false, requiredFor: "Dashboard social Colombia" },
  { name: "ZERNIO_PROFILE_ID_MX", group: "Zernio", label: "Profile Mexico", description: "Profile ID de Zernio para dnamusic.mx. Acepta uno o varios IDs separados por coma.", sensitive: false, requiredFor: "Dashboard social Mexico" },
  { name: "ZERNIO_PROFILE_ID_LTA", group: "Zernio", label: "Profile La Tienda de Audio", description: "Profile ID de Zernio para latiendadeaudio.com. Acepta uno o varios IDs separados por coma.", sensitive: false, requiredFor: "Dashboard social La Tienda de Audio" },
  { name: "GOOGLE_CLIENT_ID", group: "Google", label: "Client ID", description: "OAuth client ID para Google APIs (GSC, GA4, Business Profile, Site Verification, GTM).", sensitive: true, requiredFor: "Google APIs OAuth" },
  { name: "GOOGLE_CLIENT_SECRET", group: "Google", label: "Client secret", description: "OAuth client secret.", sensitive: true, requiredFor: "GSC, URL Inspection, GA4" },
  { name: "GOOGLE_REFRESH_TOKEN", group: "Google", label: "Refresh token", description: "Refresh token con scopes de Google APIs (GSC, GA4, Business Profile, Site Verification, GTM segun necesidad).", sensitive: true, requiredFor: "Google APIs OAuth" },
  { name: "GA4_PROPERTY_ID", group: "GA4", label: "Property ID (default)", description: "Propiedad GA4 por defecto cuando no se pasa property_id en la tool.", sensitive: false, requiredFor: "Reportes GA4 (fallback)" },
  { name: "GA4_PROPERTY_ID_CO", group: "GA4", label: "Property CO", description: "GA4 property ID para dnamusic.edu.co (Colombia).", sensitive: false, requiredFor: "Reportes GA4 Colombia" },
  { name: "GA4_PROPERTY_ID_MX", group: "GA4", label: "Property MX", description: "GA4 property ID para dnamusic.mx (Mexico).", sensitive: false, requiredFor: "Reportes GA4 Mexico" },
  { name: "GA4_PROPERTY_ID_LTA", group: "GA4", label: "Property La Tienda de Audio", description: "GA4 property ID para latiendadeaudio.com.", sensitive: false, requiredFor: "Reportes GA4 La Tienda de Audio" },
  { name: "CLARITY_API_TOKEN", group: "Microsoft Clarity", label: "API token", description: "Token de Clarity Data Export API.", sensitive: true, requiredFor: "UX, scroll, engagement" },
  { name: "PAGESPEED_API_KEY", group: "PageSpeed", label: "API key", description: "Google PageSpeed Insights API key.", sensitive: true, requiredFor: "Core Web Vitals" },
  { name: "DNA_SITE_CO", group: "DNA Music", label: "GSC Colombia", description: "Propiedad GSC Colombia, ejemplo https://dnamusic.edu.co/ o sc-domain:dnamusic.edu.co.", sensitive: false, requiredFor: "GSC Colombia" },
  { name: "DNA_SITE_MX", group: "DNA Music", label: "GSC Mexico", description: "Propiedad GSC Mexico, ejemplo sc-domain:dnamusic.mx.", sensitive: false, requiredFor: "GSC Mexico" },
  { name: "DNA_DOMAIN_CO", group: "DNA Music", label: "Dominio Colombia", description: "Dominio para DataForSEO Colombia: dnamusic.edu.co.", sensitive: false, requiredFor: "Competencia Colombia" },
  { name: "DNA_DOMAIN_MX", group: "DNA Music", label: "Dominio Mexico", description: "Dominio para DataForSEO Mexico.", sensitive: false, requiredFor: "Competencia Mexico" },
  { name: "DNA_CANONICAL_URL", group: "DNA Music", label: "URL canonica", description: "URL principal para pruebas PageSpeed/GSC.", sensitive: false, requiredFor: "Diagnosticos" },
  { name: "DNA_INSPECTION_URL", group: "DNA Music", label: "URL inspeccion", description: "URL que pertenece a la propiedad GSC.", sensitive: false, requiredFor: "URL Inspection" },
  { name: "DNA_LOCATION_CO", group: "DNA Music", label: "Location code CO", description: "Codigo DataForSEO para Colombia.", sensitive: false, requiredFor: "Rankings locales" },
  { name: "DNA_LOCATION_MX", group: "DNA Music", label: "Location code MX", description: "Codigo DataForSEO para Mexico.", sensitive: false, requiredFor: "Rankings locales" },
  { name: "DNA_SITE_LTA", group: "La Tienda de Audio", label: "GSC LTA", description: "Propiedad GSC La Tienda de Audio, ej. sc-domain:latiendadeaudio.com.", sensitive: false, requiredFor: "GSC La Tienda de Audio" },
  { name: "DNA_DOMAIN_LTA", group: "La Tienda de Audio", label: "Dominio LTA", description: "Dominio para DataForSEO La Tienda de Audio.", sensitive: false, requiredFor: "Competencia La Tienda de Audio" },
  { name: "DNA_LOCATION_LTA", group: "La Tienda de Audio", label: "Location code LTA", description: "Codigo DataForSEO de mercado principal de La Tienda de Audio.", sensitive: false, requiredFor: "Rankings locales LTA" },
  { name: "AHREFS_API_TOKEN", group: "Premium", label: "Ahrefs token", description: "Token API v3 de Ahrefs.", sensitive: true, requiredFor: "Backlinks premium, Brand Radar" },
  { name: "SEMRUSH_API_KEY", group: "Premium", label: "Semrush API key", description: "API key de Semrush.", sensitive: true, requiredFor: "SEO API, Trends, competencia" },
  { name: "BING_WEBMASTER_API_KEY", group: "Bing Webmaster", label: "API key", description: "API key de Bing Webmaster Tools (settings -> API access).", sensitive: true, requiredFor: "Search analytics y crawl stats de Bing" },
  { name: "CRON_SECRET", group: "Cron", label: "Cron secret", description: "Secreto compartido para validar requests del Vercel Cron al endpoint de snapshots.", sensitive: true, requiredFor: "Pipeline de persistencia historica" },
  { name: "DEEPSEEK_API_KEY", group: "SEO Agent", label: "DeepSeek API key", description: "API key de DeepSeek para tareas masivas (clasificacion, cluster, anchors).", sensitive: true, requiredFor: "SEO Agent (clasificacion)" },
  { name: "ANTHROPIC_API_KEY", group: "SEO Agent", label: "Anthropic API key", description: "API key de Anthropic para Claude Opus (estratega, prioriza tareas).", sensitive: true, requiredFor: "SEO Agent (estrategia)" },
  { name: "AGENT_MAX_TASKS_PER_RUN", group: "SEO Agent", label: "Max tareas Opus por run", description: "Tope de tareas que Opus propone por ejecucion. Default 10.", sensitive: false, requiredFor: "SEO Agent" },
  { name: "AGENT_MAX_NEW_INSERTS_PER_RUN", group: "SEO Agent", label: "Max NUEVAS por run", description: "Tope de tareas NUEVAS por ejecucion (anti-bloat). Updates a tareas existentes no cuentan. Default 12.", sensitive: false, requiredFor: "SEO Agent (anti-bloat)" },
  { name: "SLACK_BOT_TOKEN", group: "Slack Sync", label: "Bot token (xoxb-)", description: "Slack bot token para crear/leer items en la lista 'Sprint de Marketing'.", sensitive: true, requiredFor: "Slack sync" },
  { name: "SLACK_USER_TOKEN", group: "Slack Sync", label: "User token (xoxp-)", description: "Slack user token para metodos slackLists.* (algunos requieren user scope).", sensitive: true, requiredFor: "Slack sync" },
  { name: "SLACK_LIST_ID", group: "Slack Sync", label: "List ID", description: "ID de la lista de Slack (formato Fxxxx). Default F0A0U27CYSX (Sprint de Marketing).", sensitive: false, requiredFor: "Slack sync" },
  { name: "SLACK_BACKLOG_OPTION_ID", group: "Slack Sync", label: "Backlog group option ID", description: "ID de la opcion 'Backlog SEO Agent' del campo Estado Sprint. Default OptL5NJTUJB.", sensitive: false, requiredFor: "Slack sync" },
  { name: "DASHBOARD_URL", group: "Dashboard", label: "Dashboard URL base", description: "URL base del dashboard SEO (sin trailing slash). Usada para incluir deep-links a tareas en items de Slack. Ej: https://dataforseo-mcp-three.vercel.app", sensitive: false, requiredFor: "Slack deep-links al backlog" },
  { name: "REPO_GITHUB_OWNER", group: "Repo Snapshot", label: "GitHub owner", description: "Owner del repo Next.js (ej: dnamusic2026). Necesario para grounding del agente.", sensitive: false, requiredFor: "Slug validation + grounding del agente" },
  { name: "REPO_GITHUB_NAME", group: "Repo Snapshot", label: "GitHub repo name", description: "Nombre del repo Next.js (ej: frontend_web_page).", sensitive: false, requiredFor: "Slug validation + grounding del agente" },
  { name: "REPO_GITHUB_BRANCH", group: "Repo Snapshot", label: "Branch", description: "Branch a leer (default: main).", sensitive: false, requiredFor: "Slug validation + grounding del agente" },
  { name: "REPO_GITHUB_TOKEN", group: "Repo Snapshot", label: "GitHub PAT (read-only)", description: "PAT con scope Contents:Read para el repo del sitio. Fine-grained recomendado, scope minimo.", sensitive: true, requiredFor: "Slug validation + grounding del agente" },
  { name: "APIFY_API_TOKEN", group: "Apify", label: "Apify API token", description: "Personal API token de Apify (https://console.apify.com/account/integrations). Habilita las tools adlib_* (Meta/Google/TikTok ads library) y apify_run_actor. Pay-per-result — controlar uso desde tu dashboard de Apify.", sensitive: true, requiredFor: "Ads Library scraping (Meta/Google/TikTok) y otros actors" },
  { name: "APIFY_ACTOR_META_ADLIB", group: "Apify", label: "Meta ad library actor ID", description: "Actor ID de Apify para Meta Ad Library (ej. 'curious_coder/facebook-ads-library-scraper'). Si esta vacio, se usa un default razonable. Cambialo si encontras un actor mejor en apify.com/store.", sensitive: false, requiredFor: "adlib_meta_search" },
  { name: "APIFY_ACTOR_GOOGLE_ADLIB", group: "Apify", label: "Google ad library actor ID", description: "Actor ID de Apify para Google Ads Transparency Center scraping. Default: 'apify/google-ads-transparency-center-scraper'.", sensitive: false, requiredFor: "adlib_google_search" },
  { name: "APIFY_ACTOR_TIKTOK_ADLIB", group: "Apify", label: "TikTok ad library actor ID", description: "Actor ID de Apify para TikTok Commercial Content Library. Default: 'apify/tiktok-commercial-content-api-scraper'.", sensitive: false, requiredFor: "adlib_tiktok_search" },
  { name: "APIFY_ACTOR_GOOGLE_MAPS", group: "Apify", label: "Google Maps actor ID", description: "Actor ID para local SEO competitive scan. Default: 'compass/crawler-google-places' (398K usuarios, 4.7).", sensitive: false, requiredFor: "local_google_maps_scraper" },
  { name: "APIFY_ACTOR_WEB_CRAWLER", group: "Apify", label: "Website crawler actor ID", description: "Actor ID para crawl de contenido (Wayback recovery, audits competitivos). Default: 'apify/website-content-crawler' (124K usuarios, 4.6).", sensitive: false, requiredFor: "web_content_crawler" },
  { name: "APIFY_ACTOR_INSTAGRAM", group: "Apify", label: "Instagram actor ID", description: "Actor ID para Instagram (perfiles/posts/hashtags). Default: 'apify/instagram-scraper' (256K usuarios, 4.7).", sensitive: false, requiredFor: "social_instagram_scraper" },
  { name: "APIFY_ACTOR_YOUTUBE", group: "Apify", label: "YouTube actor ID", description: "Actor ID para YouTube. Default: 'happitap/youtube-transcript-scraper' (transcripciones — preferido sobre channel scrapers porque el texto es lo util para SEO/LLM analysis).", sensitive: false, requiredFor: "social_youtube_transcript" },
  { name: "APIFY_ACTOR_REDDIT", group: "Apify", label: "Reddit actor ID", description: "Actor ID para Reddit (search/subreddit/posts/comments). Default: 'trudax/reddit-scraper-lite'. Senal secundaria para Colombia (uso bajo en LATAM).", sensitive: false, requiredFor: "market_reddit_intelligence" },
  { name: "APIFY_ACTOR_NEWS", group: "Apify", label: "Google News actor ID", description: "Actor ID para Google News. Default: 'data_xplorer/google-news-scraper-fast'. Defaults Colombia-first (country=co, language=es).", sensitive: false, requiredFor: "market_news_monitor" },
  { name: "APIFY_ACTOR_TIKTOK_CONTENT", group: "Apify", label: "TikTok content actor ID", description: "Actor ID para TikTok organico (videos/perfiles/hashtags, NO ads). Default: 'clockworks/tiktok-scraper' (174K usuarios, 4.7). Senal PRIMARIA para customer voice Colombia gen Z.", sensitive: false, requiredFor: "social_tiktok_content" },
  { name: "APIFY_ACTOR_TIKTOK_COMMENTS", group: "Apify", label: "TikTok comments actor ID", description: "Actor ID para comentarios de videos TikTok especificos. Default: 'apidojo/tiktok-comments-scraper' ($0.30/1000 comentarios). PRIMARIO para voz del cliente joven en Colombia.", sensitive: false, requiredFor: "social_tiktok_comments" },
];

type RuntimeVariableRow = {
  name: string;
  value_encrypted: string;
  sensitive: boolean;
  updated_at: string;
};

let client: ReturnType<typeof neon> | null = null;
let initialized = false;
const VALUE_CACHE_TTL_MS = 30_000;
type CachedValue = { value: string | undefined; expiresAt: number };
const valueCache = new Map<string, CachedValue>();

function getSql() {
  if (!process.env.DATABASE_URL) return null;
  if (!client) client = neon(process.env.DATABASE_URL);
  return client;
}

export async function getRuntimeVariable(name: string): Promise<string | undefined> {
  const cached = valueCache.get(name);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const sql = getSql();
  if (sql) {
    await ensureRuntimeVariableSchema();
    const rows = await sql`
      select name, value_encrypted, sensitive, updated_at
      from seo_runtime_variables
      where name = ${name}
      limit 1
    ` as RuntimeVariableRow[];
    const row = rows[0];
    if (row) {
      const value = normalizeRuntimeValue(decryptValue(row.value_encrypted));
      valueCache.set(name, { value, expiresAt: Date.now() + VALUE_CACHE_TTL_MS });
      return value;
    }
  }

  const value = normalizeRuntimeValue(process.env[name]);
  valueCache.set(name, { value, expiresAt: Date.now() + VALUE_CACHE_TTL_MS });
  return value;
}

export function clearRuntimeVariableCache() {
  valueCache.clear();
}

export async function listRuntimeVariables() {
  const sql = getSql();
  const rows = sql ? await getRuntimeRows() : [];
  const rowMap = new Map(rows.map((row) => [row.name, row]));

  return RUNTIME_VARIABLE_SPECS.map((spec) => {
    const row = rowMap.get(spec.name);
    const envValue = normalizeRuntimeValue(process.env[spec.name]);
    return {
      ...spec,
      configured: Boolean(row || envValue),
      source: row ? "database" : envValue ? "vercel" : "missing",
      updatedAt: row?.updated_at ?? null,
      preview: row ? maskValue(normalizeRuntimeValue(decryptValue(row.value_encrypted)), spec.sensitive) : envValue ? maskValue(envValue, spec.sensitive) : "",
    };
  });
}

export async function setRuntimeVariable(name: string, value: string): Promise<void> {
  const spec = RUNTIME_VARIABLE_SPECS.find((item) => item.name === name);
  if (!spec) throw new Error(`Unsupported runtime variable: ${name}`);

  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL is required to store runtime variables");
  await ensureRuntimeVariableSchema();
  await sql`
    insert into seo_runtime_variables (name, value_encrypted, sensitive, updated_at)
    values (${name}, ${encryptValue(value)}, ${spec.sensitive}, now())
    on conflict (name)
    do update set value_encrypted = excluded.value_encrypted,
      sensitive = excluded.sensitive,
      updated_at = now()
  `;
  valueCache.delete(name);
}

export async function deleteRuntimeVariable(name: string): Promise<void> {
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL is required to delete runtime variables");
  await ensureRuntimeVariableSchema();
  await sql`delete from seo_runtime_variables where name = ${name}`;
  valueCache.delete(name);
}

export function assertVariablesAdminToken(value: string | undefined) {
  const expected = process.env.SEO_VARIABLES_ADMIN_TOKEN;
  if (!expected) throw new Error("SEO_VARIABLES_ADMIN_TOKEN is not configured");
  if (!value) throw new Error("Missing x-admin-token header");

  const expectedBuffer = Buffer.from(expected);
  const valueBuffer = Buffer.from(value);
  if (expectedBuffer.length !== valueBuffer.length || !timingSafeEqual(expectedBuffer, valueBuffer)) {
    throw new Error("Invalid admin token");
  }
}

async function getRuntimeRows(): Promise<RuntimeVariableRow[]> {
  const sql = getSql();
  if (!sql) return [];
  await ensureRuntimeVariableSchema();
  return await sql`
    select name, value_encrypted, sensitive, updated_at
    from seo_runtime_variables
    order by name asc
  ` as RuntimeVariableRow[];
}

async function ensureRuntimeVariableSchema() {
  const sql = getSql();
  if (!sql || initialized) return;
  await sql`
    create table if not exists seo_runtime_variables (
      name text primary key,
      value_encrypted text not null,
      sensitive boolean not null default true,
      updated_at timestamptz not null default now()
    )
  `;
  initialized = true;
}

function encryptValue(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

function decryptValue(payload: string): string {
  if (!payload.startsWith("enc:v1:")) return payload;
  const [, , ivRaw, tagRaw, encryptedRaw] = payload.split(":");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivRaw, "base64"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function encryptionKey() {
  const secret = process.env.SEO_VARIABLES_ENCRYPTION_KEY ?? process.env.DATABASE_URL ?? "local-dev-key";
  return createHash("sha256").update(secret).digest();
}

function maskValue(value: string | undefined, sensitive: boolean) {
  if (!value) return "";
  if (!sensitive) return value;
  if (value.length <= 8) return "********";
  return `${value.slice(0, 3)}...${value.slice(-3)}`;
}

function normalizeRuntimeValue(value: string | undefined) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized ? normalized : undefined;
}
