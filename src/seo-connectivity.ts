import { ga4Get, resolvePropertyId } from "./ga4-client.js";
import { post } from "./dataforseo-client.js";
import { gscPost } from "./gsc-client.js";
import { runPageSpeed, summarizePageSpeed } from "./pagespeed-client.js";
import { getRuntimeVariable } from "./runtime-config.js";

export type ConnectivityCheck = {
  name: string;
  status: "ok" | "missing_config" | "error";
  message: string;
  sample?: unknown;
};

export async function runSeoConnectivityChecks(): Promise<ConnectivityCheck[]> {
  const checks = await Promise.all([
    checkGa4(),
    checkPageSpeed(),
    checkGscInspection(),
    checkDataForSeo(),
    checkPreparedConnector("Ahrefs", "AHREFS_API_TOKEN"),
    checkPreparedConnector("Semrush", "SEMRUSH_API_KEY"),
  ]);
  return checks;
}

async function checkGa4(): Promise<ConnectivityCheck> {
  if (!await getRuntimeVariable("GA4_PROPERTY_ID")) {
    try {
      const summaries = await ga4Get("/accountSummaries");
      return {
        name: "GA4",
        status: "missing_config",
        message: "GA4 auth works. Set GA4_PROPERTY_ID to enable property-level reports.",
        sample: { accountSummaries: Array.isArray((summaries as any).accountSummaries) ? (summaries as any).accountSummaries.length : 0 },
      };
    } catch (error) {
      return {
        name: "GA4",
        status: "error",
        message: `${message(error)}. The Google refresh token likely needs analytics.readonly scope.`,
      };
    }
  }

  try {
    const property = await resolvePropertyId();
    const details = await ga4Get(`/${property}`);
    return { name: "GA4", status: "ok", message: "GA4 Admin API responded.", sample: pick(details, ["name", "displayName", "timeZone", "currencyCode"]) };
  } catch (error) {
    return { name: "GA4", status: "error", message: message(error) };
  }
}

async function checkPageSpeed(): Promise<ConnectivityCheck> {
  if (!await getRuntimeVariable("PAGESPEED_API_KEY")) {
    return { name: "PageSpeed Insights", status: "missing_config", message: "Set PAGESPEED_API_KEY." };
  }

  try {
    const url = await getRuntimeVariable("DNA_CANONICAL_URL") ?? "https://www.dnamusic.edu.co/";
    const raw = await runPageSpeed(url, { strategy: "mobile", categories: ["seo"] });
    const summary = summarizePageSpeed(raw);
    return { name: "PageSpeed Insights", status: "ok", message: "PageSpeed API responded.", sample: summary };
  } catch (error) {
    return { name: "PageSpeed Insights", status: "error", message: message(error) };
  }
}

async function checkGscInspection(): Promise<ConnectivityCheck> {
  const siteUrl = await getRuntimeVariable("DNA_SITE_CO") ?? await getRuntimeVariable("DNA_SITE_URL") ?? "sc-domain:dnamusic.edu.co";
  const inspectionUrl = await getRuntimeVariable("DNA_INSPECTION_URL") ?? await getRuntimeVariable("DNA_CANONICAL_URL") ?? "https://www.dnamusic.edu.co/";

  try {
    const result = await gscPost("/urlInspection/index:inspect", {
      inspectionUrl,
      siteUrl,
      languageCode: "es-CO",
    }, "searchconsole");
    const inspection = (result as any).inspectionResult ?? {};
    return {
      name: "GSC URL Inspection",
      status: "ok",
      message: "URL Inspection API responded.",
      sample: pick(inspection.indexStatusResult ?? {}, ["verdict", "coverageState", "robotsTxtState", "indexingState", "lastCrawlTime"]),
    };
  } catch (error) {
    return { name: "GSC URL Inspection", status: "error", message: message(error) };
  }
}

async function checkDataForSeo(): Promise<ConnectivityCheck> {
  if (!await getRuntimeVariable("DATAFORSEO_LOGIN") || !await getRuntimeVariable("DATAFORSEO_PASSWORD")) {
    return { name: "DataForSEO", status: "missing_config", message: "Set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD." };
  }

  try {
    const result = await post("/dataforseo_labs/google/domain_rank_overview/live", {
      target: await getRuntimeVariable("DNA_DOMAIN_CO") ?? await getRuntimeVariable("DNA_DOMAIN") ?? "dnamusic.edu.co",
      location_code: Number(await getRuntimeVariable("DNA_LOCATION_CO") ?? 2170),
      language_code: "es",
    });
    return { name: "DataForSEO", status: "ok", message: "DataForSEO responded.", sample: compactDataForSeo(result) };
  } catch (error) {
    return { name: "DataForSEO", status: "error", message: message(error) };
  }
}

async function checkPreparedConnector(name: string, envName: string): Promise<ConnectivityCheck> {
  return await getRuntimeVariable(envName)
    ? { name, status: "ok", message: `${envName} is configured. Connector tools are ready.` }
    : { name, status: "missing_config", message: `Set ${envName} to enable this premium connector.` };
}

function pick(value: unknown, keys: string[]) {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Object.fromEntries(keys.map((key) => [key, record[key]]).filter(([, item]) => item !== undefined));
}

function compactDataForSeo(value: unknown) {
  const record = value as any;
  return {
    status_code: record?.status_code,
    status_message: record?.status_message,
    tasks_count: record?.tasks_count,
    cost: record?.cost,
  };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}
