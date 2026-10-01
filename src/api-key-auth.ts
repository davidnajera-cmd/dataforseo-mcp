// API key authentication for the public-facing MCP endpoint.
//
// We never store raw keys — only sha256 hashes. Lookup is by hash so a leaked
// hash doesn't give the attacker a usable key. Keys are short-lived only by
// admin revocation; no time-based expiry yet.
//
// Header expected: x-api-key: dnamcp_<32-char-token>

import { createHash, randomBytes } from "node:crypto";
import { neon } from "@neondatabase/serverless";

let client: ReturnType<typeof neon> | null = null;
let initialized = false;
export const MCP_API_KEY_REQUESTS_PER_MINUTE = 60;

function getSql() {
  if (!process.env.DATABASE_URL) return null;
  if (!client) client = neon(process.env.DATABASE_URL);
  return client;
}

export const API_KEY_PREFIX = "dnamcp_";

export type ApiKeyRow = {
  id: number;
  name: string;
  key_hash: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  request_count: number;
  allow_mutations: boolean;
  capability_scopes: string[] | null;
  domain_scope: string[] | null;
};

export type McpCredential = {
  id: number;
  name: string;
  bundle_scope: string[] | null;
  allow_mutations: boolean;
  capability_scopes: string[] | null;
  domain_scope: string[] | null;
};

export async function ensureApiKeySchema(): Promise<void> {
  const sql = getSql();
  if (!sql || initialized) return;
  await sql`
    create table if not exists seo_api_keys (
      id bigserial primary key,
      name text not null,
      key_hash text unique not null,
      created_at timestamptz not null default now(),
      last_used_at timestamptz,
      revoked_at timestamptz,
      request_count bigint not null default 0,
      bundle_scope text[],
      allow_mutations boolean not null default false,
      capability_scopes text[],
      domain_scope text[]
    )
  `;
  await sql`alter table seo_api_keys add column if not exists allow_mutations boolean not null default false`;
  await sql`alter table seo_api_keys add column if not exists capability_scopes text[]`;
  await sql`alter table seo_api_keys add column if not exists domain_scope text[]`;
  await sql`create index if not exists seo_api_keys_active on seo_api_keys (revoked_at) where revoked_at is null`;
  await sql`
    create table if not exists seo_api_key_rate_limits (
      api_key_id bigint primary key references seo_api_keys(id) on delete cascade,
      window_started_at timestamptz not null default now(),
      request_count integer not null default 0
    )
  `;
  await sql`create table if not exists mcp_oauth_clients (client_id text primary key, redirect_uris text[] not null, created_at timestamptz not null default now())`;
  await sql`create table if not exists mcp_oauth_codes (code_hash text primary key, client_id text not null references mcp_oauth_clients(client_id) on delete cascade, redirect_uri text not null, api_key_id bigint not null references seo_api_keys(id) on delete cascade, code_challenge text not null, expires_at timestamptz not null, used_at timestamptz)`;
  await sql`create table if not exists mcp_oauth_tokens (token_hash text primary key, api_key_id bigint not null references seo_api_keys(id) on delete cascade, expires_at timestamptz not null, revoked_at timestamptz, created_at timestamptz not null default now())`;
  await sql`create index if not exists mcp_oauth_tokens_active on mcp_oauth_tokens (api_key_id, expires_at) where revoked_at is null`;
  await sql`create table if not exists mcp_oauth_refresh_tokens (token_hash text primary key, api_key_id bigint not null references seo_api_keys(id) on delete cascade, client_id text not null references mcp_oauth_clients(client_id) on delete cascade, expires_at timestamptz not null, revoked_at timestamptz, used_at timestamptz, created_at timestamptz not null default now())`;
  await sql`create index if not exists mcp_oauth_refresh_tokens_active on mcp_oauth_refresh_tokens (api_key_id, client_id, expires_at) where revoked_at is null and used_at is null`;
  initialized = true;
}

function hashKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

// Generates a fresh API key, persists it, and returns the RAW key (only time
// it is ever exposed). Caller must save it; we only keep the hash.
export async function createApiKey(name: string, bundleScope?: string[], allowMutations: boolean = false, capabilityScopes?: string[], domainScope?: string[]): Promise<{ id: number; key: string; name: string }> {
  await ensureApiKeySchema();
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL not configured");
  // 24 random bytes → ~32 base64url chars → enough entropy.
  const rawSuffix = randomBytes(24).toString("base64url");
  const rawKey = `${API_KEY_PREFIX}${rawSuffix}`;
  const hash = hashKey(rawKey);
  const rows = await sql`
    insert into seo_api_keys (name, key_hash, bundle_scope, allow_mutations, capability_scopes, domain_scope)
    values (${name}, ${hash}, ${bundleScope && bundleScope.length > 0 ? bundleScope : null}, ${allowMutations}, ${capabilityScopes && capabilityScopes.length > 0 ? capabilityScopes : null}, ${domainScope && domainScope.length > 0 ? domainScope : null})
    returning id
  ` as Array<{ id: number }>;
  return { id: rows[0].id, key: rawKey, name };
}

