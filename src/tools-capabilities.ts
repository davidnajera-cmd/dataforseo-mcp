import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  listMcpCapabilities,
  preflightMcpToolCall,
  searchMcpCapabilities,
  type McpOperation,
} from "./mcp-capabilities.js";
import { getMcpExecutionStatus } from "./persistence-store.js";

function formatResult(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

const operationSchema = z.enum(["read", "write", "paid_dispatch", "workflow_run"]);

/** Safe discovery tools for agents before they invoke provider operations. */
export function registerCapabilityTools(server: McpServer, actorKeyId?: number) {
  server.tool(
    "mcp_capabilities_list",
    "List the MCP tools with their operation type, required capability scope, approval requirement, freshness, idempotency, and cost tier. Use before designing a workflow.",
    { operation: operationSchema.optional() },
    async ({ operation }) => ({
      content: [{ type: "text" as const, text: formatResult({ capabilities: listMcpCapabilities({ operation: operation as McpOperation | undefined }) }) }],
    })
  );

  server.tool(
    "mcp_capabilities_search",
    "Search MCP capabilities by tool name, provider, operation, or required scope. This is read-only and does not call a provider.",
    { query: z.string().min(1).max(120) },
    async ({ query }) => ({
      content: [{ type: "text" as const, text: formatResult({ capabilities: searchMcpCapabilities(query) }) }],
    })
  );

  server.tool(
    "mcp_tool_preflight",
    "Preview a tool call's required capability, approval gate, idempotency, freshness, and cost tier before invoking it. capability_scopes are the scopes the calling agent believes it has; the endpoint remains authoritative.",
    { tool: z.string().min(1).max(160), capability_scopes: z.array(z.string().min(1).max(80)).max(30).default([]) },
    async ({ tool, capability_scopes }) => ({
      content: [{ type: "text" as const, text: formatResult(preflightMcpToolCall(tool, capability_scopes)) }],
    })
  );

  server.tool(
    "mcp_execution_status",
    "Read the safe lifecycle status of an MCP execution trace created by this same integration. Use after a network interruption instead of retrying a non-idempotent operation.",
    { trace_id: z.string().uuid() },
    async ({ trace_id }) => {
      if (!actorKeyId) return {
        content: [{ type: "text" as const, text: formatResult({ error: "execution_status_unavailable" }) }],
        isError: true,
      };
      try {
        const status = await getMcpExecutionStatus(trace_id, actorKeyId);
        if (!status) return {
          content: [{ type: "text" as const, text: formatResult({ error: "execution_trace_not_found" }) }],
          isError: true,
        };
        return { content: [{ type: "text" as const, text: formatResult(status) }] };
      } catch {
        return {
          content: [{ type: "text" as const, text: formatResult({ error: "execution_status_unavailable" }) }],
          isError: true,
        };
      }
    }
  );
}
