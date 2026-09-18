import assert from "node:assert/strict";
import test from "node:test";
import {
  buildVideoGeoBrief,
  normalizeVideoEvidence,
  parseYouTubeUrl,
} from "../src/video-evidence.js";

test("accepts only canonical public YouTube video URLs", () => {
  assert.equal(parseYouTubeUrl("https://www.youtube.com/watch?v=abc123").video_id, "abc123");
  assert.equal(parseYouTubeUrl("https://youtu.be/abc123?t=30").canonical_url, "https://www.youtube.com/watch?v=abc123");
  assert.throws(() => parseYouTubeUrl("https://example.com/video"), /youtube_url_invalid/);
  assert.throws(() => parseYouTubeUrl("http://localhost:3000/watch?v=abc"), /youtube_url_invalid/);
});

test("normalizes model output into bounded, explicitly unverified video evidence", () => {
  const evidence = normalizeVideoEvidence({
    summary: "A creator discusses how prospective students choose a music school.",
    claims: [
      { timestamp_seconds: 42, statement: "Most students choose on price.", claim_type: "market_claim" },
      { timestamp_seconds: -1, statement: "invalid timestamp", claim_type: "fact" },
    ],
    questions: ["¿Cuánto cuesta estudiar producción musical?"],
    content_angles: ["Cómo comparar escuelas de producción musical"],
  });

  assert.equal(evidence.claims.length, 1);
  assert.equal(evidence.claims[0].verification_status, "unverified");
  assert.equal(evidence.claims[0].timestamp_seconds, 42);
  assert.equal(evidence.questions[0], "¿Cuánto cuesta estudiar producción musical?");
});

test("creates a GEO brief without promoting video claims to publishable facts", () => {
  const evidence = normalizeVideoEvidence({
    claims: [{ timestamp_seconds: 10, statement: "The program has the best outcomes.", claim_type: "market_claim" }],
    questions: ["¿Cómo elegir una escuela de música?"],
    content_angles: ["Guía para comparar programas musicales"],
  });
  const brief = buildVideoGeoBrief({
    evidence_id: "video_123",
    target_domain: "dnamusic.edu.co",
    evidence,
  });

  assert.deepEqual(brief.publishable_facts, []);
  assert.equal(brief.claims_requiring_verification.length, 1);
  assert.equal(brief.claims_requiring_verification[0].verification_status, "unverified");
  assert.equal(brief.first_answer_question, "¿Cómo elegir una escuela de música?");
});
