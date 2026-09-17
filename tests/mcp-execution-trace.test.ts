import assert from "node:assert/strict";
import test from "node:test";
import { redactExecutionArguments, summarizeExecutionOutcome } from "../src/mcp-execution-trace.js";

test("redacts secrets before trace persistence", () => {
  assert.deepEqual(redactExecutionArguments({ url: "https://example.com", api_key: "secret", nested: { authorization: "Bearer value" } }), {
    url: "https://example.com", api_key: "[REDACTED]", nested: { authorization: "[REDACTED]" },
  });
});

test("summarizes outcomes without persisting provider payloads", () => {
  assert.deepEqual(summarizeExecutionOutcome({ rows: [1, 2, 3], nextPage: "cursor" }), { kind: "object", keys: ["nextPage", "rows"], array_lengths: { rows: 3 } });
});
