import { siliconflowChatJSON } from "@/src/lib/siliconflow";

export interface ExtractedTx {
  date: string; // YYYY-MM-DD
  description: string;
  amount: number; // positive expense negative income? we will infer sign field
  currency?: string;
  merchant?: string;
  type?: "expense" | "income";
}

export interface ExtractOptions {
  model?: string;
  hintLanguage?: "zh" | "en";
}

const SYSTEM_PROMPT = `你是一个智能账单/流水解析助手。用户会给出任意格式的文本（可能是 PDF OCR 行、Excel 原始表格转为文本、混合中英文）。\n请识别其中的交易记录，输出 JSON：{ "transactions": [ { "date": "YYYY-MM-DD", "description": string, "merchant": string|null, "amount": number, "currency": string|null, "type": "expense"|"income" } ] }。\n规则：\n1. date 必须是 YYYY-MM-DD。无法确定则跳过该行。\n2. amount 使用数字，支出用正数（统一正数表示支出），收入标记 type=income。若原始金额有+/-按符号判断。\n3. currency 如果出现 人民币, RMB, 元 统一为 CNY。\n4. 合并同一行中的多余空格。\n5. 不要输出除 JSON 以外的任何文字。`;

export async function aiExtractTransactionsFromText(
  raw: string,
  options: ExtractOptions = {}
) {
  const model = options.model || "Qwen/Qwen2.5-7B-Instruct";
  const json = await siliconflowChatJSON<{ transactions?: ExtractedTx[] }>({
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: raw.slice(0, 25000) }, // truncate large input
    ],
    temperature: 0.1,
    max_tokens: 1200,
  });
  const list = (json.transactions || []).filter(
    (t) => t.date && t.description && typeof t.amount === "number"
  );
  return list.map((t) => ({
    ...t,
    currency: t.currency ? normalizeCurrency(t.currency) : "CNY",
    type: t.type === "income" ? "income" : "expense",
  }));
}

function normalizeCurrency(c: string) {
  const u = c.toUpperCase();
  if (["RMB", "CNY", "¥", "元"].includes(u)) return "CNY";
  return u;
}