export async function listApiKeys(includeRevoked: boolean = false): Promise<ApiKeyRow[]> {
  await ensureApiKeySchema();
  const sql = getSql();
  if (!sql) return [];
  return await sql`
    select id, name, key_hash, created_at::text, last_used_at::text, revoked_at::text, request_count, allow_mutations, capability_scopes, domain_scope
    from seo_api_keys
    ${includeRevoked ? sql`` : sql`where revoked_at is null`}
    order by created_at desc
  ` as ApiKeyRow[];
}

export async function revokeApiKey(id: number): Promise<boolean> {
  await ensureApiKeySchema();
  const sql = getSql();
  if (!sql) return false;
  const rows = await sql`
    update seo_api_keys set revoked_at = now() where id = ${id} and revoked_at is null
    returning id
  ` as Array<{ id: number }>;
  return rows.length > 0;
}

// Returns { valid: true, name, bundle_scope } if the key is active.
// Returns { valid: false, reason } otherwise.
// Side effect: increments request_count and updates last_used_at on success.
export async function validateApiKey(rawKey: string | undefined): Promise<{ valid: true; id: number; name: string; bundle_scope: string[] | null; allow_mutations: boolean; capability_scopes: string[] | null; domain_scope: string[] | null } | { valid: false; reason: string }> {
  if (!rawKey || !rawKey.startsWith(API_KEY_PREFIX)) {
    return { valid: false, reason: "missing_or_malformed_api_key" };
  }
  await ensureApiKeySchema();
  const sql = getSql();
  if (!sql) return { valid: false, reason: "database_not_configured" };
  const hash = hashKey(rawKey);
  const rows = await sql`
    select id, name, revoked_at, bundle_scope, allow_mutations, capability_scopes, domain_scope
    from seo_api_keys
    where key_hash = ${hash}
    limit 1
  ` as Array<{ id: number; name: string; revoked_at: string | null; bundle_scope: string[] | null; allow_mutations: boolean; capability_scopes: string[] | null; domain_scope: string[] | null }>;
  if (rows.length === 0) return { valid: false, reason: "unknown_key" };
  const row = rows[0];
  if (row.revoked_at) return { valid: false, reason: "key_revoked" };
  // Fire-and-forget update; don't block the request.
  sql`update seo_api_keys set last_used_at = now(), request_count = request_count + 1 where id = ${row.id}`.catch(() => {});
  return { valid: true, id: row.id, name: row.name, bundle_scope: row.bundle_scope, allow_mutations: row.allow_mutations, capability_scopes: row.capability_scopes, domain_scope: row.domain_scope };
}

export async function registerOAuthClient(redirectUris: string[]): Promise<string> {
  await ensureApiKeySchema();
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL not configured");
  const clientId = `mcp_client_${randomBytes(18).toString("base64url")}`;
  await sql`insert into mcp_oauth_clients (client_id, redirect_uris) values (${clientId}, ${redirectUris})`;
  return clientId;
}

export async function isOAuthClientRedirectAllowed(clientId: string, redirectUri: string): Promise<boolean> {
  await ensureApiKeySchema();
  const sql = getSql();
  if (!sql) return false;
  const rows = await sql`select 1 from mcp_oauth_clients where client_id = ${clientId} and ${redirectUri} = any(redirect_uris) limit 1` as Array<{ "?column?": number }>;
  return rows.length === 1;
}

export async function createOAuthAuthorizationCode(input: { clientId: string; redirectUri: string; apiKeyId: number; codeChallenge: string }): Promise<string> {
  await ensureApiKeySchema();
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL not configured");
  const code = `mcpoc_${randomBytes(24).toString("base64url")}`;
  await sql`insert into mcp_oauth_codes (code_hash, client_id, redirect_uri, api_key_id, code_challenge, expires_at) values (${hashKey(code)}, ${input.clientId}, ${input.redirectUri}, ${input.apiKeyId}, ${input.codeChallenge}, now() + interval '5 minutes')`;
  return code;
}

