import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

export const DASHBOARD_SESSION_COOKIE = "__Host-growth_dashboard";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function sign(secret: string, expiresAt: number): string {
  return createHmac("sha256", secret).update(`growth-dashboard:${expiresAt}`).digest("base64url");
}

export function createDashboardSession(secret: string, now = Date.now(), ttlMs = SESSION_TTL_MS): string {
  const expiresAt = now + ttlMs;
  return `${expiresAt}.${sign(secret, expiresAt)}`;
}

export function verifyDashboardSession(secret: string | undefined, value: string | undefined, now = Date.now()): boolean {
  if (!secret || !value) return false;
  const [expiresRaw, signature] = value.split(".");
  const expiresAt = Number(expiresRaw);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now || !signature) return false;
  const expected = sign(secret, expiresAt);
  const actual = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
}

function cookieValue(cookie: string | string[] | undefined, name: string): string | undefined {
  const raw = Array.isArray(cookie) ? cookie[0] : cookie;
  if (!raw) return undefined;
  return raw.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

export function assertDashboardSession(req: IncomingMessage & { headers: Record<string, string | string[] | undefined> }): void {
  const value = cookieValue(req.headers.cookie, DASHBOARD_SESSION_COOKIE);
  if (!verifyDashboardSession(process.env.DASHBOARD_SESSION_SECRET, value)) {
    throw new Error("dashboard_session_required");
  }
}

export function assertDashboardAccessToken(value: string | undefined): void {
  const expected = process.env.DASHBOARD_ACCESS_TOKEN;
  if (!expected || !value) throw new Error("dashboard_access_denied");
  const expectedBuffer = Buffer.from(expected);
  const valueBuffer = Buffer.from(value);
  if (expectedBuffer.length !== valueBuffer.length || !timingSafeEqual(expectedBuffer, valueBuffer)) {
    throw new Error("dashboard_access_denied");
  }
}

export function dashboardSessionCookie(value: string): string {
  return `${DASHBOARD_SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL_MS / 1000}`;
}
