import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { clarityRequest } from "./clarity-client.js";

function formatResult(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

const dimensionEnum = z.enum([
  "Browser",
  "Device",
  "Country",
  "OS",
  "Source",
  "Medium",
  "Campaign",
  "Channel",
  "URL",
]);

export function registerClarityTools(server: McpServer) {
  // ============================================================
  // CLARITY DATA EXPORT API
  // ============================================================

  server.tool(
    "clarity_live_insights",
    "Get Microsoft Clarity dashboard data (traffic, engagement, dead clicks, rage clicks, scroll depth, etc.) with up to 3 custom dimensions. Dimensions: Browser, Device, Country, OS, Source, Medium, Campaign, Channel, URL. Max 10 requests/project/day.",
    {
      num_of_days: z
        .enum(["1", "2", "3"])
        .describe("Number of days to export (1=last 24h, 2=last 48h, 3=last 72h)"),
      dimension1: dimensionEnum.optional().describe("First breakdown dimension"),
      dimension2: dimensionEnum.optional().describe("Second breakdown dimension"),
      dimension3: dimensionEnum.optional().describe("Third breakdown dimension"),
    },
    async ({ num_of_days, dimension1, dimension2, dimension3 }) => {
      const params: Record<string, string> = { numOfDays: num_of_days };
      if (dimension1) params.dimension1 = dimension1;
      if (dimension2) params.dimension2 = dimension2;
      if (dimension3) params.dimension3 = dimension3;
      const result = await clarityRequest("/project-live-insights", params);
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "clarity_traffic_overview",
    "Get Microsoft Clarity traffic overview for the last 1-3 days without dimension breakdowns. Returns total sessions, bot sessions, users, pages per session, engagement metrics, dead clicks, rage clicks, scroll depth, and more.",
    {
      num_of_days: z
        .enum(["1", "2", "3"])
        .optional()
        .describe("Number of days (1=24h, 2=48h, 3=72h). Default: 1"),
    },
    async ({ num_of_days }) => {
      const result = await clarityRequest("/project-live-insights", {
        numOfDays: num_of_days ?? "1",
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "clarity_traffic_by_source",
    "Get Microsoft Clarity traffic broken down by Source, Medium, and Campaign. Useful for understanding which marketing channels drive traffic and engagement.",
    {
      num_of_days: z
        .enum(["1", "2", "3"])
        .optional()
        .describe("Number of days (1=24h, 2=48h, 3=72h). Default: 1"),
    },
    async ({ num_of_days }) => {
      const result = await clarityRequest("/project-live-insights", {
        numOfDays: num_of_days ?? "1",
        dimension1: "Source",
        dimension2: "Medium",
        dimension3: "Campaign",
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "clarity_traffic_by_device",
    "Get Microsoft Clarity traffic broken down by Device, Browser, and OS. Useful for understanding which devices and browsers your users prefer.",
    {
      num_of_days: z
        .enum(["1", "2", "3"])
        .optional()
        .describe("Number of days (1=24h, 2=48h, 3=72h). Default: 1"),
    },
    async ({ num_of_days }) => {
      const result = await clarityRequest("/project-live-insights", {
        numOfDays: num_of_days ?? "1",
        dimension1: "Device",
        dimension2: "Browser",
        dimension3: "OS",
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "clarity_traffic_by_page",
    "Get Microsoft Clarity traffic broken down by URL (page). Useful for identifying top pages, engagement per page, and UX issues on specific pages.",
    {
      num_of_days: z
        .enum(["1", "2", "3"])
        .optional()
        .describe("Number of days (1=24h, 2=48h, 3=72h). Default: 1"),
    },
    async ({ num_of_days }) => {
      const result = await clarityRequest("/project-live-insights", {
        numOfDays: num_of_days ?? "1",
        dimension1: "URL",
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "clarity_traffic_by_country",
    "Get Microsoft Clarity traffic broken down by Country/Region. Useful for geo-analysis of traffic, engagement, and UX metrics.",
    {
      num_of_days: z
        .enum(["1", "2", "3"])
        .optional()
        .describe("Number of days (1=24h, 2=48h, 3=72h). Default: 1"),
    },
    async ({ num_of_days }) => {
      const result = await clarityRequest("/project-live-insights", {
        numOfDays: num_of_days ?? "1",
        dimension1: "Country",
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "clarity_traffic_by_channel",
    "Get Microsoft Clarity traffic broken down by Channel (organic, paid, social, referral, direct, etc.). Useful for channel performance comparison.",
    {
      num_of_days: z
        .enum(["1", "2", "3"])
        .optional()
        .describe("Number of days (1=24h, 2=48h, 3=72h). Default: 1"),
    },
    async ({ num_of_days }) => {
      const result = await clarityRequest("/project-live-insights", {
        numOfDays: num_of_days ?? "1",
        dimension1: "Channel",
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );
}