export async function exchangeOAuthAuthorizationCode(input: { code: string; clientId: string; redirectUri: string; codeVerifier: string }): Promise<{ accessToken: string; refreshToken: string; credential: McpCredential } | null> {
  await ensureApiKeySchema();
  const sql = getSql();
  if (!sql) return null;
  const rows = await sql`
    select c.api_key_id, c.code_challenge, k.id, k.name, k.bundle_scope, k.allow_mutations, k.capability_scopes, k.domain_scope
    from mcp_oauth_codes c join seo_api_keys k on k.id = c.api_key_id
    where c.code_hash = ${hashKey(input.code)} and c.client_id = ${input.clientId} and c.redirect_uri = ${input.redirectUri}
      and c.used_at is null and c.expires_at > now() and k.revoked_at is null limit 1
  ` as Array<{ api_key_id: number; code_challenge: string } & McpCredential>;
  const row = rows[0];
  if (!row || pkceChallenge(input.codeVerifier) !== row.code_challenge) return null;
  const consumed = await sql`update mcp_oauth_codes set used_at = now() where code_hash = ${hashKey(input.code)} and used_at is null returning api_key_id` as Array<{ api_key_id: number }>;
  if (consumed.length !== 1) return null;
  const tokens = await issueOAuthTokenPair(row.api_key_id, input.clientId);
  return { ...tokens, credential: row };
}

export async function refreshOAuthAccessToken(input: { refreshToken: string; clientId: string }): Promise<{ accessToken: string; refreshToken: string } | null> {
  if (!input.refreshToken.startsWith("mcprt_")) return null;
  await ensureApiKeySchema();
  const sql = getSql();
  if (!sql) return null;
  // Rotate refresh tokens atomically. Replaying a consumed token cannot mint
  // another session, even if two requests arrive concurrently.
  const consumed = await sql`
    update mcp_oauth_refresh_tokens t
    set used_at = now(), revoked_at = now()
    from seo_api_keys k
    where t.token_hash = ${hashKey(input.refreshToken)} and t.client_id = ${input.clientId}
      and t.api_key_id = k.id and t.used_at is null and t.revoked_at is null
      and t.expires_at > now() and k.revoked_at is null
    returning t.api_key_id
  ` as Array<{ api_key_id: number }>;
  const apiKeyId = consumed[0]?.api_key_id;
  return apiKeyId ? issueOAuthTokenPair(apiKeyId, input.clientId) : null;
}

async function issueOAuthTokenPair(apiKeyId: number, clientId: string): Promise<{ accessToken: string; refreshToken: string }> {
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL not configured");
  const accessToken = `mcpot_${randomBytes(32).toString("base64url")}`;
  const refreshToken = `mcprt_${randomBytes(32).toString("base64url")}`;
  await sql`insert into mcp_oauth_tokens (token_hash, api_key_id, expires_at) values (${hashKey(accessToken)}, ${apiKeyId}, now() + interval '8 hours')`;
  await sql`insert into mcp_oauth_refresh_tokens (token_hash, api_key_id, client_id, expires_at) values (${hashKey(refreshToken)}, ${apiKeyId}, ${clientId}, now() + interval '30 days')`;
  return { accessToken, refreshToken };
}

export async function validateMcpAccessToken(rawToken: string | undefined): Promise<({ valid: true } & McpCredential) | { valid: false; reason: string }> {
  if (!rawToken || !rawToken.startsWith("mcpot_")) return { valid: false, reason: "missing_or_malformed_access_token" };
  await ensureApiKeySchema();
  const sql = getSql();
  if (!sql) return { valid: false, reason: "database_not_configured" };
  const rows = await sql`
    select k.id, k.name, k.bundle_scope, k.allow_mutations, k.capability_scopes, k.domain_scope
    from mcp_oauth_tokens t join seo_api_keys k on k.id = t.api_key_id
    where t.token_hash = ${hashKey(rawToken)} and t.revoked_at is null and t.expires_at > now() and k.revoked_at is null limit 1
  ` as McpCredential[];
  return rows[0] ? { valid: true, ...rows[0] } : { valid: false, reason: "unknown_or_expired_access_token" };
}

export async function consumeMcpApiKeyQuota(rawKey: string): Promise<{ allowed: boolean; requestCount: number }> {
  await ensureApiKeySchema();
  const sql = getSql();
  if (!sql) return { allowed: false, requestCount: 0 };

  const keyHash = hashKey(rawKey);
  const rows = await sql`
    insert into seo_api_key_rate_limits (api_key_id, window_started_at, request_count)
    select id, now(), 1
    from seo_api_keys
    where key_hash = ${keyHash} and revoked_at is null
    on conflict (api_key_id) do update set
      window_started_at = case
        when seo_api_key_rate_limits.window_started_at <= now() - interval '1 minute' then now()
        else seo_api_key_rate_limits.window_started_at
      end,
      request_count = case
        when seo_api_key_rate_limits.window_started_at <= now() - interval '1 minute' then 1
        else seo_api_key_rate_limits.request_count + 1
      end
    returning request_count
  ` as Array<{ request_count: number }>;

  const requestCount = rows[0]?.request_count ?? 0;
  return { allowed: requestCount > 0 && requestCount <= MCP_API_KEY_REQUESTS_PER_MINUTE, requestCount };
}
