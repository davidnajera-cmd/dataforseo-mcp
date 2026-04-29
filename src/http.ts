import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectSeoDashboardData } from "./dashboard-data.js";
import { listDashboardSnapshots, saveDashboardSnapshot } from "./dashboard-store.js";
import { runSeoConnectivityChecks } from "./seo-connectivity.js";
import {
  assertVariablesAdminToken,
  deleteRuntimeVariable,
  listRuntimeVariables,
  setRuntimeVariable,
} from "./runtime-config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = existsSync(path.resolve(__dirname, "..", "public"))
  ? path.resolve(__dirname, "..")
  : path.resolve(__dirname, "..", "..");
const publicDir = path.join(rootDir, "public");
const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(express.json());
app.use(express.static(publicDir));

app.get("/api/seo-dashboard", async (req, res) => {
  try {
    if (req.query.snapshots === "1" || req.query.snapshots === "true") {
      const rows = await listDashboardSnapshots({
        country: req.query.country as never,
        timeframe: req.query.timeframe as never,
        channel: req.query.channel as never,
      });
      res.json({ snapshots: rows });
      return;
    }

    const data = await collectSeoDashboardData({
      country: req.query.country as never,
      timeframe: req.query.timeframe as never,
      channel: req.query.channel as never,
      startDate: typeof req.query.startDate === "string" ? req.query.startDate : undefined,
      endDate: typeof req.query.endDate === "string" ? req.query.endDate : undefined,
    });
    await saveDashboardSnapshot(data).catch((error) => {
      console.warn("Could not persist SEO dashboard snapshot", error);
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({
      error: "seo_dashboard_failed",
      message: error instanceof Error ? error.message : "Unexpected dashboard error",
    });
  }
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "dna-seo-dashboard" });
});

app.get("/api/seo-connectivity", async (_req, res) => {
  try {
    res.json({ generatedAt: new Date().toISOString(), checks: await runSeoConnectivityChecks() });
  } catch (error) {
    res.status(500).json({
      error: "seo_connectivity_failed",
      message: error instanceof Error ? error.message : "Unexpected connectivity error",
    });
  }
});

app.get("/api/variables", async (_req, res) => {
  res.json({ variables: await listRuntimeVariables() });
});

app.post("/api/variables", async (req, res) => {
  try {
    assertVariablesAdminToken(req.header("x-admin-token"));
    await setRuntimeVariable(String(req.body.name ?? ""), String(req.body.value ?? ""));
    res.json({ ok: true, variables: await listRuntimeVariables() });
  } catch (error) {
    res.status(error instanceof Error && error.message.includes("token") ? 401 : 500).json({
      error: "variables_failed",
      message: error instanceof Error ? error.message : "Unexpected variables error",
    });
  }
});

app.delete("/api/variables", async (req, res) => {
  try {
    assertVariablesAdminToken(req.header("x-admin-token"));
    await deleteRuntimeVariable(String(req.query.name ?? ""));
    res.json({ ok: true, variables: await listRuntimeVariables() });
  } catch (error) {
    res.status(error instanceof Error && error.message.includes("token") ? 401 : 500).json({
      error: "variables_failed",
      message: error instanceof Error ? error.message : "Unexpected variables error",
    });
  }
});

app.listen(port, () => {
  console.log(`DNA Music SEO dashboard ready at http://localhost:${port}`);
});
