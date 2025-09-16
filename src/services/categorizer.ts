import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { siliconflowChatJSON } from "@/src/lib/siliconflow";

export type CategorizerProvider = "OPENAI" | "COZE" | "DIFY" | "RULES" | "SILICONFLOW";

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function categorizeDescription(
  description: string,
  merchant: string | null,
  provider: CategorizerProvider,
): Promise<{ category: string; score: number }> {
  if (provider === "RULES") {
    const text = `${merchant ?? ""} ${description}`.toLowerCase();
    if (/(uber|滴滴|taxi|出行)/.test(text)) return { category: "交通出行", score: 0.7 };
    if (/(starbucks|咖啡|luckin|瑞幸)/.test(text)) return { category: "餐饮", score: 0.7 };
    if (/(taobao|tmall|拼多多|jd|京东)/.test(text)) return { category: "网购", score: 0.7 };
    return { category: "其他", score: 0.3 };
  }

  if (provider === "OPENAI") {
    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      prompt:
        "你是记账助手。请只输出一个 JSON：{category: string, score: 0..1}。" +
        `描述:"${description}" 商户:"${merchant ?? ""}"。请用中文常见消费分类。`,
    });
    try {
      const parsed = JSON.parse(text.trim());
      return { category: parsed.category ?? "其他", score: Number(parsed.score ?? 0.5) };
    } catch {
      return { category: "其他", score: 0.4 };
    }
  }

  if (provider === "SILICONFLOW") {
    try {
      const json = await siliconflowChatJSON<{ category?: string; score?: number }>({
        model: "Qwen/Qwen2.5-7B-Instruct", // configurable later
        messages: [
          {
            role: "system",
            content:
              "你是一个中文记账助手。只输出JSON对象，不要多余文字。类别使用常见消费分类，如: 餐饮, 交通出行, 日用品, 娱乐, 医疗, 教育, 住房, 通讯, 服饰, 旅行, 网购, 其他。score 0-1 表示置信度。",
          },
          {
            role: "user",
            content: `描述: ${description}\n商户: ${merchant ?? ""}\n请返回 {"category": string, "score": number}`,
          },
        ],
        temperature: 0.2,
        max_tokens: 100,
      });
      return { category: json.category ?? "其他", score: Number(json.score ?? 0.5) };
    } catch {
      return { category: "其他", score: 0.4 };
    }
  }

  // Webhook to Coze/Dify could be implemented here
  return { category: "其他", score: 0.4 };
}

