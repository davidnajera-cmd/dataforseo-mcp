import { captureRankings } from "./capture-rankings.js";
import { captureBacklinks } from "./capture-backlinks.js";
import { captureLlmVisibility } from "./capture-llm.js";
import { captureTraffic, autoExpandUniverseFromGsc } from "./capture-traffic.js";
import { getPersistenceSql, ensurePersistenceSchema, startSnapshotRun, finishSnapshotRun } from "../persistence-store.js";
import { getRuntimeVariable } from "../runtime-config.js";

export type SnapshotTask = "rankings_core" | "rankings_full" | "backlinks" | "llm" | "traffic" | "auto_expand" | "all";

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

async function listDomains(): Promise<string[]> {
  const sql = getPersistenceSql();
  if (!sql) return [];
  await ensurePersistenceSchema();
  // Get distinct domains from universe; fallback to runtime vars if empty
  const rows = await sql`select distinct domain from seo_keyword_universe where active = true` as Array<{ domain: string }>;
  if (rows.length) return rows.map((r) => r.domain);
  const fallback: string[] = [];
  for (const key of ["DNA_DOMAIN_CO", "DNA_DOMAIN_MX", "DNA_DOMAIN_LTA"]) {
    const value = await getRuntimeVariable(key);
    if (value) fallback.push(value);
  }
  return fallback;
}

export async function runSnapshot(tasks: SnapshotTask[], snapshotDate?: string): Promise<{
  date: string;
  results: Record<string, unknown>;
  errors: unknown[];
  status: "ok" | "partial" | "failed";
}> {
  const date = snapshotDate ?? todayUtc();
  const results: Record<string, unknown> = {};
  const allErrors: unknown[] = [];
  const taskList: SnapshotTask[] = tasks.includes("all")
    ? ["traffic", "rankings_core", "rankings_full", "backlinks", "llm", "auto_expand"]
    : tasks;

  const runId = await startSnapshotRun(taskList.join(","));

  for (const task of taskList) {
    try {
      if (task === "rankings_core") {
        results.rankings_core = await captureRankings("core", date);
      } else if (task === "rankings_full") {
        results.rankings_full = await captureRankings("non_core", date);
      } else if (task === "backlinks") {
        results.backlinks = await captureBacklinks(await listDomains(), date);
      } else if (task === "llm") {
        results.llm = await captureLlmVisibility(date);
      } else if (task === "traffic") {
        results.traffic = await captureTraffic(date);
      } else if (task === "auto_expand") {
        results.auto_expand = await autoExpandUniverseFromGsc();
      }
    } catch (error) {
      allErrors.push({ task, error: error instanceof Error ? error.message : "unknown" });
    }
  }

  const status: "ok" | "partial" | "failed" = allErrors.length === 0
    ? "ok"
    : Object.keys(results).length > 0 ? "partial" : "failed";
  await finishSnapshotRun(runId, status, results, allErrors.length ? allErrors : null);
  return { date, results, errors: allErrors, status };
}

export function defaultDailyTasks(): SnapshotTask[] {
  return ["traffic", "rankings_core"];
}

export function defaultWeeklyTasks(): SnapshotTask[] {
  return ["traffic", "rankings_core", "rankings_full", "backlinks", "llm", "auto_expand"];
}
