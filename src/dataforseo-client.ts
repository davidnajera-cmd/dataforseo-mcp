import { getRuntimeVariable } from "./runtime-config.js";

const BASE_URL = "https://api.dataforseo.com/v3";

async function getAuth(): Promise<string> {
  const login = await getRuntimeVariable("DATAFORSEO_LOGIN");
  const password = await getRuntimeVariable("DATAFORSEO_PASSWORD");
  if (!login || !password) {
    throw new Error("DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD environment variables are required");
  }
  return Buffer.from(`${login}:${password}`).toString("base64");
}

export async function dataforseoRequest(
  method: "GET" | "POST",
  path: string,
  body?: unknown
): Promise<unknown> {
  const url = `${BASE_URL}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Basic ${await getAuth()}`,
    "Content-Type": "application/json",
  };

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(Array.isArray(body) ? body : [body]) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DataForSEO API error ${res.status}: ${text}`);
  }

  return res.json();
}

export async function post(path: string, body: unknown): Promise<unknown> {
  return dataforseoRequest("POST", path, body);
}

export async function get(path: string): Promise<unknown> {
  return dataforseoRequest("GET", path);
}
