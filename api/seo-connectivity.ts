import type { IncomingMessage, ServerResponse } from "node:http";
import { runSeoConnectivityChecks } from "../src/seo-connectivity.js";
import { assertDashboardSession } from "../src/dashboard-auth.js";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    assertDashboardSession(req);
    const checks = await runSeoConnectivityChecks();
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.writeHead(200);
    res.end(JSON.stringify({ generatedAt: new Date().toISOString(), checks }));
  } catch (error) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.writeHead(error instanceof Error && error.message === "dashboard_session_required" ? 401 : 500);
    res.end(JSON.stringify({
      error: "seo_connectivity_failed",
      message: error instanceof Error ? error.message : "Unexpected connectivity error",
    }));
  }
}
