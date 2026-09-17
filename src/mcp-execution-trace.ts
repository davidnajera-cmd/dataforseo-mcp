import { createHash } from "node:crypto";

const SECRET_KEY = /(?:api[_-]?key|authorization|token|secret|password|cookie)/i;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

export function normalizeIdempotencyKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return IDEMPOTENCY_KEY.test(normalized) ? normalized : null;
}

export function executionRequestFingerprint(value: unknown): string {
  return createHash("sha256").update(stableJson(redactExecutionArguments(value))).digest("hex");
}

export function idempotencyKeyFingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** A trace may reference an internal key row, never a raw key or key hash. */
export function normalizeTraceActorKeyId(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function executionTraceFinalState(statusCode: number): { status: "completed" } | { status: "failed"; error_code: string } {
  return statusCode >= 200 && statusCode < 400
    ? { status: "completed" }
    : { status: "failed", error_code: `http_${statusCode}` };
}

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

function stableJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(",")}}`;
  }
  return JSON.stringify(null);
}
