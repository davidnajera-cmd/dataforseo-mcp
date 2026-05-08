import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const DEFAULT_USER_AGENT = "Mozilla/5.0 (compatible; dataforseo-mcp/1.0; +https://dataforseo-mcp-three.vercel.app)";

function formatResult(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

function headersToObject(headers: Headers): Record<string, string> {
  const obj: Record<string, string> = {};
  headers.forEach((value, key) => { obj[key] = value; });
  return obj;
}

function resolveLocation(current: string, location: string): string {
  try {
    return new URL(location, current).toString();
  } catch {
    return location;
  }
}

export function registerHttpUtilsTools(server: McpServer) {
  server.tool(
    "redirect_chain_check",
    "Follow HTTP redirects manually for a URL and report each hop with status, location, latency, and final URL. Useful to debug redirect chains during migrations.",
    {
      url: z.string().describe("Starting URL"),
      method: z.enum(["GET", "HEAD"]).optional().describe("HTTP method (default HEAD)"),
      max_hops: z.number().int().positive().max(20).optional().describe("Max redirects to follow (default 10)"),
      user_agent: z.string().optional(),
    },
    async ({ url, method, max_hops, user_agent }) => {
      const limit = max_hops ?? 10;
      const verb = method ?? "HEAD";
      const ua = user_agent ?? DEFAULT_USER_AGENT;
      const hops: Array<Record<string, unknown>> = [];
      let current = url;
      let visited = new Set<string>();
      let truncated = false;

      for (let i = 0; i < limit; i++) {
        if (visited.has(current)) {
          hops.push({ hop: i + 1, url: current, error: "loop_detected" });
          break;
        }
        visited.add(current);

        const start = Date.now();
        let res: Response;
        try {
          res = await fetch(current, {
            method: verb,
            redirect: "manual",
            headers: { "User-Agent": ua, Accept: "*/*" },
          });
        } catch (error) {
          hops.push({ hop: i + 1, url: current, error: error instanceof Error ? error.message : "fetch_failed" });
          break;
        }
        const latency_ms = Date.now() - start;
        const status = res.status;
        const location = res.headers.get("location");
        const hop: Record<string, unknown> = {
          hop: i + 1,
          url: current,
          status,
          latency_ms,
          content_type: res.headers.get("content-type") ?? null,
          server: res.headers.get("server") ?? null,
        };
        if (location) hop.location = location;
        hops.push(hop);

        if (status >= 300 && status < 400 && location) {
          current = resolveLocation(current, location);
          continue;
        }
        return { content: [{ type: "text" as const, text: formatResult({ start_url: url, final_url: current, final_status: status, hops_count: hops.length, hops }) }] };
      }

      truncated = hops.length >= limit;
      return { content: [{ type: "text" as const, text: formatResult({ start_url: url, final_url: current, hops_count: hops.length, truncated, hops }) }] };
    }
  );

  server.tool(
    "http_headers_inspect",
    "Fetch the response headers of a URL without following redirects. Returns status, all headers, and key SEO signals (canonical, x-robots-tag, cache-control, content-encoding).",
    {
      url: z.string(),
      method: z.enum(["GET", "HEAD"]).optional(),
      user_agent: z.string().optional(),
    },
    async ({ url, method, user_agent }) => {
      const start = Date.now();
      const res = await fetch(url, {
        method: method ?? "HEAD",
        redirect: "manual",
        headers: { "User-Agent": user_agent ?? DEFAULT_USER_AGENT, Accept: "*/*" },
      });
      const latency_ms = Date.now() - start;
      const headers = headersToObject(res.headers);
      const seo_signals = {
        x_robots_tag: headers["x-robots-tag"] ?? null,
        cache_control: headers["cache-control"] ?? null,
        content_encoding: headers["content-encoding"] ?? null,
        content_type: headers["content-type"] ?? null,
        location: headers.location ?? null,
        link_canonical: (headers.link ?? "").match(/<([^>]+)>;\s*rel=["']?canonical["']?/i)?.[1] ?? null,
      };
      return { content: [{ type: "text" as const, text: formatResult({ url, status: res.status, latency_ms, seo_signals, headers }) }] };
    }
  );

  server.tool(
    "http_robots_txt",
    "Fetch and parse the robots.txt of a domain. Returns user-agent groups with their allow/disallow rules and sitemap URLs.",
    {
      site_url: z.string().describe("Site root, e.g. https://www.dnamusic.edu.co"),
    },
    async ({ site_url }) => {
      const url = new URL("/robots.txt", site_url).toString();
      const res = await fetch(url, { headers: { "User-Agent": DEFAULT_USER_AGENT } });
      if (!res.ok) {
        return { content: [{ type: "text" as const, text: formatResult({ url, status: res.status, error: "robots_not_found" }) }] };
      }
      const text = await res.text();
      const groups: Array<{ user_agents: string[]; rules: Array<{ type: string; value: string }> }> = [];
      const sitemaps: string[] = [];
      let current: typeof groups[0] | null = null;

      for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.split("#")[0].trim();
        if (!line) continue;
        const match = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
        if (!match) continue;
        const directive = match[1].toLowerCase();
        const value = match[2].trim();
        if (directive === "sitemap") { sitemaps.push(value); continue; }
        if (directive === "user-agent") {
          if (!current || current.rules.length > 0) {
            current = { user_agents: [], rules: [] };
            groups.push(current);
          }
          current.user_agents.push(value);
          continue;
        }
        if (current && (directive === "allow" || directive === "disallow" || directive === "crawl-delay")) {
          current.rules.push({ type: directive, value });
        }
      }
      return { content: [{ type: "text" as const, text: formatResult({ url, status: res.status, sitemaps, groups, raw_length: text.length }) }] };
    }
  );
}
