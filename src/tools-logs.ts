import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

function formatResult(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

type ParsedLogLine = {
  ip: string;
  timestamp: string;
  method: string;
  path: string;
  protocol: string;
  status: number;
  size: number;
  referrer?: string;
  user_agent?: string;
};

const COMBINED_REGEX = /^(\S+) \S+ \S+ \[([^\]]+)\] "(\S+) ([^"]*?) (\S+)" (\d+) (\S+)(?: "([^"]*)" "([^"]*)")?/;

function parseLine(line: string): ParsedLogLine | null {
  const match = line.match(COMBINED_REGEX);
  if (!match) return null;
  return {
    ip: match[1],
    timestamp: match[2],
    method: match[3],
    path: match[4],
    protocol: match[5],
    status: Number(match[6]),
    size: match[7] === "-" ? 0 : Number(match[7]),
    referrer: match[8],
    user_agent: match[9],
  };
}

function topN<T>(items: Iterable<[T, number]>, n: number): Array<{ key: T; count: number }> {
  return [...items].sort((a, b) => b[1] - a[1]).slice(0, n).map(([key, count]) => ({ key, count }));
}

const SEARCH_BOTS = [
  { name: "Googlebot", regex: /Googlebot/i },
  { name: "Bingbot", regex: /Bingbot/i },
  { name: "Yandex", regex: /YandexBot/i },
  { name: "Baidu", regex: /Baiduspider/i },
  { name: "DuckDuckBot", regex: /DuckDuckBot/i },
  { name: "GPTBot", regex: /GPTBot/i },
  { name: "ClaudeBot", regex: /Claude(Bot|-Web)/i },
  { name: "PerplexityBot", regex: /PerplexityBot/i },
  { name: "AppleBot", regex: /Applebot/i },
  { name: "FacebookBot", regex: /facebookexternalhit|meta-externalagent/i },
];

function classifyBot(userAgent: string | undefined): string | null {
  if (!userAgent) return null;
  for (const bot of SEARCH_BOTS) if (bot.regex.test(userAgent)) return bot.name;
  return null;
}

export function registerLogTools(server: McpServer) {
  server.tool(
    "log_file_analyze",
    "Parse a web server access log (Common/Combined Log Format) and report top 404s, top hits, status distribution, top user agents, and SEO bot activity. Provide either raw log content (paste) or a public URL.",
    {
      content: z.string().optional().describe("Raw log content (one line per request)"),
      url: z.string().optional().describe("Public URL to download the log from (overrides content if both provided)"),
      top_n: z.number().int().positive().max(100).optional().describe("How many items per ranking (default 25)"),
    },
    async ({ content, url, top_n }) => {
      let raw = content ?? "";
      if (url) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Could not download log ${url}: ${res.status}`);
        raw = await res.text();
      }
      if (!raw.trim()) throw new Error("Provide either content or url with log data");

      const lines = raw.split(/\r?\n/).filter(Boolean);
      const parsed: ParsedLogLine[] = [];
      const unparsed: string[] = [];
      for (const line of lines) {
        const result = parseLine(line);
        if (result) parsed.push(result); else if (unparsed.length < 5) unparsed.push(line);
      }

      const status = new Map<number, number>();
      const paths = new Map<string, number>();
      const notFound = new Map<string, number>();
      const userAgents = new Map<string, number>();
      const bots = new Map<string, number>();
      const ips = new Map<string, number>();
      const referrers = new Map<string, number>();

      for (const row of parsed) {
        status.set(row.status, (status.get(row.status) ?? 0) + 1);
        paths.set(row.path, (paths.get(row.path) ?? 0) + 1);
        if (row.status === 404) notFound.set(row.path, (notFound.get(row.path) ?? 0) + 1);
        if (row.user_agent) userAgents.set(row.user_agent, (userAgents.get(row.user_agent) ?? 0) + 1);
        const bot = classifyBot(row.user_agent);
        if (bot) bots.set(bot, (bots.get(bot) ?? 0) + 1);
        ips.set(row.ip, (ips.get(row.ip) ?? 0) + 1);
        if (row.referrer && row.referrer !== "-") referrers.set(row.referrer, (referrers.get(row.referrer) ?? 0) + 1);
      }

      const limit = top_n ?? 25;
      const summary = {
        total_lines: lines.length,
        parsed_lines: parsed.length,
        unparsed_lines: lines.length - parsed.length,
        unparsed_examples: unparsed,
        status_distribution: Object.fromEntries([...status.entries()].sort((a, b) => a[0] - b[0])),
        top_paths: topN(paths.entries(), limit),
        top_404_paths: topN(notFound.entries(), limit),
        top_referrers: topN(referrers.entries(), limit),
        top_user_agents: topN(userAgents.entries(), limit),
        seo_bot_hits: Object.fromEntries([...bots.entries()].sort((a, b) => b[1] - a[1])),
        top_client_ips: topN(ips.entries(), limit),
      };
      return { content: [{ type: "text" as const, text: formatResult(summary) }] };
    }
  );
}
