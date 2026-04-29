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
  { name: "GOOGLE_CLIENT_ID", group: "Google", label: "Client ID", description: "OAuth client ID con scopes Search Console y GA4.", sensitive: true, requiredFor: "GSC, URL Inspection, GA4" },
  { name: "GOOGLE_CLIENT_SECRET", group: "Google", label: "Client secret", description: "OAuth client secret.", sensitive: true, requiredFor: "GSC, URL Inspection, GA4" },
  { name: "GOOGLE_REFRESH_TOKEN", group: "Google", label: "Refresh token", description: "Refresh token con webmasters y analytics.readonly.", sensitive: true, requiredFor: "GSC, URL Inspection, GA4" },
  { name: "GA4_PROPERTY_ID", group: "GA4", label: "Property ID", description: "ID numerico de la propiedad GA4.", sensitive: false, requiredFor: "Reportes GA4" },
  { name: "CLARITY_API_TOKEN", group: "Microsoft Clarity", label: "API token", description: "Token de Clarity Data Export API.", sensitive: true, requiredFor: "UX, scroll, engagement" },
  { name: "PAGESPEED_API_KEY", group: "PageSpeed", label: "API key", description: "Google PageSpeed Insights API key.", sensitive: true, requiredFor: "Core Web Vitals" },
  { name: "DNA_SITE_CO", group: "DNA Music", label: "GSC Colombia", description: "Propiedad GSC Colombia, ejemplo sc-domain:dnamusic.edu.co.", sensitive: false, requiredFor: "GSC Colombia" },
  { name: "DNA_SITE_MX", group: "DNA Music", label: "GSC Mexico", description: "Propiedad GSC Mexico, ejemplo sc-domain:dnamusic.mx.", sensitive: false, requiredFor: "GSC Mexico" },
  { name: "DNA_DOMAIN_CO", group: "DNA Music", label: "Dominio Colombia", description: "Dominio para DataForSEO Colombia: dnamusic.edu.co.", sensitive: false, requiredFor: "Competencia Colombia" },
  { name: "DNA_DOMAIN_MX", group: "DNA Music", label: "Dominio Mexico", description: "Dominio para DataForSEO Mexico.", sensitive: false, requiredFor: "Competencia Mexico" },
  { name: "DNA_CANONICAL_URL", group: "DNA Music", label: "URL canonica", description: "URL principal para pruebas PageSpeed/GSC.", sensitive: false, requiredFor: "Diagnosticos" },
  { name: "DNA_INSPECTION_URL", group: "DNA Music", label: "URL inspeccion", description: "URL que pertenece a la propiedad GSC.", sensitive: false, requiredFor: "URL Inspection" },
  { name: "DNA_LOCATION_CO", group: "DNA Music", label: "Location code CO", description: "Codigo DataForSEO para Colombia.", sensitive: false, requiredFor: "Rankings locales" },
  { name: "DNA_LOCATION_MX", group: "DNA Music", label: "Location code MX", description: "Codigo DataForSEO para Mexico.", sensitive: false, requiredFor: "Rankings locales" },
  { name: "AHREFS_API_TOKEN", group: "Premium", label: "Ahrefs token", description: "Token API v3 de Ahrefs.", sensitive: true, requiredFor: "Backlinks premium, Brand Radar" },
  { name: "SEMRUSH_API_KEY", group: "Premium", label: "Semrush API key", description: "API key de Semrush.", sensitive: true, requiredFor: "SEO API, Trends, competencia" },
];

type RuntimeVariableRow = {
  name: string;
  value_encrypted: string;
  sensitive: boolean;
  updated_at: string;
};

let client: ReturnType<typeof neon> | null = null;
let initialized = false;
const valueCache = new Map<string, string | undefined>();

function getSql() {
  if (!process.env.DATABASE_URL) return null;
  if (!client) client = neon(process.env.DATABASE_URL);
  return client;
}

export async function getRuntimeVariable(name: string): Promise<string | undefined> {
  if (valueCache.has(name)) return valueCache.get(name);

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
      const value = decryptValue(row.value_encrypted);
      valueCache.set(name, value);
      return value;
    }
  }

  const value = process.env[name];
  valueCache.set(name, value);
  return value;
}

export async function listRuntimeVariables() {
  const sql = getSql();
  const rows = sql ? await getRuntimeRows() : [];
  const rowMap = new Map(rows.map((row) => [row.name, row]));

  return RUNTIME_VARIABLE_SPECS.map((spec) => {
    const row = rowMap.get(spec.name);
    const envValue = process.env[spec.name];
    return {
      ...spec,
      configured: Boolean(row || envValue),
      source: row ? "database" : envValue ? "vercel" : "missing",
      updatedAt: row?.updated_at ?? null,
      preview: row ? maskValue(decryptValue(row.value_encrypted), spec.sensitive) : envValue ? maskValue(envValue, spec.sensitive) : "",
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
