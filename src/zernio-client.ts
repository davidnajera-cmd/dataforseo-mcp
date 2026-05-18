import { getRuntimeVariable } from "./runtime-config.js";

const ZERNIO_BASE = "https://zernio.com/api/v1";

async function getApiKey(): Promise<string> {
  const apiKey = await getRuntimeVariable("ZERNIO_API_KEY");
  if (!apiKey) {
    throw new Error("ZERNIO_API_KEY not configured. Add it in the Variables panel before using zernio_* tools.");
  }
  return apiKey;
}

async function headers(): Promise<Record<string, string>> {
  return {
    Authorization: `Bearer ${await getApiKey()}`,
    "Content-Type": "application/json",
  };
}

function withQuery(path: string, query?: Record<string, unknown>) {
  if (!query) return `${ZERNIO_BASE}${path}`;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return `${ZERNIO_BASE}${path}${qs ? `?${qs}` : ""}`;
}

async function parse(res: Response) {
  if (res.status === 204) return { success: true };
  return res.json();
}

async function fail(res: Response) {
  const text = await res.text();
  throw new Error(`Zernio API error ${res.status}: ${text}`);
}

export async function zernioGet(path: string, query?: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(withQuery(path, query), {
    method: "GET",
    headers: await headers(),
  });
  if (!res.ok) return fail(res);
  return parse(res);
}

export async function zernioPost(path: string, body: unknown, query?: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(withQuery(path, query), {
    method: "POST",
    headers: await headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) return fail(res);
  return parse(res);
}

export async function zernioPut(path: string, body: unknown, query?: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(withQuery(path, query), {
    method: "PUT",
    headers: await headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) return fail(res);
  return parse(res);
}

export async function zernioPatch(path: string, body: unknown, query?: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(withQuery(path, query), {
    method: "PATCH",
    headers: await headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) return fail(res);
  return parse(res);
}

export async function zernioDelete(path: string, query?: Record<string, unknown>, body?: unknown): Promise<unknown> {
  const init: RequestInit = {
    method: "DELETE",
    headers: await headers(),
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(withQuery(path, query), init);
  if (!res.ok) return fail(res);
  return parse(res);
}

export async function getDefaultZernioProfileId(): Promise<string | undefined> {
  return getRuntimeVariable("ZERNIO_DEFAULT_PROFILE_ID");
}
