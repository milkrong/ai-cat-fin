import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/src/lib/db";
import { ImportStatus, Prisma } from "@prisma/client";
import { overridesSchema, idParam, jsonError, ApiError } from "@/src/lib/api";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  try {
    const params = await context.params;
    const { userId } = await auth();
    if (!userId) throw new ApiError(401, "unauthorized");
    const parseJobId = idParam.safeParse(params.jobId);
    if (!parseJobId.success) throw new ApiError(400, "invalid_job_id");
    const jobId = parseJobId.data;

    const job = await prisma.importJob.findFirst({
      where: { id: jobId, userId },
    });
    if (!job) throw new ApiError(404, "not_found");
    if (job.status !== ImportStatus.REVIEW)
      throw new ApiError(400, "job_not_in_review");

    const body = await req.json().catch(() => ({}));
    const { overrides, rows } = overridesSchema.parse(body);
    const overrideMap = new Map(overrides.map((o) => [o.id, o]));

    const drafts = await prisma.draftTransaction.findMany({ where: { jobId } });
    if (drafts.length === 0 && (!rows || rows.length === 0)) {
      return Response.json({ imported: 0 });
    }

    const draftIds = new Set(drafts.map((d) => d.id));
    const sourceRows:
      | {
          id: string;
          userId: string;
          jobId: string;
          occurredAt: Date;
          description: string;
          merchant: string | null;
          amount: number | Prisma.Decimal;
          currency: string;
          category: string | null;
          categoryScore: number | null;
          raw: Prisma.InputJsonValue | typeof Prisma.JsonNull;
        }[]
      =
      rows?.map((row) => ({
        id: row.id,
        userId,
        jobId,
        occurredAt: new Date(row.occurredAt),
        description: row.description,
        merchant: row.merchant || null,
        amount: row.amount,
        currency: row.currency,
        category: row.category || null,
        categoryScore: row.categoryScore ?? null,
        raw: (row.raw ?? {}) as Prisma.InputJsonValue,
      })) ??
      drafts.map((d) => {
        const o = overrideMap.get(d.id);
        return {
          id: d.id,
          userId: d.userId,
          jobId: d.jobId,
          occurredAt: o?.occurredAt ? new Date(o.occurredAt) : d.occurredAt,
          description: o?.description ?? d.description,
          merchant: o?.merchant ?? d.merchant,
          amount: o?.amount ?? Number(d.amount),
          currency: o?.currency ?? d.currency,
          category: o?.category ?? d.category,
          categoryScore: d.categoryScore,
          raw: (d.raw ?? Prisma.JsonNull) as
            | Prisma.InputJsonValue
            | typeof Prisma.JsonNull,
        };
      });

    if (sourceRows.length > 2000) throw new ApiError(400, "too_many_rows");

    const unknownExistingIds = sourceRows
      .filter((row) => !row.id.startsWith("new-") && !draftIds.has(row.id))
      .map((row) => row.id);
    if (unknownExistingIds.length > 0) {
      throw new ApiError(400, "invalid_draft_rows");
    }

    const txData = sourceRows.map((d) => {
      const o = overrideMap.get(d.id);
      return {
        userId: d.userId,
        jobId: d.jobId,
        occurredAt: o?.occurredAt ? new Date(o.occurredAt) : d.occurredAt,
        description: o?.description ?? d.description,
        merchant: o?.merchant ?? d.merchant,
        amount: o?.amount ?? d.amount,
        currency: o?.currency ?? d.currency,
        category: o?.category ?? d.category,
        categoryScore: d.categoryScore,
        raw: d.raw,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    });

    const BATCH = 500;
    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < txData.length; i += BATCH) {
        const slice = txData.slice(i, i + BATCH);
        await tx.transaction.createMany({ data: slice });
      }
      await tx.draftTransaction.deleteMany({ where: { jobId } });
      await tx.importJob.update({
        where: { id: jobId },
        data: { status: ImportStatus.COMPLETED },
      });
    });
    return Response.json({ imported: txData.length });
  } catch (e) {
    return jsonError(e);
  }
}
