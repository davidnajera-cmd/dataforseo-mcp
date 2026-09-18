import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { analyzeYouTubeVideoWithGemini } from "./gemini-video-client.js";
import { getMcpVideoEvidence, saveMcpVideoEvidence } from "./persistence-store.js";
import { buildVideoGeoBrief, normalizeVideoEvidence, parseYouTubeUrl, type VideoEvidence } from "./video-evidence.js";

function result(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}

/** Video-derived ideas stay evidence, never automatic skills or publishable facts. */
export function registerVideoEvidenceTools(server: McpServer, actorKeyId?: number) {
  server.tool(
    "video_evidence_analyze",
    "Analyze one public YouTube video through Gemini for SEO/GEO discovery. Returns timestamped, explicitly UNVERIFIED evidence and stores only its bounded structured analysis. This is a paid/preview provider dispatch: call mcp_tool_preflight first and send x-mcp-idempotency-key. Never publish video-derived claims without independent verification.",
    {
      youtube_url: z.string().url().describe("Public YouTube watch or youtu.be URL. Private, unlisted, channel, playlist, and non-YouTube URLs are rejected."),
      purpose: z.enum(["seo_geo", "competitive_research", "sales", "content"]).describe("Why the evidence is being collected."),
      language: z.string().min(2).max(16).optional().describe("Preferred output language, default es."),
      include_visual_analysis: z.boolean().optional().describe("Use Gemini agentic visual analysis when useful. Default false."),
    },
    async ({ youtube_url, purpose, language, include_visual_analysis }) => {
      if (!actorKeyId) throw new Error("video_evidence_actor_required");
      const source = parseYouTubeUrl(youtube_url);
      const provider = await analyzeYouTubeVideoWithGemini({
        youtube_url: source.canonical_url,
        language,
        include_visual_analysis,
      });
      const evidence = normalizeVideoEvidence(provider.analysis);
      const evidenceId = `video_${randomUUID()}`;
      await saveMcpVideoEvidence({
        id: evidenceId,
        actor_key_id: actorKeyId,
        source_url: source.canonical_url,
        purpose,
        language: language ?? null,
        model: provider.model,
        evidence,
      });
      return result({
        evidence_id: evidenceId,
        source_url: source.canonical_url,
        purpose,
        model: provider.model,
        verification_required: true,
        evidence,
        next_step: "Use video_geo_brief to convert discovery signals into a verification-first GEO content brief.",
      });
    }
  );

  server.tool(
    "video_evidence_get",
    "Retrieve a prior video evidence record belonging to this same authenticated MCP integration. The record contains unverified source discoveries, not approved facts.",
    { evidence_id: z.string().regex(/^video_[0-9a-f-]{36}$/).describe("Evidence id returned by video_evidence_analyze.") },
    async ({ evidence_id }) => {
      if (!actorKeyId) throw new Error("video_evidence_actor_required");
      const record = await getMcpVideoEvidence(evidence_id, actorKeyId);
      if (!record) throw new Error("video_evidence_not_found");
      return result({ ...record, verification_required: true });
    }
  );

  server.tool(
    "video_geo_brief",
    "Create a verification-first GEO content brief from a saved video analysis. It never promotes video claims to publishable facts; instead it returns questions, angles, and a claim-verification queue.",
    {
      evidence_id: z.string().regex(/^video_[0-9a-f-]{36}$/),
      target_domain: z.string().min(3).max(253).describe("Domain this content may support, e.g. dnamusic.edu.co."),
    },
    async ({ evidence_id, target_domain }) => {
      if (!actorKeyId) throw new Error("video_evidence_actor_required");
      const record = await getMcpVideoEvidence(evidence_id, actorKeyId);
      if (!record) throw new Error("video_evidence_not_found");
      return result(buildVideoGeoBrief({
        evidence_id,
        target_domain: target_domain.toLowerCase(),
        evidence: record.evidence as VideoEvidence,
      }));
    }
  );
}
