import { auth } from "@clerk/nextjs/server";
import ReviewClient from "./review-client";
import { prisma } from "@/src/lib/db";
import { Prisma } from "@prisma/client";

export default async function ImportReviewPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;

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
  const importedTxs = await prisma.transaction.findMany({
    where: { jobId, userId },
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
    raw: d.raw as Prisma.JsonValue,
  }));

  const activeRows =
    drafts.length > 0
      ? drafts
      : importedTxs.map((t) => ({
          id: t.id,
          occurredAt: t.occurredAt.toISOString(),
          description: t.description,
          merchant: t.merchant,
          amount: Number(t.amount),
          currency: t.currency,
          category: t.category,
          categoryScore: t.categoryScore,
          raw: t.raw as Prisma.JsonValue,
        }));

  const summary = summarize(activeRows);

  return (
    <ReviewClient
      job={{
        id: job.id,
        filename: job.filename,
        status: job.status,
        error: job.error,
        warning: job.warning,
        retryCount: job.retryCount,
        createdAt: job.createdAt.toISOString(),
        updatedAt: job.updatedAt.toISOString(),
      }}
      initialDrafts={drafts}
      importedTransactions={importedTxs.map((t) => ({
        id: t.id,
        occurredAt: t.occurredAt.toISOString(),
        description: t.description,
        merchant: t.merchant,
        amount: Number(t.amount),
        currency: t.currency,
        category: t.category,
        categoryScore: t.categoryScore,
        raw: t.raw as Prisma.JsonValue,
      }))}
      initialSummary={summary}
    />
  );
}

function summarize(
  rows: {
    amount: number;
    category: string | null;
    categoryScore: number | null;
  }[]
) {
  const income = rows.reduce(
    (sum, row) => sum + (row.amount > 0 ? row.amount : 0),
    0
  );
  const expense = rows.reduce(
    (sum, row) => sum + (row.amount < 0 ? row.amount : 0),
    0
  );
  const lowConfidence = rows.filter(
    (row) => row.categoryScore !== null && row.categoryScore < 0.75
  ).length;
  const uncategorized = rows.filter((row) => !row.category).length;
  const categories = rows.reduce<Record<string, number>>((acc, row) => {
    if (row.amount >= 0) return acc;
    const key = row.category || "未分类";
    acc[key] = (acc[key] || 0) + Math.abs(row.amount);
    return acc;
  }, {});

  return {
    count: rows.length,
    income,
    expense,
    lowConfidence,
    uncategorized,
    categories,
  };
}
