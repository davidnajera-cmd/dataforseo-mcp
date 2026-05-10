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
      bundle_scope text[]
    )
  `;
  await sql`create index if not exists seo_api_keys_active on seo_api_keys (revoked_at) where revoked_at is null`;
  initialized = true;
}

function hashKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

// Generates a fresh API key, persists it, and returns the RAW key (only time
// it is ever exposed). Caller must save it; we only keep the hash.
export async function createApiKey(name: string, bundleScope?: string[]): Promise<{ id: number; key: string; name: string }> {
  await ensureApiKeySchema();
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL not configured");
  // 24 random bytes → ~32 base64url chars → enough entropy.
  const rawSuffix = randomBytes(24).toString("base64url");
  const rawKey = `${API_KEY_PREFIX}${rawSuffix}`;
  const hash = hashKey(rawKey);
  const rows = await sql`
    insert into seo_api_keys (name, key_hash, bundle_scope)
    values (${name}, ${hash}, ${bundleScope && bundleScope.length > 0 ? bundleScope : null})
    returning id
  ` as Array<{ id: number }>;
  return { id: rows[0].id, key: rawKey, name };
}

export async function listApiKeys(includeRevoked: boolean = false): Promise<ApiKeyRow[]> {
  await ensureApiKeySchema();
  const sql = getSql();
  if (!sql) return [];
  return await sql`
    select id, name, key_hash, created_at::text, last_used_at::text, revoked_at::text, request_count
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
export async function validateApiKey(rawKey: string | undefined): Promise<{ valid: true; name: string; bundle_scope: string[] | null } | { valid: false; reason: string }> {
  if (!rawKey || !rawKey.startsWith(API_KEY_PREFIX)) {
    return { valid: false, reason: "missing_or_malformed_api_key" };
  }
  await ensureApiKeySchema();
  const sql = getSql();
  if (!sql) return { valid: false, reason: "database_not_configured" };
  const hash = hashKey(rawKey);
  const rows = await sql`
    select id, name, revoked_at, bundle_scope
    from seo_api_keys
    where key_hash = ${hash}
    limit 1
  ` as Array<{ id: number; name: string; revoked_at: string | null; bundle_scope: string[] | null }>;
  if (rows.length === 0) return { valid: false, reason: "unknown_key" };
  const row = rows[0];
  if (row.revoked_at) return { valid: false, reason: "key_revoked" };
  // Fire-and-forget update; don't block the request.
  sql`update seo_api_keys set last_used_at = now(), request_count = request_count + 1 where id = ${row.id}`.catch(() => {});
  return { valid: true, name: row.name, bundle_scope: row.bundle_scope };
}
