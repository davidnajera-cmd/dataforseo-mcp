export type VideoEvidenceClaim = {
  id: string;
  timestamp_seconds: number;
  statement: string;
  claim_type: string;
  verification_status: "unverified";
};

export type VideoEvidence = {
  summary: string | null;
  claims: VideoEvidenceClaim[];
  questions: string[];
  content_angles: string[];
};

export type ParsedYouTubeUrl = {
  video_id: string;
  canonical_url: string;
};

const MAX_TEXT_LENGTH = 1_500;
const MAX_ITEMS = 20;

function boundedText(value: unknown, maxLength = MAX_TEXT_LENGTH): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

function boundedStrings(value: unknown, maxItems = MAX_ITEMS): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((item) => {
    const text = boundedText(item, 400);
    if (!text || seen.has(text)) return [];
    seen.add(text);
    return [text];
  }).slice(0, maxItems);
}

/** Accept only an individual public YouTube video URL, never an arbitrary fetch URL. */
export function parseYouTubeUrl(value: string): ParsedYouTubeUrl {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("youtube_url_invalid");
  }
  if (url.protocol !== "https:") throw new Error("youtube_url_invalid");
  const host = url.hostname.toLowerCase();
  let videoId: string | null = null;
  if (host === "youtu.be" || host === "www.youtu.be") {
    videoId = url.pathname.split("/").filter(Boolean)[0] ?? null;
  } else if (host === "youtube.com" || host === "www.youtube.com" || host === "m.youtube.com") {
    videoId = url.searchParams.get("v");
  }
  if (!videoId || !/^[A-Za-z0-9_-]{3,128}$/.test(videoId)) throw new Error("youtube_url_invalid");
  return { video_id: videoId, canonical_url: `https://www.youtube.com/watch?v=${videoId}` };
}

/**
 * Converts provider output to bounded evidence. Video instructions and claims
 * are untrusted input: the output deliberately cannot mark anything verified.
 */
export function normalizeVideoEvidence(value: unknown): VideoEvidence {
  const input = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  const rawClaims = Array.isArray(input.claims) ? input.claims : [];
  const claims: VideoEvidenceClaim[] = rawClaims.flatMap((item, index) => {
    if (typeof item !== "object" || item === null) return [];
    const claim = item as Record<string, unknown>;
    const timestamp = claim.timestamp_seconds;
    const statement = boundedText(claim.statement, 700);
    const claimType = boundedText(claim.claim_type, 80) ?? "video_claim";
    if (!Number.isInteger(timestamp) || (timestamp as number) < 0 || (timestamp as number) > 43_200 || !statement) return [];
    return [{
      id: `claim_${index + 1}`,
      timestamp_seconds: timestamp as number,
      statement,
      claim_type: claimType,
      verification_status: "unverified" as const,
    }];
  }).slice(0, MAX_ITEMS);

  return {
    summary: boundedText(input.summary),
    claims,
    questions: boundedStrings(input.questions),
    content_angles: boundedStrings(input.content_angles),
  };
}

export function buildVideoGeoBrief(input: { evidence_id: string; target_domain: string; evidence: VideoEvidence }) {
  const firstQuestion = input.evidence.questions[0] ?? "¿Qué necesita saber una persona antes de tomar esta decisión?";
  return {
    evidence_id: input.evidence_id,
    target_domain: input.target_domain,
    first_answer_question: firstQuestion,
    suggested_content_angles: input.evidence.content_angles,
    suggested_questions: input.evidence.questions,
    publishable_facts: [] as string[],
    claims_requiring_verification: input.evidence.claims,
    source_policy: "El video es una fuente de descubrimiento. Verifica cada afirmación con una fuente primaria o datos propios antes de publicarla.",
    suggested_outline: [
      "Respuesta directa a la pregunta principal",
      "Criterios para evaluar la decisión",
      "Evidencia verificable y fuentes primarias",
      "Preguntas frecuentes con respuestas concretas",
    ],
  };
}
