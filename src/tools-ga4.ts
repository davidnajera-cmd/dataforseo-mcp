import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ga4Get, ga4Post, resolvePropertyId } from "./ga4-client.js";
import { GA4_CONVERSION_EVENT_NAMES, ga4AndExpression, ga4ExactStringExpression, ga4HostNameExpression, ga4InListExpression } from "./ga4-site-filters.js";

function formatResult(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

const dateRangeSchema = z.object({
  startDate: z.string().describe("Start date, e.g. 2026-04-01, 30daysAgo, or yesterday"),
  endDate: z.string().describe("End date, e.g. 2026-04-28, today, or yesterday"),
});

const metricSchema = z.object({ name: z.string() });
const dimensionSchema = z.object({ name: z.string() });

export function registerGa4Tools(server: McpServer) {
  server.tool(
    "ga4_get_account_summaries",
    "List Google Analytics accounts and GA4 properties available to the authenticated Google user.",
    {},
    async () => {
      const result = await ga4Get("/accountSummaries");
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "ga4_get_property_details",
    "Get GA4 property metadata from the Google Analytics Admin API.",
    {
      property_id: z.string().optional().describe("GA4 property ID. Uses GA4_PROPERTY_ID if omitted."),
    },
    async ({ property_id }) => {
      const result = await ga4Get(`/${await resolvePropertyId(property_id)}`);
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "ga4_list_google_ads_links",
    "List Google Ads links configured for a GA4 property.",
    {
      property_id: z.string().optional().describe("GA4 property ID. Uses GA4_PROPERTY_ID if omitted."),
    },
    async ({ property_id }) => {
      const result = await ga4Get(`/${await resolvePropertyId(property_id)}/googleAdsLinks`);
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "ga4_get_custom_dimensions_and_metrics",
    "List custom dimensions and custom metrics for a GA4 property.",
    {
      property_id: z.string().optional().describe("GA4 property ID. Uses GA4_PROPERTY_ID if omitted."),
    },
    async ({ property_id }) => {
      const property = await resolvePropertyId(property_id);
      const [dimensions, metrics] = await Promise.all([
        ga4Get(`/${property}/customDimensions`),
        ga4Get(`/${property}/customMetrics`),
      ]);
      return { content: [{ type: "text" as const, text: formatResult({ dimensions, metrics }) }] };
    }
  );

  server.tool(
    "ga4_run_report",
    "Run a GA4 Data API report. Use this for organic sessions, landing pages, conversions, programs, countries, and channels.",
    {
      property_id: z.string().optional().describe("GA4 property ID. Uses GA4_PROPERTY_ID if omitted."),
      date_ranges: z.array(dateRangeSchema).optional(),
      metrics: z.array(metricSchema).describe("GA4 metrics, e.g. sessions, totalUsers, conversions, eventCount"),
      dimensions: z.array(dimensionSchema).optional().describe("GA4 dimensions, e.g. landingPagePlusQueryString, sessionDefaultChannelGroup"),
      dimension_filter: z.record(z.string(), z.unknown()).optional(),
      metric_filter: z.record(z.string(), z.unknown()).optional(),
      order_bys: z.array(z.record(z.string(), z.unknown())).optional(),
      limit: z.number().optional(),
    },
    async ({ property_id, date_ranges, metrics, dimensions, dimension_filter, metric_filter, order_bys, limit }) => {
      const result = await ga4Post(`/${await resolvePropertyId(property_id)}:runReport`, {
        dateRanges: date_ranges ?? [{ startDate: "30daysAgo", endDate: "today" }],
        metrics,
        dimensions,
        dimensionFilter: dimension_filter,
        metricFilter: metric_filter,
        orderBys: order_bys,
        limit: limit ?? 1000,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "ga4_run_realtime_report",
    "Run a GA4 realtime report for current active users and live dimensions.",
    {
      property_id: z.string().optional().describe("GA4 property ID. Uses GA4_PROPERTY_ID if omitted."),
      metrics: z.array(metricSchema).optional(),
      dimensions: z.array(dimensionSchema).optional(),
      limit: z.number().optional(),
    },
    async ({ property_id, metrics, dimensions, limit }) => {
      const result = await ga4Post(`/${await resolvePropertyId(property_id)}:runRealtimeReport`, {
        metrics: metrics ?? [{ name: "activeUsers" }],
        dimensions,
        limit: limit ?? 100,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "ga4_organic_landing_pages",
    "SEO workflow: organic sessions and clean SEO conversions by landing page from GA4. Conversions are computed from whitelisted event names instead of the historical GA4 conversions metric. Pass host_name when the property mixes multiple domains or hostnames.",
    {
      property_id: z.string().optional(),
      start_date: z.string().optional(),
      end_date: z.string().optional(),
      limit: z.number().optional(),
      host_name: z.string().optional().describe("Optional hostname filter, e.g. dnamusic.edu.co. Recommended when the GA4 property mixes multiple hosts."),
    },
    async ({ property_id, start_date, end_date, limit, host_name }) => {
      const property = await resolvePropertyId(property_id);
      const baseFilter = ga4AndExpression(
        ga4ExactStringExpression("sessionDefaultChannelGroup", "Organic Search"),
        host_name ? ga4HostNameExpression(host_name) : undefined
      );

      const [sessionsResult, conversionsResult] = await Promise.all([
        ga4Post(`/${property}:runReport`, {
          dateRanges: [{ startDate: start_date ?? "30daysAgo", endDate: end_date ?? "today" }],
          dimensions: [{ name: "landingPagePlusQueryString" }],
          metrics: [{ name: "sessions" }, { name: "engagementRate" }],
          dimensionFilter: baseFilter,
          orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
          limit: limit ?? 50,
        }) as Promise<{ rows?: Array<{ dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }> }>,
        ga4Post(`/${property}:runReport`, {
          dateRanges: [{ startDate: start_date ?? "30daysAgo", endDate: end_date ?? "today" }],
          dimensions: [{ name: "landingPagePlusQueryString" }],
          metrics: [{ name: "eventCount" }],
          dimensionFilter: ga4AndExpression(
            baseFilter,
            ga4InListExpression("eventName", GA4_CONVERSION_EVENT_NAMES)
          ),
          orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
          limit: limit ?? 50,
        }) as Promise<{ rows?: Array<{ dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }> }>,
      ]);

      const conversionMap = new Map(
        (conversionsResult.rows ?? []).map((row) => [
          row.dimensionValues?.[0]?.value ?? "(unknown)",
          Number(row.metricValues?.[0]?.value ?? 0),
        ])
      );

      const rows = (sessionsResult.rows ?? []).map((row) => {
        const landingPage = row.dimensionValues?.[0]?.value ?? "(unknown)";
        return {
          landing_page: landingPage,
          sessions: Number(row.metricValues?.[0]?.value ?? 0),
          conversions: conversionMap.get(landingPage) ?? 0,
          engagement_rate: Number(row.metricValues?.[1]?.value ?? 0),
        };
      });

      return {
        content: [{
          type: "text" as const,
          text: formatResult({
            property,
            host_name: host_name ?? null,
            start_date: start_date ?? "30daysAgo",
            end_date: end_date ?? "today",
            conversion_event_names: GA4_CONVERSION_EVENT_NAMES,
            rows,
          }),
        }],
      };
    }
  );
}
