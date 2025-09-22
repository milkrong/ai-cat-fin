import { auth } from "@clerk/nextjs/server";
import ReviewClient from "./review-client";
import { prisma } from "@/src/lib/db";

// Rely on Next.js route segment param inference (params.jobId)
export default async function ImportReviewPage({ params }: { params: any }) {
  const { jobId } = params as { jobId: string };

  const { userId } = await auth();
  if (!userId) return <div className="p-4 text-sm text-red-600">未登录</div>;

  const job = await prisma.importJob.findFirst({
    where: { id: jobId, userId },
  });
  if (!job) return <div className="p-4">任务不存在</div>;

  const draftsDb = await prisma.draftTransaction.findMany({
    where: { jobId },
    orderBy: { occurredAt: "asc" },
  });

  const drafts = draftsDb.map((d) => ({
    id: d.id,
    occurredAt: d.occurredAt.toISOString(),
    description: d.description,
    merchant: d.merchant,
    amount: Number(d.amount),
    currency: d.currency,
    category: d.category,
    categoryScore: d.categoryScore,
    raw: d.raw as any,
  }));

  return (
    <ReviewClient
      job={{ id: job.id, status: job.status }}
      initialDrafts={drafts}
    />
  );
}
