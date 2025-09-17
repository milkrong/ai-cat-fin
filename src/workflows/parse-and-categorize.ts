import { inngest } from "@/src/lib/inngest";
import { prisma } from "@/src/lib/db";
import pdf from "pdf-parse";
import { categorizeDescription } from "@/src/services/categorizer";
import { aiExtractTransactionsFromText } from "@/src/services/ai-extract";

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
    // Pure AI extraction approach (no regex / heuristic parsing)
    const allText = result.text.slice(0, 25000);
    const aiFull = await step.run("ai-full-parse", async () =>
      aiExtractTransactionsFromText(allText)
    );
    const txs = aiFull
      .map((t) => {
        const occurredAt = new Date(t.date);
        if (Number.isNaN(occurredAt.getTime())) return null;
        return {
          occurredAt,
          description: t.description,
          // store amount as positive; income/expense type could be added later
          amount: Math.abs(t.amount),
          currency: (t.currency ?? "CNY").toUpperCase(),
          raw: "AI_FULL:" + t.description,
        };
      })
      .filter(Boolean) as Array<{
      occurredAt: Date;
      description: string;
      amount: number;
      currency: string;
      raw: string;
    }>;

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
      await (prisma as any).draftTransaction.create({
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
      data: { status: "REVIEW" as any },
    });
    return { count: txs.length, categories: categoryTotals, status: "REVIEW" };
  }
);
