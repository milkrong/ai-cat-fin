import { env } from "@/src/lib/env";

export type OpenRouterChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export interface OpenRouterChatRequest {
  model: string;
  messages: OpenRouterChatMessage[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: string };
}

export async function openrouterChatJSON<T = unknown>(
  req: Omit<OpenRouterChatRequest, "response_format">
): Promise<T> {
  const apiKey = env.OPENROUTER_API_KEY || env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENROUTER_API_KEY");

  const base = env.OPENROUTER_BASE_URL || "https://openrouter.ai/api";
  const response = await fetch(`${base}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": env.OPENROUTER_APP_URL || "http://localhost:3000",
      "X-Title": env.OPENROUTER_APP_NAME || "Smart Ledger",
    },
    body: JSON.stringify({ ...req, response_format: { type: "json_object" } }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenRouter error ${response.status}: ${text}`);
  }

  const data = await response.json();
  const content: string | undefined = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("No content from OpenRouter");

  const direct = tryParseJSON<T>(content);
  if (direct.ok) return direct.value;

  const repairedCandidates = buildRepairCandidates(content);
  for (const candidate of repairedCandidates) {
    const parsed = tryParseJSON<T>(candidate);
    if (parsed.ok) return parsed.value;
  }

  const extracted = extractFirstJSONBlock(content);
  if (extracted) {
    const parsed = tryParseJSON<T>(extracted);
    if (parsed.ok) return parsed.value;
  }

  throw new Error(
    "Failed to parse OpenRouter JSON response after repairs: " +
      direct.error +
      " raw=" +
      content.slice(0, 2000)
  );
}

function tryParseJSON<T>(
  text: string
): { ok: true; value: T } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "unknown_parse_error",
    };
  }
}

function buildRepairCandidates(original: string): string[] {
  const trimmed = original.trim();
  const candidates: string[] = [];
  const firstBrace = trimmed.indexOf("{");
  if (firstBrace > 0) candidates.push(trimmed.slice(firstBrace));

  const openBraces = (trimmed.match(/\{/g) || []).length;
  const closeBraces = (trimmed.match(/\}/g) || []).length;
  if (openBraces > closeBraces) {
    candidates.push(trimmed + "}".repeat(openBraces - closeBraces));
  }

  const lastClose = trimmed.lastIndexOf("}");
  if (lastClose > -1 && lastClose < trimmed.length - 1) {
    candidates.push(trimmed.slice(0, lastClose + 1));
  }

  candidates.push(trimmed.replace(/[“”]/g, '"'));
  return [...new Set(candidates)].filter((item) => item && item !== original);
}

function extractFirstJSONBlock(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (char === "{") depth++;
    if (char === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}
