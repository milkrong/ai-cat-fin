import { inngest } from "@/src/lib/inngest";
import { prisma } from "@/src/lib/db";
import pdf from "pdf-parse";
import { categorizeDescription } from "@/src/services/categorizer";
import { siliconflowChatJSON } from "@/src/lib/siliconflow";

type EventPayload = {
  name: "pdf/ingested";
  data: {
    userId: string;
    jobId: string;
    filename: string;
    fileBuffer: string; // base64
  };
};

export const parseAndCategorize = inngest.createFunction(
  { id: "parse-and-categorize" },
  { event: "pdf/ingested" },
  async ({ event, step }) => {
    const { userId, jobId, fileBuffer } = (event as unknown as EventPayload)
      .data;
    await prisma.importJob.update({
      where: { id: jobId },
      data: { status: "PROCESSING" },
    });

    const buffer = Buffer.from(fileBuffer, "base64");
    const result = await pdf(buffer);
    const lines = result.text
      .split(/\n+/)
      .map((v) => v.replace(/\s+/g, " ").trim())
      .filter(Boolean);

    // Regex for formats:
    // 1) 2025-01-02 Starbucks -23.50 CNY
    // 2) 2025/01/02 星巴克 -23.50 元
    // 3) 01月02日 星巴克 23.50 支出
    const regexes: RegExp[] = [
      /(\d{4}-\d{2}-\d{2})\s+(.+?)\s+(-?\d+[\.,]?\d*)\s*(CNY|USD|HKD|RMB|元)?/i,
      /(\d{4}\/\d{2}\/\d{2})\s+(.+?)\s+(-?\d+[\.,]?\d*)\s*(CNY|USD|HKD|RMB|元)?/i,
      /(\d{1,2})月(\d{1,2})日\s+(.+?)\s+(-?\d+[\.,]?\d*)/i,
    ];

    const parsed: Array<{
      occurredAt: Date;
      description: string;
      amount: number;
      currency: string;
      raw: string;
    }> = [];
    const leftover: string[] = [];

    for (const line of lines) {
      let matched = false;
      for (const r of regexes) {
        const m = line.match(r);
        if (m) {
          let occurredAt: Date;
          if (r === regexes[2]) {
            // month/day without year -> assume current year
            const year = new Date().getFullYear();
            const month = Number(m[1]);
            const day = Number(m[2]);
            occurredAt = new Date(
              `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(
                2,
                "0"
              )}`
            );
            const description = m[3];
            const amount = parseFloat(m[4].replace(",", ""));
            parsed.push({
              occurredAt,
              description,
              amount,
              currency: "CNY",
              raw: line,
            });
          } else {
            const dateStr = m[1];
            occurredAt = new Date(dateStr.replace(/\//g, "-"));
            const description = m[2];
            const amount = parseFloat(m[3].replace(",", ""));
            const currencyRaw = (m[4] ?? "CNY").toUpperCase();
            const currency =
              currencyRaw === "RMB" || currencyRaw === "元"
                ? "CNY"
                : currencyRaw;
            parsed.push({
              occurredAt,
              description,
              amount,
              currency,
              raw: line,
            });
          }
          matched = true;
          break;
        }
      }
      if (!matched) leftover.push(line);
    }

    // For leftover lines, attempt AI extraction in batch using SiliconFlow if key available
    if (leftover.length && process.env.SILICONFLOW_API_KEY) {
      const aiExtracted = await step.run("ai-extract-leftover", async () =>
        siliconflowChatJSON<{
          transactions?: Array<{
            date: string;
            description: string;
            amount: number;
            currency?: string;
          }>;
        }>({
          model: "Qwen/Qwen2.5-7B-Instruct",
          messages: [
            {
              role: "system",
              content:
                "你是OCR账单解析助手。用户提供若干行原始文本(可能是中文账单流水)。请识别消费记录，输出JSON: {transactions:[{date:'YYYY-MM-DD',description:string,amount:number,currency?:string}]}。忽略无关行。",
            },
            {
              role: "user",
              content: leftover.join("\n"),
            },
          ],
          temperature: 0,
          max_tokens: 800,
        })
      );
      for (const t of aiExtracted.transactions ?? []) {
        if (!t.date || !t.description || typeof t.amount !== "number") continue;
        const occurredAt = new Date(t.date);
        if (Number.isNaN(occurredAt.getTime())) continue;
        parsed.push({
          occurredAt,
          description: t.description,
          amount: t.amount,
          currency: (t.currency ?? "CNY").toUpperCase(),
          raw: "AI:" + t.description,
        });
      }
    }

    const txs = parsed;

    const categoryTotals: Record<string, number> = {};
    for (const t of txs) {
      const { category, score } = await step.run(
        `categorize-${t.description.slice(0, 20)}`,
        async () =>
          categorizeDescription(
            t.description,
            null,
            process.env.SILICONFLOW_API_KEY ? "SILICONFLOW" : "OPENAI"
          )
      );
      categoryTotals[category] = (categoryTotals[category] ?? 0) + t.amount;
      await prisma.draftTransaction.create({
        data: {
          userId,
          jobId,
          occurredAt: t.occurredAt,
          description: t.description,
          merchant: null,
          amount: t.amount,
          currency: t.currency,
          category,
          categoryScore: score,
          raw: t.raw,
        },
      });
    }

    await prisma.importJob.update({
      where: { id: jobId },
      data: { status: "REVIEW" },
    });
    return { count: txs.length, categories: categoryTotals, status: "REVIEW" };
  }
);
