import type { IncomingMessage, ServerResponse } from "node:http";
import { collectSocialDashboardData } from "../src/social-dashboard-data.js";
import { normalizeFilters } from "../src/dashboard-data.js";
import { getLatestSocialDashboardSnapshot, saveSocialDashboardSnapshot } from "../src/social-dashboard-store.js";

export default async function handler(
  req: IncomingMessage & { query?: Record<string, string>; url?: string },
  res: ServerResponse
) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    const url = new URL(req.url ?? "/api/social-dashboard", "http://localhost");
    const filters = normalizeFilters({
      country: url.searchParams.get("country") as never,
      timeframe: url.searchParams.get("timeframe") as never,
      channel: url.searchParams.get("channel") as never,
      startDate: url.searchParams.get("startDate") ?? undefined,
      endDate: url.searchParams.get("endDate") ?? undefined,
    });
    const forceRefresh = url.searchParams.get("refresh") === "1";
    if (!forceRefresh) {
      const cached = await getLatestSocialDashboardSnapshot(filters).catch(() => null);
      if (cached) {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.writeHead(200);
        res.end(JSON.stringify(cached));
        return;
      }
    }
    const data = await collectSocialDashboardData(filters);
    await saveSocialDashboardSnapshot(data).catch((error) => {
      console.warn("Could not persist social dashboard snapshot", error);
    });
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.writeHead(200);
    res.end(JSON.stringify(data));
  } catch (error) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.writeHead(500);
    res.end(JSON.stringify({
      error: "social_dashboard_failed",
      message: error instanceof Error ? error.message : "Unexpected social dashboard error",
    }));
  }
}
