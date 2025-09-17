import { inngest } from "@/src/lib/inngest";
import { prisma } from "@/src/lib/db";
import { categorizeDescription } from "@/src/services/categorizer";
import * as XLSX from "xlsx";
import { ImportStatus } from "@prisma/client";
import { aiExtractTransactionsFromText } from "@/src/services/ai-extract";

interface ExcelEventPayload {
  name: "excel/ingested";
  data: { userId: string; jobId: string; filename: string; fileBuffer: string };
}

export const parseAndCategorizeExcel = inngest.createFunction(
  { id: "parse-and-categorize-excel" },
  { event: "excel/ingested" },
  async ({ event, step }) => {
    const { userId, jobId, fileBuffer } = (
      event as unknown as ExcelEventPayload
    ).data;
    await prisma.importJob.update({
      where: { id: jobId },
      data: { status: ImportStatus.PROCESSING },
    });

    const buf = Buffer.from(fileBuffer, "base64");
    const wb = XLSX.read(buf, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const json: any[] = XLSX.utils.sheet_to_json(sheet, {
      defval: null,
      raw: true,
    });
    // Pure AI path: flatten sheet rows into lines then extract
    const plain = json.map((r) => Object.values(r).join(" ")).join("\n");
    const aiRows = await step.run("ai-full-parse-excel", async () =>
      aiExtractTransactionsFromText(plain)
    );
    const rows = aiRows
      .map((t) => {
        const occurredAt = new Date(t.date);
        if (Number.isNaN(occurredAt.getTime())) return null;
        return {
          occurredAt,
          description: t.description,
          amount: Math.abs(t.amount),
          currency: (t.currency ?? "CNY").toUpperCase(),
          merchant: t.merchant ?? null,
          raw: { ai: true, description: t.description },
        };
      })
      .filter(Boolean) as Array<{
      occurredAt: Date;
      description: string;
      amount: number;
      currency: string;
      merchant: string | null;
      raw: any;
    }>;

    const categoryTotals: Record<string, number> = {};
    for (const row of rows) {
      const { category, score } = await step.run(
        `categorize-${row.description.slice(0, 20)}`,
        async () =>
          categorizeDescription(
            row.description,
            row.merchant,
            process.env.SILICONFLOW_API_KEY ? "SILICONFLOW" : "OPENAI"
          )
      );
      categoryTotals[category] = (categoryTotals[category] ?? 0) + row.amount;
      await (prisma as any).draftTransaction.create({
        data: {
          userId,
          jobId,
          occurredAt: row.occurredAt,
          description: row.description,
          merchant: row.merchant,
          amount: row.amount,
          currency: row.currency,
          category,
          categoryScore: score,
          raw: row.raw,
        },
      });
    }

    await prisma.importJob.update({
      where: { id: jobId },
      data: { status: "REVIEW" as any },
    });
    return { count: rows.length, categories: categoryTotals, status: "REVIEW" };
  }
);
