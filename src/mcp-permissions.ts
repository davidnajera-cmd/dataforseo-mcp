/** Restricts connector keys to read-only operations unless explicitly elevated. */
const MUTATING_TOOL_NAME = /(?:^|_)(?:add|analyze|assign|backfill|cancel|cleanup|connect|create|delete|disconnect|enqueue|publish|remove|request|run|set|start|submit|sync|update|verify)(?:_|$)/;

export function isMutatingMcpTool(toolName: unknown): boolean {
  return typeof toolName === "string" && MUTATING_TOOL_NAME.test(toolName);
}

export function requestedMcpToolName(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const request = body as { method?: unknown; params?: { name?: unknown } };
  return request.method === "tools/call" && typeof request.params?.name === "string" ? request.params.name : undefined;
}
