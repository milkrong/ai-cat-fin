import { env } from "@/src/lib/env";

// Minimal SiliconFlow API client for chat completions returning JSON content
export type SiliconFlowChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};
export interface SiliconFlowChatRequest {
  model: string; // e.g. "Qwen/Qwen2.5-7B-Instruct" or any deployed model
  messages: SiliconFlowChatMessage[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: string };
}

export async function siliconflowChatJSON<T = unknown>(
  req: Omit<SiliconFlowChatRequest, "response_format">
): Promise<T> {
  const apiKey = env.SILICONFLOW_API_KEY;
  if (!apiKey) throw new Error("Missing SILICONFLOW_API_KEY");
  const base = env.SILICONFLOW_BASE_URL || "https://api.siliconflow.cn";
  console.log("@@@", req);
  const r = await fetch(`${base}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ ...req, response_format: { type: "json_object" } }),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`SiliconFlow error ${r.status}: ${text}`);
  }
  const data = await r.json();
  const content: string | undefined = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("No content from SiliconFlow");
  console.log("raw content", content);
  // Attempt direct parse first
  const direct = tryParseJSON<T>(content);
  if (direct.ok) return direct.value as T;

  // Try to repair common truncation / quoting issues
  const repairedCandidates = buildRepairCandidates(content);
  for (const c of repairedCandidates) {
    const p = tryParseJSON<T>(c);
    if (p.ok) return p.value as T;
  }

  // As a last resort, attempt to extract a JSON substring heuristically
  const extracted = extractFirstJSONBlock(content);
  if (extracted) {
    const p = tryParseJSON<T>(extracted);
    if (p.ok) return p.value as T;
  }

  throw new Error(
    "Failed to parse SiliconFlow JSON response after repairs: " +
      direct.error +
      " raw=" +
      content.slice(0, 2000)
  );
}

// --- helpers --------------------------------------------------------------

function tryParseJSON<T>(
  text: string
): { ok: true; value: T } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

function buildRepairCandidates(original: string): string[] {
  const trimmed = original.trim();
  const candidates: string[] = [];
  // Remove potential leading junk before first '{'
  const firstBrace = trimmed.indexOf("{");
  if (firstBrace > 0) candidates.push(trimmed.slice(firstBrace));
  // If appears truncated: count braces
  const openBraces = (trimmed.match(/\{/g) || []).length;
  const closeBraces = (trimmed.match(/\}/g) || []).length;
  if (openBraces > closeBraces) {
    candidates.push(trimmed + "}".repeat(openBraces - closeBraces));
  }
  // Remove trailing incomplete JSON fragments after last closing brace
  const lastClose = trimmed.lastIndexOf("}");
  if (lastClose > -1 && lastClose < trimmed.length - 1) {
    candidates.push(trimmed.slice(0, lastClose + 1));
  }
  // Replace problematic fancy quotes
  candidates.push(trimmed.replace(/[“”]/g, '"'));
  // Deduplicate
  return [...new Set(candidates)].filter((c) => c.length > 0 && c !== original);
}

function extractFirstJSONBlock(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  // naive stack-based extraction
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null; // couldn't find balanced block
}
