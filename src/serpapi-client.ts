const BASE_URL = "https://serpapi.com";

function getApiKey(): string {
  const key = process.env.SERPAPI_API_KEY;
  if (!key) {
    throw new Error("SERPAPI_API_KEY environment variable is required");
  }
  return key;
}

export async function serpApiRequest(
  params: Record<string, string | number | boolean | undefined>
): Promise<unknown> {
  const searchParams = new URLSearchParams();
  searchParams.set("api_key", getApiKey());
  searchParams.set("output", "json");

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      searchParams.set(key, String(value));
    }
  }

  const url = `${BASE_URL}/search?${searchParams.toString()}`;
  const res = await fetch(url);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SerpAPI error ${res.status}: ${text}`);
  }

  return res.json();
}
