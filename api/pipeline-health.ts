import type { IncomingMessage, ServerResponse } from "node:http";
import { getSnapshotRunHealth } from "../src/persistence-store.js";

export default async function handler(_req: IncomingMessage, res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  try {
    const health = await getSnapshotRunHealth();
    res.writeHead(200);
    res.end(JSON.stringify(health));
  } catch (error) {
    res.writeHead(500);
    res.end(JSON.stringify({
      error: "pipeline_health_failed",
      message: error instanceof Error ? error.message : "Unexpected pipeline health error",
    }));
  }
}
