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
  try {
    return JSON.parse(content) as T;
  } catch (e) {
    throw new Error(
      "Failed to parse SiliconFlow JSON response: " +
        (e as Error).message +
        " raw=" +
        content
    );
  }
}
