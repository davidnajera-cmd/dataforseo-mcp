import { getRuntimeVariable } from "./runtime-config.js";

export async function ahrefsRequest(path: string, params: Record<string, string | number | undefined> = {}) {
  const token = await getRuntimeVariable("AHREFS_API_TOKEN");
  if (!token) throw new Error("AHREFS_API_TOKEN environment variable is required");

  const url = new URL(`https://api.ahrefs.com/v3/${path.replace(/^\//, "")}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ahrefs API error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function semrushRequest(params: Record<string, string | number | undefined>) {
  const key = await getRuntimeVariable("SEMRUSH_API_KEY");
  if (!key) throw new Error("SEMRUSH_API_KEY environment variable is required");

  const url = new URL("https://api.semrush.com/");
  url.searchParams.set("key", key);
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(name, String(value));
  }

  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Semrush API error ${res.status}: ${text}`);
  }
  return res.text();
}
