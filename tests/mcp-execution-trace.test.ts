import assert from "node:assert/strict";
import test from "node:test";
import { executionTraceFinalState, executionRequestFingerprint, normalizeIdempotencyKey, normalizeTraceActorKeyId, redactExecutionArguments, summarizeExecutionOutcome } from "../src/mcp-execution-trace.js";

test("redacts secrets before trace persistence", () => {
  assert.deepEqual(redactExecutionArguments({ url: "https://example.com", api_key: "secret", nested: { authorization: "Bearer value" } }), {
    url: "https://example.com", api_key: "[REDACTED]", nested: { authorization: "[REDACTED]" },
  });
});

test("summarizes outcomes without persisting provider payloads", () => {
  assert.deepEqual(summarizeExecutionOutcome({ rows: [1, 2, 3], nextPage: "cursor" }), { kind: "object", keys: ["nextPage", "rows"], array_lengths: { rows: 3 } });
});

test("maps HTTP results to a safe terminal trace state", () => {
  assert.deepEqual(executionTraceFinalState(200), { status: "completed" });
  assert.deepEqual(executionTraceFinalState(403), { status: "failed", error_code: "http_403" });
  assert.deepEqual(executionTraceFinalState(503), { status: "failed", error_code: "http_503" });
});

test("only persists an internal positive API key identifier for trace attribution", () => {
  assert.equal(normalizeTraceActorKeyId(42), 42);
  assert.equal(normalizeTraceActorKeyId(0), null);
  assert.equal(normalizeTraceActorKeyId("dnamcp_raw_secret"), null);
});

test("normalizes idempotency keys and fingerprints equivalent requests deterministically", () => {
  assert.equal(normalizeIdempotencyKey("agent-run:2026-09-17:001"), "agent-run:2026-09-17:001");
  assert.equal(normalizeIdempotencyKey("short"), null);
  assert.equal(normalizeIdempotencyKey("invalid key with spaces"), null);
  assert.equal(
    executionRequestFingerprint({ method: "tools/call", params: { arguments: { b: 2, a: 1 } } }),
    executionRequestFingerprint({ params: { arguments: { a: 1, b: 2 } }, method: "tools/call" })
  );
});
