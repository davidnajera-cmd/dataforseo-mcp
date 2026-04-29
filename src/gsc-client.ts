import { getRuntimeVariable } from "./runtime-config.js";

const WEBMASTERS_BASE = "https://www.googleapis.com/webmasters/v3";
const SEARCHCONSOLE_BASE = "https://searchconsole.googleapis.com/v1";
const INDEXING_BASE = "https://indexing.googleapis.com/v3";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

let cachedToken: { access_token: string; expires_at: number } | null = null;

export async function getGoogleAccessToken(): Promise<string> {
  // If we have a valid cached token (with 60s buffer), use it
  if (cachedToken && Date.now() < cachedToken.expires_at - 60_000) {
    return cachedToken.access_token;
  }

  const clientId = await getRuntimeVariable("GOOGLE_CLIENT_ID");
  const clientSecret = await getRuntimeVariable("GOOGLE_CLIENT_SECRET");
  const refreshToken = await getRuntimeVariable("GOOGLE_REFRESH_TOKEN");

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN environment variables are required"
    );
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to refresh Google access token: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };

  cachedToken = {
    access_token: data.access_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };

  return cachedToken.access_token;
}

async function headers(): Promise<Record<string, string>> {
  const token = await getGoogleAccessToken();
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

type ApiBase = "webmasters" | "searchconsole" | "indexing";

function resolveBase(base: ApiBase): string {
  switch (base) {
    case "searchconsole": return SEARCHCONSOLE_BASE;
    case "indexing":      return INDEXING_BASE;
    default:              return WEBMASTERS_BASE;
  }
}

export async function gscGet(path: string, base: ApiBase = "webmasters"): Promise<unknown> {
  const res = await fetch(`${resolveBase(base)}${path}`, { headers: await headers() });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google API error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function gscPost(path: string, body: unknown, base: ApiBase = "webmasters"): Promise<unknown> {
  const res = await fetch(`${resolveBase(base)}${path}`, {
    method: "POST",
    headers: await headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google API error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function gscPut(path: string, base: ApiBase = "webmasters"): Promise<unknown> {
  const res = await fetch(`${resolveBase(base)}${path}`, {
    method: "PUT",
    headers: await headers(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google API error ${res.status}: ${text}`);
  }
  // Some PUT endpoints return 204 No Content
  if (res.status === 204) return { success: true };
  return res.json();
}

export async function gscDelete(path: string, base: ApiBase = "webmasters"): Promise<unknown> {
  const res = await fetch(`${resolveBase(base)}${path}`, {
    method: "DELETE",
    headers: await headers(),
  });
  if (!res.ok && res.status !== 204) {
    const text = await res.text();
    throw new Error(`Google API error ${res.status}: ${text}`);
  }
  return { success: true };
}
