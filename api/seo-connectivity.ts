import type { IncomingMessage, ServerResponse } from "node:http";
import { runSeoConnectivityChecks } from "../src/seo-connectivity.js";

export default async function handler(_req: IncomingMessage, res: ServerResponse) {
  try {
    const checks = await runSeoConnectivityChecks();
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.writeHead(200);
    res.end(JSON.stringify({ generatedAt: new Date().toISOString(), checks }));
  } catch (error) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.writeHead(500);
    res.end(JSON.stringify({
      error: "seo_connectivity_failed",
      message: error instanceof Error ? error.message : "Unexpected connectivity error",
    }));
  }
}
