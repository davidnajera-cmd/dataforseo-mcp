const SECRET_KEY = /(?:api[_-]?key|authorization|token|secret|password|cookie)/i;

export function redactExecutionArguments(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactExecutionArguments);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) => [
    key,
    SECRET_KEY.test(key) ? "[REDACTED]" : redactExecutionArguments(child),
  ]));
}

export function summarizeExecutionOutcome(value: unknown): { kind: string; keys: string[]; array_lengths: Record<string, number> } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { kind: Array.isArray(value) ? "array" : typeof value, keys: [], array_lengths: {} };
  const record = value as Record<string, unknown>;
  return {
    kind: "object",
    keys: Object.keys(record).sort(),
    array_lengths: Object.fromEntries(Object.entries(record).filter(([, child]) => Array.isArray(child)).map(([key, child]) => [key, (child as unknown[]).length])),
  };
}
