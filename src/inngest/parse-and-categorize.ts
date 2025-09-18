import { inngest } from "@/src/lib/inngest";
import { prisma } from "@/src/lib/db";
// Import the library implementation directly to avoid pdf-parse's index.js
// debug self-execution that attempts to read a test PDF when module.parent is falsy.
// Turbopack/Next bundling can cause that condition, leading to ENOENT './test/data/05-versions-space.pdf'.
import pdf from "pdf-parse/lib/pdf-parse.js";
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
    let result: any;
    try {
      result = await pdf(buffer);
    } catch (err: any) {
      console.error("[Inngest] pdf parse error", {
        jobId,
        error: err?.message,
      });
      await prisma.importJob.update({
        where: { id: jobId },
        data: { status: "FAILED" as any },
      });
      throw err;
    }
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
          amount: Math.abs(t.amount),
          currency: (t.currency ?? "CNY").toUpperCase(),
          category: t.category || "其他",
          categoryScore: t.categoryScore ?? 0.5,
          raw: "AI_FULL:" + t.description,
        };
      })
      .filter(Boolean) as Array<{
      occurredAt: Date;
      description: string;
      amount: number;
      currency: string;
      category: string;
      categoryScore: number;
      raw: string;
    }>;

    const categoryTotals: Record<string, number> = {};
    for (const t of txs) {
      categoryTotals[t.category] = (categoryTotals[t.category] ?? 0) + t.amount;
      await (prisma as any).draftTransaction.create({
        data: {
          userId,
          jobId,
          occurredAt: t.occurredAt,
          description: t.description,
          merchant: null,
          amount: t.amount,
          currency: t.currency,
          category: t.category,
          categoryScore: t.categoryScore,
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
