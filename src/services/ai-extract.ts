import { siliconflowChatJSON } from "@/src/lib/siliconflow";

export interface ExtractedTx {
  date: string; // YYYY-MM-DD
  description: string;
  amount: number; // positive expense negative income? we will infer sign field
  currency?: string;
  merchant?: string;
  type?: "expense" | "income";
  category?: string;
  categoryScore?: number;
}

export interface ExtractOptions {
  model?: string;
  hintLanguage?: "zh" | "en";
}

const SYSTEM_PROMPT = `你是一个智能账单/流水解析与分类助手。用户会给出任意格式的文本（可能是 PDF OCR 行、Excel 原始表格转为文本、混合中英文）。\n任务：识别交易并为每条交易分类。\n输出严格 JSON：{ "transactions": [ { "date": "YYYY-MM-DD", "description": string, "merchant": string|null, "amount": number, "currency": string|null, "type": "expense"|"income", "category": string, "categoryScore": number } ] }。\n分类使用常见消费分类（示例: 餐饮, 交通出行, 日用品, 娱乐, 医疗, 教育, 住房, 通讯, 服饰, 旅行, 网购, 其他）。\n规则：\n1. date 必须是 YYYY-MM-DD。不确定则跳过该行。\n2. amount：支出为正数；若原始金额有+/-判断收入支出，收入标记 type=income。\n3. currency 若出现 人民币, RMB, 元 统一为 CNY。缺省时设为 CNY。\n4. categoryScore 范围 0-1，表示分类置信度。无法判断时给 0.4 且 category=其他。\n5. 合并多余空格，description 保留原意即可。\n6. 只输出 JSON，不要任何解释文字。`;

export async function aiExtractTransactionsFromText(
  raw: string,
  options: ExtractOptions = {}
) {
  const model = options.model || "Qwen/Qwen3-32B";
  const json = await siliconflowChatJSON<{ transactions?: ExtractedTx[] }>({
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: raw },
    ],
    temperature: 0.1,
    max_tokens: 102400,
  });
  const list = (json.transactions || []).filter(
    (t) => t.date && t.description && typeof t.amount === "number"
  );
  return list.map((t) => ({
    ...t,
    currency: t.currency ? normalizeCurrency(t.currency) : "CNY",
    type: t.type === "income" ? "income" : "expense",
    category: t.category || "其他",
    categoryScore: typeof t.categoryScore === "number" ? t.categoryScore : 0.5,
  }));
}

function normalizeCurrency(c: string) {
  const u = c.toUpperCase();
  if (["RMB", "CNY", "¥", "元"].includes(u)) return "CNY";
  return u;
}
