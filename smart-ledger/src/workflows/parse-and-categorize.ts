import { inngest } from "@/src/lib/inngest";
import { prisma } from "@/src/lib/db";
import pdf from "pdf-parse";
import { categorizeDescription } from "@/src/services/categorizer";

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
    const { userId, jobId, fileBuffer } = (event as unknown as EventPayload).data;
    await prisma.importJob.update({ where: { id: jobId }, data: { status: "PROCESSING" } });

    const buffer = Buffer.from(fileBuffer, "base64");
    const result = await pdf(buffer);
    const lines = result.text.split(/\n+/).map((v) => v.trim()).filter(Boolean);

    // naive parse: look for lines like: 2025-01-02 Starbucks -23.50 CNY
    const txs = lines
      .map((line) => {
        const m = line.match(/(\d{4}-\d{2}-\d{2})\s+(.+?)\s+(-?\d+[\.,]?\d*)\s*(CNY|USD|HKD)?/i);
        if (!m) return null;
        const occurredAt = new Date(m[1]);
        const description = m[2];
        const amount = parseFloat(m[3].replace(",", ""));
        const currency = (m[4] ?? "CNY").toUpperCase();
        return { occurredAt, description, amount, currency };
      })
      .filter(Boolean) as Array<{ occurredAt: Date; description: string; amount: number; currency: string }>;

    for (const t of txs) {
      const { category, score } = await step.run("categorize", async () =>
        categorizeDescription(t.description, null, "OPENAI"),
      );
      await prisma.transaction.create({
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
          raw: null,
        },
      });
    }

    await prisma.importJob.update({ where: { id: jobId }, data: { status: "COMPLETED" } });
    return { count: txs.length };
  },
);

