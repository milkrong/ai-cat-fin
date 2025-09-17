import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/src/lib/db";
import { ImportStatus } from "@prisma/client";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  const params = await context.params;
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const jobId = params.jobId;
  const job = await prisma.importJob.findFirst({
    where: { id: jobId, userId },
  });
  if (!job) return new Response("Not found", { status: 404 });
  if (job.status !== ImportStatus.REVIEW)
    return new Response("Job not in REVIEW", { status: 400 });

  // Optional payload allowing edits (category overrides etc.)
  let overrides: Array<{
    id: string;
    category?: string;
    description?: string;
    merchant?: string;
  }> = [];
  try {
    const json = await req.json().catch(() => null);
    if (json && Array.isArray(json.overrides)) overrides = json.overrides;
  } catch {}

  const overrideMap = new Map(overrides.map((o) => [o.id, o]));

  const drafts = await prisma.draftTransaction.findMany({ where: { jobId } });
  for (const d of drafts) {
    const o = overrideMap.get(d.id);
    await prisma.transaction.create({
      data: {
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
      },
    });
  }
  await prisma.draftTransaction.deleteMany({ where: { jobId } });
  await prisma.importJob.update({
    where: { id: jobId },
    data: { status: ImportStatus.COMPLETED },
  });
  return Response.json({ imported: drafts.length });
}
