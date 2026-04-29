import { getGoogleAccessToken } from "./gsc-client.js";
import { getRuntimeVariable } from "./runtime-config.js";

const ADMIN_BASE = "https://analyticsadmin.googleapis.com/v1beta";
const DATA_BASE = "https://analyticsdata.googleapis.com/v1beta";

async function headers(): Promise<Record<string, string>> {
  return {
    Authorization: `Bearer ${await getGoogleAccessToken()}`,
    "Content-Type": "application/json",
  };
}

export function normalizePropertyId(propertyId?: string): string {
  const value = propertyId ?? process.env.GA4_PROPERTY_ID;
  if (!value) {
    throw new Error("GA4 property_id is required. Pass property_id or set GA4_PROPERTY_ID.");
  }
  return value.startsWith("properties/") ? value : `properties/${value}`;
}

export async function resolvePropertyId(propertyId?: string): Promise<string> {
  const value = propertyId ?? await getRuntimeVariable("GA4_PROPERTY_ID");
  if (!value) {
    throw new Error("GA4 property_id is required. Pass property_id or set GA4_PROPERTY_ID.");
  }
  return value.startsWith("properties/") ? value : `properties/${value}`;
}

export async function ga4Get(path: string, base: "admin" | "data" = "admin"): Promise<unknown> {
  const baseUrl = base === "admin" ? ADMIN_BASE : DATA_BASE;
  const res = await fetch(`${baseUrl}${path}`, { headers: await headers() });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GA4 API error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function ga4Post(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${DATA_BASE}${path}`, {
    method: "POST",
    headers: await headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GA4 API error ${res.status}: ${text}`);
  }
  return res.json();
}
