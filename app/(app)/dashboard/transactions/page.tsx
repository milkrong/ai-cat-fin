import { prisma } from "@/src/lib/db";
import { auth } from "@clerk/nextjs/server";
import {
  endOfMonth,
  format,
  isValid,
  parseISO,
  startOfMonth,
} from "date-fns";
import { TransactionsCalendar } from "./calendar";
import { TransactionsManager, TransactionRow } from "./transaction-manager";

type SearchParams = Promise<{
  date?: string;
  month?: string;
}>;

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { userId } = await auth();
  if (!userId) return null;

  const params = await searchParams;
  const selectedDate =
    typeof params?.date === "string" && isValid(parseISO(params.date))
      ? params.date
      : "";
  const monthBasis = selectedDate ? parseISO(selectedDate) : new Date();
  const monthStart = startOfMonth(monthBasis);
  const monthEnd = endOfMonth(monthStart);

  const [txs, dailyCounts] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      take: 800,
    }),
    prisma.transaction.groupBy({
      by: ["occurredAt"],
      where: {
        userId,
        occurredAt: { gte: monthStart, lte: monthEnd },
      },
      _count: { _all: true },
    }),
  ]);

  const rows: TransactionRow[] = txs.map((tx) => ({
    id: tx.id,
    occurredAt: tx.occurredAt.toISOString(),
    description: tx.description,
    merchant: tx.merchant,
    amount: Number(tx.amount),
    currency: tx.currency,
    category: tx.category,
    jobId: tx.jobId,
  }));

  const daysWithCounts = dailyCounts.map((dc) => ({
    date: format(dc.occurredAt, "yyyy-MM-dd"),
    count: dc._count._all,
  }));

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 md:flex-row md:items-end">
        <div>
          <p className="text-sm text-slate-500">交易管理</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            搜索、筛选和维护账本交易
          </h1>
        </div>
      </section>

      <div className="grid min-w-0 gap-6 xl:grid-cols-[280px_1fr]">
        <div className="min-w-0 xl:sticky xl:top-20 xl:self-start">
          <TransactionsCalendar
            daysWithCounts={daysWithCounts}
            initialMonth={format(monthStart, "yyyy-MM")}
          />
        </div>
        <div className="min-w-0">
          <TransactionsManager rows={rows} initialDate={selectedDate} />
        </div>
      </div>
    </div>
  );
}
