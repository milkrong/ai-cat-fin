import { inngest } from "@/src/lib/inngest";
import { prisma } from "@/src/lib/db";
import * as XLSX from "xlsx";
import { ImportStatus } from "@prisma/client";
import {
  aiExtractTransactionsFromText,
  ExtractedTx,
} from "@/src/services/ai-extract";

interface ExcelEventPayload {
  name: "excel/ingested";
  data: { userId: string; jobId: string; filename: string; fileBuffer: string };
}

export const parseAndCategorizeExcel = inngest.createFunction(
  { id: "parse-and-categorize-excel" },
  { event: "excel/ingested" },
  async ({ event, step }: { event: unknown; step: any }) => {
    const { userId, jobId, fileBuffer } = (
      event as unknown as ExcelEventPayload
    ).data;
    console.log("[Inngest] excel/ingested start", { jobId, userId });
    await prisma.importJob.update({
      where: { id: jobId },
      data: { status: ImportStatus.PROCESSING },
    });

    try {
      const buf = Buffer.from(fileBuffer, "base64");
      const wb = XLSX.read(buf, { type: "buffer" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json: any[] = XLSX.utils.sheet_to_json(sheet, {
        defval: null,
        raw: true,
      });
      console.log("[Inngest] excel rows parsed", { rows: json.length });
      // Flatten rows -> lines & basic noise filtering
      const lines = json
        .map((r) => Object.values(r).join(" "))
        .map((l) => l.replace(/\s+/g, " ").trim())
        .filter((l) => l && /\d/.test(l)); // keep lines containing at least one digit

      // Chunk lines to avoid token overflow and reduce malformed JSON risk
      const MAX_LINES_PER_CHUNK = 40; // heuristic; adjust if token limits hit
      const MIN_SIGNAL_LINES = 3; // skip very tiny noise chunks
      const chunks: string[][] = [];
      for (let i = 0; i < lines.length; i += MAX_LINES_PER_CHUNK) {
        chunks.push(lines.slice(i, i + MAX_LINES_PER_CHUNK));
      }
      console.log("[Inngest] chunking", {
        totalLines: lines.length,
        chunkCount: chunks.length,
      });

      // Parallel (bounded) chunk processing
      const CONCURRENCY = Math.max(
        1,
        Math.min(
          Number(process.env.EXCEL_CHUNK_CONCURRENCY ?? 3) || 3,
          chunks.length
        )
      );
      console.log("[Inngest] chunk processing concurrency", { CONCURRENCY });

      const results: ExtractedTx[] = [];
      let nextIndex = 0;

      const worker = async (workerId: number) => {
        while (true) {
          const idx = nextIndex++;
          if (idx >= chunks.length) return;
          const chunk = chunks[idx];
          if (chunk.length < MIN_SIGNAL_LINES) {
            continue; // skip low-signal chunk
          }
          const promptBlock = chunk.join("\n");
          const label = `ai-parse-excel-chunk-${idx + 1}`;
          try {
            const part = await step.run(
              label,
              async () =>
                aiExtractTransactionsFromText(
                  promptBlock
                ) as unknown as ExtractedTx[]
            );
            console.log("[Inngest] chunk parsed", {
              worker: workerId,
              chunk: idx + 1,
              lines: chunk.length,
              extracted: part.length,
            });
            results.push(...part);
          } catch (e: any) {
            console.warn("[Inngest] chunk failed (skipping)", {
              worker: workerId,
              chunk: idx + 1,
              error: e?.message,
            });
            // continue with next chunk
          }
        }
      };

      await Promise.all(
        Array.from({ length: CONCURRENCY }, (_, i) => worker(i + 1))
      );

      const aiRows = results;
      console.log("[Inngest] AI extraction complete (chunked)", {
        aiRows: aiRows.length,
        chunks: chunks.length,
      });
      const rows = aiRows
        .map((t: ExtractedTx) => {
          const occurredAt = new Date(t.date);
          if (Number.isNaN(occurredAt.getTime())) return null;
          let amount = t.amount;
          if (t.type === "expense" && amount > 0) amount = -amount;
          if (t.type === "income" && amount < 0) amount = Math.abs(amount);
          return {
            occurredAt,
            description: t.description,
            amount,
            currency: (t.currency ?? "CNY").toUpperCase(),
            merchant: t.merchant ?? null,
            category: t.category || "其他",
            categoryScore: t.categoryScore ?? 0.5,
            raw: { ai: true, description: t.description },
          };
        })
        .filter(Boolean) as Array<{
        occurredAt: Date;
        description: string;
        amount: number;
        currency: string;
        merchant: string | null;
        category: string;
        categoryScore: number;
        raw: any;
      }>;

      // Idempotent insert: clear previous drafts for this job before inserting
      await prisma.draftTransaction.deleteMany({ where: { jobId } });
      if (rows.length > 0) {
        const BATCH = 500;
        for (let i = 0; i < rows.length; i += BATCH) {
          const slice = rows.slice(i, i + BATCH).map((r) => ({
            userId,
            jobId,
            occurredAt: r.occurredAt,
            description: r.description,
            merchant: r.merchant,
            amount: r.amount,
            currency: r.currency,
            category: r.category,
            categoryScore: r.categoryScore,
            raw: r.raw,
          }));
          await prisma.draftTransaction.createMany({
            data: slice,
            skipDuplicates: true,
          });
        }
      }

      const categoryTotals: Record<string, number> = {};
      for (const row of rows) {
        const abs = Math.abs(row.amount);
        categoryTotals[row.category] =
          (categoryTotals[row.category] ?? 0) + abs;
      }

      await prisma.importJob.update({
        where: { id: jobId },
        data: { status: "REVIEW" as any },
      });
      console.log("[Inngest] excel/ingested complete", {
        jobId,
        count: rows.length,
      });
      return {
        count: rows.length,
        categories: categoryTotals,
        status: "REVIEW",
        data: rows,
      };
    } catch (err: any) {
      console.error("[Inngest] excel/ingested error", {
        jobId,
        error: err?.message,
        stack: err?.stack,
      });
      try {
        await prisma.importJob.update({
          where: { id: jobId },
          data: { status: "FAILED" as any },
        });
      } catch (inner) {
        console.error("[Inngest] failed to mark job FAILED", {
          jobId,
          error: (inner as any)?.message,
        });
      }
      throw err;
    }
  }
);
