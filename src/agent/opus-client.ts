import Anthropic from "@anthropic-ai/sdk";
import { getRuntimeVariable } from "../runtime-config.js";

let cached: Anthropic | null = null;

async function getClient(): Promise<Anthropic> {
  if (cached) return cached;
  const key = await getRuntimeVariable("ANTHROPIC_API_KEY");
  if (!key) throw new Error("ANTHROPIC_API_KEY is required");
  cached = new Anthropic({ apiKey: key });
  return cached;
}

export type OpusResponse = {
  text: string;
  usage: { input_tokens: number; output_tokens: number };
  cost_usd: number;
};

export async function opusChat(systemPrompt: string, userPrompt: string, options: { max_tokens?: number } = {}): Promise<OpusResponse> {
  const client = await getClient();
  const response = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: options.max_tokens ?? 8000,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });
  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => (block as { type: "text"; text: string }).text)
    .join("\n");
  const input = response.usage.input_tokens;
  const output = response.usage.output_tokens;
  // claude-opus-4-7 pricing: $15/M input, $75/M output
  const cost_usd = (input * 15 + output * 75) / 1_000_000;
  return { text, usage: { input_tokens: input, output_tokens: output }, cost_usd };
}
