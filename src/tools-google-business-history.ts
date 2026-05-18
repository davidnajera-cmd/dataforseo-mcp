import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  backfillGoogleBusinessFromZernio,
  getGoogleBusinessSnapshotSummary,
  listGoogleBusinessAccounts,
  listGoogleBusinessBackfillRuns,
  listGoogleBusinessKeywordHistory,
  listGoogleBusinessLocationHistory,
  listGoogleBusinessPerformanceHistory,
  listGoogleBusinessReviews,
} from "./google-business-store.js";

function formatResult(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export function registerGoogleBusinessHistoryTools(server: McpServer) {
  server.tool(
    "gbp_backfill_now",
    "Run a Google Business backfill from Zernio into Postgres. Persists accounts, locations, reviews, media, place actions, services, attributes, performance, and search keywords.",
    {
      snapshot_date: z.string().optional().describe("YYYY-MM-DD. Defaults to today UTC."),
      max_reviews_per_location: z.number().int().min(1).max(500).optional().describe("Safety cap for reviews fetched per location. Default 100."),
    },
    async ({ snapshot_date, max_reviews_per_location }) => {
      const result = await backfillGoogleBusinessFromZernio({
        snapshotDate: snapshot_date,
        maxReviewsPerLocation: max_reviews_per_location ?? 100,
      });
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "gbp_backfill_runs_list",
    "List recent Google Business backfill runs, including status, stats, and errors.",
    {
      limit: z.number().int().positive().max(100).optional(),
    },
    async ({ limit }) => {
      const rows = await listGoogleBusinessBackfillRuns(limit ?? 20);
      return { content: [{ type: "text" as const, text: formatResult({ runs: rows }) }] };
    }
  );

  server.tool(
    "gbp_history_summary",
    "Summarize what Google Business data is already persisted in the database for a snapshot date.",
    {
      snapshot_date: z.string().optional().describe("YYYY-MM-DD. Defaults to today UTC."),
    },
    async ({ snapshot_date }) => {
      const summary = await getGoogleBusinessSnapshotSummary(snapshot_date);
      return { content: [{ type: "text" as const, text: formatResult(summary) }] };
    }
  );

  server.tool(
    "gbp_history_accounts",
    "List persisted Google Business accounts currently known in the database.",
    {},
    async () => {
      const rows = await listGoogleBusinessAccounts();
      return { content: [{ type: "text" as const, text: formatResult({ total: rows.length, rows }) }] };
    }
  );

  server.tool(
    "gbp_history_locations",
    "List persisted Google Business location snapshots over time.",
    {
      location_id: z.string().optional(),
      account_id: z.string().optional(),
      days: z.number().int().positive().max(3650).optional().describe("Default 90."),
    },
    async ({ location_id, account_id, days }) => {
      const rows = await listGoogleBusinessLocationHistory({ location_id, account_id, days });
      return { content: [{ type: "text" as const, text: formatResult({ total: rows.length, rows }) }] };
    }
  );

  server.tool(
    "gbp_history_reviews",
    "Query persisted Google Business reviews from the database by location/account/rating/replied status.",
    {
      location_id: z.string().optional(),
      account_id: z.string().optional(),
      min_rating: z.number().int().min(1).max(5).optional(),
      max_rating: z.number().int().min(1).max(5).optional(),
      replied: z.boolean().optional(),
      limit: z.number().int().positive().max(500).optional().describe("Default 100."),
    },
    async ({ location_id, account_id, min_rating, max_rating, replied, limit }) => {
      const rows = await listGoogleBusinessReviews({ location_id, account_id, min_rating, max_rating, replied, limit });
      return { content: [{ type: "text" as const, text: formatResult({ total: rows.length, rows }) }] };
    }
  );

  server.tool(
    "gbp_history_performance",
    "Read persisted Google Business performance snapshots from the database.",
    {
      account_id: z.string().optional(),
      days: z.number().int().positive().max(3650).optional().describe("Default 120."),
    },
    async ({ account_id, days }) => {
      const rows = await listGoogleBusinessPerformanceHistory({ account_id, days });
      return { content: [{ type: "text" as const, text: formatResult({ total: rows.length, rows }) }] };
    }
  );

  server.tool(
    "gbp_history_keywords",
    "Read persisted Google Business search keyword snapshots from the database.",
    {
      account_id: z.string().optional(),
      days: z.number().int().positive().max(3650).optional().describe("Default 120."),
    },
    async ({ account_id, days }) => {
      const rows = await listGoogleBusinessKeywordHistory({ account_id, days });
      return { content: [{ type: "text" as const, text: formatResult({ total: rows.length, rows }) }] };
    }
  );
}
