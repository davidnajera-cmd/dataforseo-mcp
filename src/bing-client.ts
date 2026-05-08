import { getRuntimeVariable } from "./runtime-config.js";

const BASE_URL = "https://ssl.bing.com/webmaster/api.svc/json";

async function getApiKey(): Promise<string> {
  const key = await getRuntimeVariable("BING_WEBMASTER_API_KEY");
  if (!key) {
    throw new Error("BING_WEBMASTER_API_KEY is required (Bing Webmaster Tools -> Settings -> API access)");
  }
  return key;
}

export async function bingGet(action: string, params: Record<string, string> = {}): Promise<unknown> {
  const url = new URL(`${BASE_URL}/${action}`);
  url.searchParams.set("apikey", await getApiKey());
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") url.searchParams.set(key, value);
  }
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Bing Webmaster API error ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

export async function bingPost(action: string, body: Record<string, unknown>): Promise<unknown> {
  const url = new URL(`${BASE_URL}/${action}`);
  url.searchParams.set("apikey", await getApiKey());
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Bing Webmaster API error ${res.status}: ${await res.text()}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : { ok: true };
}
