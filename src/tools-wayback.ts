import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const CDX_URL = "https://web.archive.org/cdx/search/cdx";
const AVAILABILITY_URL = "https://archive.org/wayback/available";

function formatResult(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": "dataforseo-mcp/1.0 (Wayback client)" } });
  if (!res.ok) throw new Error(`Wayback ${res.status}: ${await res.text()}`);
  return res.text();
}

export function registerWaybackTools(server: McpServer) {
  server.tool(
    "wayback_get_snapshots",
    "List all archived snapshots for a URL using the Wayback CDX API. Useful to recover historical URLs before a site migration.",
    {
      url: z.string().describe("URL to look up, e.g. https://www.dnamusic.edu.co/cursos"),
      from: z.string().optional().describe("YYYYMMDD lower bound, e.g. 20200101"),
      to: z.string().optional().describe("YYYYMMDD upper bound"),
      limit: z.number().int().positive().max(1000).optional().describe("Max snapshots to return (default 100)"),
      match_type: z.enum(["exact", "prefix", "host", "domain"]).optional().describe("Match scope (default exact)"),
      filter_status: z.string().optional().describe("Status code filter, e.g. '200' or '!=302'"),
    },
    async ({ url, from, to, limit, match_type, filter_status }) => {
      const params = new URLSearchParams({ url, output: "json", limit: String(limit ?? 100) });
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (match_type) params.set("matchType", match_type);
      if (filter_status) params.set("filter", `statuscode:${filter_status}`);
      const text = await fetchText(`${CDX_URL}?${params.toString()}`);
      const rows = text.trim() ? JSON.parse(text) as string[][] : [];
      const [header, ...data] = rows;
      const snapshots = data.map((row) => Object.fromEntries(header.map((key, i) => [key, row[i]])));
      return { content: [{ type: "text" as const, text: formatResult({ total: snapshots.length, snapshots }) }] };
    }
  );

  server.tool(
    "wayback_get_closest",
    "Get the snapshot closest to a target date using the Wayback Availability API.",
    {
      url: z.string(),
      timestamp: z.string().optional().describe("YYYYMMDD or YYYYMMDDhhmmss; defaults to now"),
    },
    async ({ url, timestamp }) => {
      const params = new URLSearchParams({ url });
      if (timestamp) params.set("timestamp", timestamp);
      const text = await fetchText(`${AVAILABILITY_URL}?${params.toString()}`);
      return { content: [{ type: "text" as const, text } ] };
    }
  );

  server.tool(
    "wayback_get_snapshot_content",
    "Fetch the raw HTML of a specific Wayback snapshot. Use a timestamp from wayback_get_snapshots.",
    {
      url: z.string(),
      timestamp: z.string().describe("Snapshot timestamp YYYYMMDDhhmmss"),
      max_chars: z.number().int().positive().max(200000).optional().describe("Truncate response (default 50000)"),
    },
    async ({ url, timestamp, max_chars }) => {
      const html = await fetchText(`https://web.archive.org/web/${timestamp}id_/${url}`);
      const limit = max_chars ?? 50000;
      const truncated = html.length > limit ? `${html.slice(0, limit)}\n\n[...truncated, full length ${html.length} chars]` : html;
      return { content: [{ type: "text" as const, text: truncated }] };
    }
  );

  server.tool(
    "wayback_diff_snapshots",
    "Compare two snapshots of the same URL: returns title, meta description, h1 list, and char count for each.",
    {
      url: z.string(),
      timestamp_a: z.string(),
      timestamp_b: z.string(),
    },
    async ({ url, timestamp_a, timestamp_b }) => {
      const [a, b] = await Promise.all([
        fetchText(`https://web.archive.org/web/${timestamp_a}id_/${url}`),
        fetchText(`https://web.archive.org/web/${timestamp_b}id_/${url}`),
      ]);
      const summarize = (html: string) => ({
        title: html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? null,
        meta_description: html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i)?.[1] ?? null,
        h1: [...html.matchAll(/<h1[^>]*>([^<]*)<\/h1>/gi)].map((m) => m[1].trim()),
        char_count: html.length,
      });
      return { content: [{ type: "text" as const, text: formatResult({ url, a: { timestamp: timestamp_a, ...summarize(a) }, b: { timestamp: timestamp_b, ...summarize(b) } }) }] };
    }
  );
}
