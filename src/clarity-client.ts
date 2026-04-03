const BASE_URL = "https://www.clarity.ms/export-data/api/v1";

function getToken(): string {
  const token = process.env.CLARITY_API_TOKEN;
  if (!token) {
    throw new Error("CLARITY_API_TOKEN environment variable is required");
  }
  return token;
}

export async function clarityRequest(
  path: string,
  params: Record<string, string>
): Promise<unknown> {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, value);
    }
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Clarity API error ${res.status}: ${text}`);
  }

  return res.json();
}
