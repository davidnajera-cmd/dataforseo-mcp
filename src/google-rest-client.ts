import { getGoogleAccessToken } from "./gsc-client.js";

type GoogleApiBase = "businessaccountmanagement" | "businessinformation" | "siteverification" | "tagmanager";

const BASE_URLS: Record<GoogleApiBase, string> = {
  businessaccountmanagement: "https://mybusinessaccountmanagement.googleapis.com/v1",
  businessinformation: "https://mybusinessbusinessinformation.googleapis.com/v1",
  siteverification: "https://www.googleapis.com/siteVerification/v1",
  tagmanager: "https://tagmanager.googleapis.com/tagmanager/v2",
};

async function headers(): Promise<Record<string, string>> {
  return {
    Authorization: `Bearer ${await getGoogleAccessToken()}`,
    "Content-Type": "application/json",
  };
}

function url(base: GoogleApiBase, path: string) {
  return `${BASE_URLS[base]}${path}`;
}

async function parse(res: Response) {
  if (res.status === 204) return { success: true };
  return res.json();
}

async function fail(res: Response) {
  const text = await res.text();
  throw new Error(`Google API error ${res.status}: ${text}`);
}

export async function googleApiGet(path: string, base: GoogleApiBase): Promise<unknown> {
  const res = await fetch(url(base, path), { headers: await headers() });
  if (!res.ok) return fail(res);
  return parse(res);
}

export async function googleApiPost(path: string, body: unknown, base: GoogleApiBase): Promise<unknown> {
  const res = await fetch(url(base, path), {
    method: "POST",
    headers: await headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) return fail(res);
  return parse(res);
}
