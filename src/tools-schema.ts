import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const VALIDATOR_URL = "https://validator.schema.org/validate";

function formatResult(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; dataforseo-mcp/1.0; +https://dataforseo-mcp-three.vercel.app)",
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Fetch ${url} failed ${res.status}`);
  return res.text();
}

function extractJsonLd(html: string): unknown[] {
  const blocks: unknown[] = [];
  const regex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(regex)) {
    const raw = match[1].trim();
    try {
      blocks.push(JSON.parse(raw));
    } catch (error) {
      blocks.push({ parse_error: error instanceof Error ? error.message : "Invalid JSON", raw: raw.slice(0, 500) });
    }
  }
  return blocks;
}

function extractMicrodataItemtypes(html: string): string[] {
  const itemtypes = new Set<string>();
  for (const match of html.matchAll(/itemtype=["']([^"']+)["']/gi)) {
    itemtypes.add(match[1]);
  }
  return [...itemtypes];
}

function extractMetaTags(html: string): Record<string, string> {
  const meta: Record<string, string> = {};
  for (const match of html.matchAll(/<meta\s+(?:name|property)=["']([^"']+)["']\s+content=["']([^"']*)["']/gi)) {
    meta[match[1]] = match[2];
  }
  return meta;
}

export function registerSchemaTools(server: McpServer) {
  server.tool(
    "schema_validate_url",
    "Validate the structured data of a URL using validator.schema.org. Returns errors, warnings, and parsed types.",
    {
      url: z.string().describe("URL to validate"),
    },
    async ({ url }) => {
      const params = new URLSearchParams({ url });
      const res = await fetch(VALIDATOR_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
      const text = await res.text();
      const cleaned = text.replace(/^\)]\}'\s*\n?/, "");
      try {
        return { content: [{ type: "text" as const, text: formatResult(JSON.parse(cleaned)) }] };
      } catch {
        return { content: [{ type: "text" as const, text: cleaned }] };
      }
    }
  );

  server.tool(
    "schema_extract_url",
    "Extract structured data from a URL: JSON-LD blocks, microdata itemtypes, and SEO meta tags.",
    {
      url: z.string(),
    },
    async ({ url }) => {
      const html = await fetchHtml(url);
      const result = {
        url,
        json_ld_blocks: extractJsonLd(html),
        microdata_itemtypes: extractMicrodataItemtypes(html),
        meta: extractMetaTags(html),
        title: html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? null,
        canonical: html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i)?.[1] ?? null,
      };
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "schema_validate_snippet",
    "Validate a JSON-LD code snippet (paste raw JSON-LD) using validator.schema.org.",
    {
      code: z.string().describe("Raw JSON-LD or HTML containing JSON-LD"),
    },
    async ({ code }) => {
      const params = new URLSearchParams({ code });
      const res = await fetch(VALIDATOR_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
      const text = await res.text();
      const cleaned = text.replace(/^\)]\}'\s*\n?/, "");
      try {
        return { content: [{ type: "text" as const, text: formatResult(JSON.parse(cleaned)) }] };
      } catch {
        return { content: [{ type: "text" as const, text: cleaned }] };
      }
    }
  );
}
