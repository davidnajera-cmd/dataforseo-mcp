import type { IncomingMessage, ServerResponse } from "node:http";
import { getSnapshotRunHealth } from "../src/persistence-store.js";
import { assertDashboardSession } from "../src/dashboard-auth.js";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  try {
    assertDashboardSession(req);
    const health = await getSnapshotRunHealth();
    res.writeHead(200);
    res.end(JSON.stringify(health));
  } catch (error) {
    res.writeHead(error instanceof Error && error.message === "dashboard_session_required" ? 401 : 500);
    res.end(JSON.stringify({
      error: "pipeline_health_failed",
      message: error instanceof Error ? error.message : "Unexpected pipeline health error",
    }));
  }
}
