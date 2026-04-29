import type { IncomingMessage, ServerResponse } from "node:http";
import { collectSeoDashboardData } from "../src/dashboard-data.js";
import { listDashboardSnapshots, saveDashboardSnapshot } from "../src/dashboard-store.js";

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
    const url = new URL(req.url ?? "/api/seo-dashboard", "http://localhost");
    const snapshotMode = url.searchParams.get("snapshots");

    if (snapshotMode === "1" || snapshotMode === "true") {
      const rows = await listDashboardSnapshots({
        country: url.searchParams.get("country") as never,
        timeframe: url.searchParams.get("timeframe") as never,
        channel: url.searchParams.get("channel") as never,
      });
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.writeHead(200);
      res.end(JSON.stringify({ snapshots: rows }));
      return;
    }

    const data = await collectSeoDashboardData({
      country: url.searchParams.get("country") as never,
      timeframe: url.searchParams.get("timeframe") as never,
      channel: url.searchParams.get("channel") as never,
      startDate: url.searchParams.get("startDate") ?? undefined,
      endDate: url.searchParams.get("endDate") ?? undefined,
    });
    await saveDashboardSnapshot(data).catch((error) => {
      console.warn("Could not persist SEO dashboard snapshot", error);
    });

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.writeHead(200);
    res.end(JSON.stringify(data));
  } catch (error) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.writeHead(500);
    res.end(JSON.stringify({
      error: "seo_dashboard_failed",
      message: error instanceof Error ? error.message : "Unexpected dashboard error",
    }));
  }
}
