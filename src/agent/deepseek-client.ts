import { getRuntimeVariable } from "../runtime-config.js";

const BASE_URL = "https://api.deepseek.com/v1";

export type DeepSeekMessage = { role: "system" | "user" | "assistant"; content: string };

export type DeepSeekResponse = {
  text: string;
  usage: { input_tokens: number; output_tokens: number };
  cost_usd: number;
};

export async function deepseekChat(messages: DeepSeekMessage[], options: { temperature?: number; max_tokens?: number; json_mode?: boolean } = {}): Promise<DeepSeekResponse> {
  const apiKey = await getRuntimeVariable("DEEPSEEK_API_KEY");
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY is required");
  const body: Record<string, unknown> = {
    model: "deepseek-chat",
    messages,
    temperature: options.temperature ?? 0.2,
    max_tokens: options.max_tokens ?? 4096,
    stream: false,
  };
  if (options.json_mode) body.response_format = { type: "json_object" };
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`DeepSeek API error ${res.status}: ${await res.text()}`);
  const data = await res.json() as { choices: Array<{ message: { content: string } }>; usage: { prompt_tokens: number; completion_tokens: number } };
  const input = data.usage.prompt_tokens;
  const output = data.usage.completion_tokens;
  // deepseek-chat pricing: $0.14/M input, $0.28/M output (as of 2025)
  const cost_usd = (input * 0.14 + output * 0.28) / 1_000_000;
  return {
    text: data.choices[0]?.message?.content ?? "",
    usage: { input_tokens: input, output_tokens: output },
    cost_usd,
  };
}
