const WEBMASTERS_BASE = "https://www.googleapis.com/webmasters/v3";
const SEARCHCONSOLE_BASE = "https://searchconsole.googleapis.com/v1";

function getAccessToken(): string {
  const token = process.env.GOOGLE_SEARCH_CONSOLE_ACCESS_TOKEN;
  if (!token) {
    throw new Error("GOOGLE_SEARCH_CONSOLE_ACCESS_TOKEN environment variable is required");
  }
  return token;
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${getAccessToken()}`,
    "Content-Type": "application/json",
  };
}

export async function gscGet(path: string, base: "webmasters" | "searchconsole" = "webmasters"): Promise<unknown> {
  const baseUrl = base === "webmasters" ? WEBMASTERS_BASE : SEARCHCONSOLE_BASE;
  const res = await fetch(`${baseUrl}${path}`, { headers: headers() });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Search Console API error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function gscPost(path: string, body: unknown, base: "webmasters" | "searchconsole" = "webmasters"): Promise<unknown> {
  const baseUrl = base === "webmasters" ? WEBMASTERS_BASE : SEARCHCONSOLE_BASE;
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Search Console API error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function gscPut(path: string): Promise<unknown> {
  const baseUrl = WEBMASTERS_BASE;
  const res = await fetch(`${baseUrl}${path}`, {
    method: "PUT",
    headers: headers(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Search Console API error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function gscDelete(path: string): Promise<unknown> {
  const baseUrl = WEBMASTERS_BASE;
  const res = await fetch(`${baseUrl}${path}`, {
    method: "DELETE",
    headers: headers(),
  });
  if (!res.ok && res.status !== 204) {
    const text = await res.text();
    throw new Error(`Google Search Console API error ${res.status}: ${text}`);
  }
  return { success: true };
}
