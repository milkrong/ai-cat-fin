import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/src/lib/db";
import { ImportStatus } from "@prisma/client";
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
    const { overrides } = overridesSchema.parse(body);
    const overrideMap = new Map(overrides.map((o) => [o.id, o]));

    const drafts = await prisma.draftTransaction.findMany({ where: { jobId } });
    if (drafts.length === 0) return Response.json({ imported: 0 });

    const txData = drafts.map((d) => {
      const o = overrideMap.get(d.id);
      return {
        userId: d.userId,
        jobId: d.jobId,
        occurredAt: d.occurredAt,
        description: o?.description ?? d.description,
        merchant: o?.merchant ?? d.merchant,
        amount: d.amount,
        currency: d.currency,
        category: o?.category ?? d.category,
        categoryScore: d.categoryScore,
        raw: d.raw as any,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    });

    const BATCH = 500;
    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < txData.length; i += BATCH) {
        const slice = txData.slice(i, i + BATCH);
        await (tx as any).transaction.createMany({ data: slice });
      }
      await tx.draftTransaction.deleteMany({ where: { jobId } });
      await tx.importJob.update({
        where: { id: jobId },
        data: { status: ImportStatus.COMPLETED },
      });
    });
    return Response.json({ imported: drafts.length });
  } catch (e) {
    return jsonError(e);
  }
}
