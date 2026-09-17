import type { IncomingMessage, ServerResponse } from "node:http";
import { assertDashboardAccessToken, assertDashboardSession, createDashboardSession, dashboardSessionCookie } from "../src/dashboard-auth.js";

export default function handler(
  req: IncomingMessage & { method?: string; headers: Record<string, string | string[] | undefined> },
  res: ServerResponse,
) {
  if (req.method === "GET") {
    try {
      assertDashboardSession(req);
      res.writeHead(204);
      res.end();
    } catch {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "dashboard_session_required" }));
    }
    return;
  }
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "method_not_allowed" }));
    return;
  }
  try {
    const accessToken = header(req.headers["x-dashboard-access-token"]);
    assertDashboardAccessToken(accessToken);
    const secret = process.env.DASHBOARD_SESSION_SECRET;
    if (!secret) throw new Error("dashboard_session_not_configured");
    res.setHeader("Set-Cookie", dashboardSessionCookie(createDashboardSession(secret)));
    res.writeHead(204);
    res.end();
  } catch {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "dashboard_access_denied" }));
  }
}

function header(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
