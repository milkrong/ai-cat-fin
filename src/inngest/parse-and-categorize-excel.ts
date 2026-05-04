import { inngest } from "@/src/lib/inngest";
import { prisma } from "@/src/lib/db";
import * as XLSX from "xlsx";
import { ImportStatus, Prisma } from "@prisma/client";
import {
  aiExtractTransactionsFromText,
  ExtractedTx,
} from "@/src/services/ai-extract";

interface ExcelEventPayload {
  name: "excel/ingested";
  data: { userId: string; jobId: string; filename: string; fileBuffer: string };
}

type DraftRow = {
  occurredAt: Date;
  description: string;
  amount: number;
  currency: string;
  merchant: string | null;
  category: string;
  categoryScore: number;
  raw: Prisma.InputJsonValue;
};

export const parseAndCategorizeExcel = inngest.createFunction(
  { id: "parse-and-categorize-excel" },
  { event: "excel/ingested" },
  async ({ event, step }: { event: unknown; step: any }) => {
    const { userId, jobId, filename, fileBuffer } = (
      event as unknown as ExcelEventPayload
    ).data;
    console.log("[Inngest] excel/ingested start", { jobId, userId });
    await prisma.importJob.update({
      where: { id: jobId },
      data: { status: ImportStatus.PROCESSING, error: null, warning: null },
    });

    try {
      const buf = Buffer.from(fileBuffer, "base64");
      const wb = /\.csv$/i.test(filename)
        ? XLSX.read(buf.toString("utf8"), { type: "string", raw: true })
        : XLSX.read(buf, { type: "buffer" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json: any[] = XLSX.utils.sheet_to_json(sheet, {
        defval: null,
        raw: true,
      });
      console.log("[Inngest] excel rows parsed", { rows: json.length });
      const structuredRows = parseStructuredRows(json);
      const rows: DraftRow[] =
        structuredRows.length > 0
          ? structuredRows
          : await parseRowsWithAI(json, step);
      console.log("[Inngest] excel extraction complete", {
        mode: structuredRows.length > 0 ? "structured" : "ai",
        count: rows.length,
      });

      await persistRows({ userId, jobId, rows });

      const categoryTotals: Record<string, number> = {};
      for (const row of rows) {
        const abs = Math.abs(row.amount);
        categoryTotals[row.category] =
          (categoryTotals[row.category] ?? 0) + abs;
      }

      await prisma.importJob.update({
        where: { id: jobId },
        data: { status: "REVIEW", error: null },
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
          data: {
            status: "FAILED",
            error: err instanceof Error ? err.message : "excel_parse_failed",
          },
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

async function parseRowsWithAI(json: any[], step: any): Promise<DraftRow[]> {
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
        .filter(Boolean) as DraftRow[];
      return rows;
}

async function persistRows({
  userId,
  jobId,
  rows,
}: {
  userId: string;
  jobId: string;
  rows: DraftRow[];
}) {
  await prisma.draftTransaction.deleteMany({ where: { jobId } });
  if (rows.length === 0) return;

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

function parseStructuredRows(json: Record<string, unknown>[]): DraftRow[] {
  const rows: DraftRow[] = [];
  for (const row of json) {
    const dateValue = pick(row, ["date", "日期", "交易日期", "时间", "occurredAt"]);
    const description =
      stringify(
        pick(row, ["description", "描述", "交易描述", "摘要", "备注", "商品"])
      ) || stringify(pick(row, ["merchant", "商户", "对方", "交易对方"]));
    const amount = parseAmount(pick(row, ["amount", "金额", "交易金额", "支出"]));
    const occurredAt = parseDateValue(dateValue);
    if (!occurredAt || !description || amount === null) continue;

    const merchant =
      stringify(pick(row, ["merchant", "商户", "对方", "交易对方"])) || null;
    const category = inferCategory(`${description} ${merchant ?? ""}`);
    rows.push({
      occurredAt,
      description,
      amount,
      currency:
        stringify(pick(row, ["currency", "币种", "货币"]))?.toUpperCase() ||
        "CNY",
      merchant,
      category,
      categoryScore: category === "其他" ? 0.45 : 0.8,
      raw: { structured: true, row: toJsonObject(row) },
    });
  }
  return rows;
}

function toJsonObject(row: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, toJsonValue(value)])
  ) as Prisma.InputJsonObject;
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  return String(value);
}

function pick(row: Record<string, unknown>, candidates: string[]) {
  const entries = Object.entries(row);
  for (const candidate of candidates) {
    const exact = entries.find(
      ([key]) => normalizeKey(key) === normalizeKey(candidate)
    );
    if (exact) return exact[1];
  }
  for (const candidate of candidates) {
    const fuzzy = entries.find(([key]) =>
      normalizeKey(key).includes(normalizeKey(candidate))
    );
    if (fuzzy) return fuzzy[1];
  }
  return undefined;
}

function normalizeKey(key: string) {
  return key.toLowerCase().replace(/\s|_|-/g, "");
}

function stringify(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parseAmount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = stringify(value).replace(/,/g, "");
  if (!text) return null;
  const match = text.match(/[+-]?\d+(?:\.\d+)?/);
  if (!match) return null;
  return Number(match[0]);
}

function parseDateValue(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
  }
  const text = stringify(value);
  if (!text) return null;
  const normalized = text.replace(/[./]/g, "-");
  const date = new Date(normalized);
  if (!Number.isNaN(date.getTime())) return date;
  return null;
}

function inferCategory(text: string) {
  if (/星巴克|咖啡|餐|饭|美团|饿了么/i.test(text)) return "餐饮";
  if (/地铁|公交|滴滴|打车|高铁|机票|交通/i.test(text)) return "交通出行";
  if (/工资|薪资|奖金/i.test(text)) return "其他";
  if (/淘宝|京东|拼多多|网购/i.test(text)) return "网购";
  if (/药|医院|医疗/i.test(text)) return "医疗";
  return "其他";
}
