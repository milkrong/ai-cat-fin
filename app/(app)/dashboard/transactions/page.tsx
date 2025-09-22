import { prisma } from "@/src/lib/db";
import { auth } from "@clerk/nextjs/server";
import {
  format,
  startOfDay,
  endOfDay,
  parseISO,
  isValid,
  startOfMonth,
  endOfMonth,
} from "date-fns";
import Link from "next/link";
import { TransactionsCalendar } from "./calendar";
import { formatCurrency } from "@/src/lib/format";

// Let Next.js supply `searchParams` without strict typing to avoid mismatch with generated types
export default async function TransactionsPage({ searchParams }: any) {
  const dateParam =
    typeof searchParams?.date === "string" ? searchParams.date : undefined;
  const monthParam =
    typeof searchParams?.month === "string" ? searchParams.month : undefined; // YYYY-MM

  const { userId } = await auth();
  if (!userId) return null;

  let dayFilter: Date | undefined;
  if (dateParam) {
    const parsed = parseISO(dateParam);
    if (isValid(parsed)) {
      dayFilter = parsed;
    } else {
      // invalid date param -> ignore
    }
  }

  // If a specific date is provided: fetch that day's transactions.
  // Else fetch recent (limit) and group by date.
  // compute month boundary for calendar aggregation (use dayFilter's month if present else current month of newest tx or now)
  const monthBasis = dayFilter ?? new Date();
  const monthStart = startOfMonth(monthBasis);
  const monthEnd = endOfMonth(monthStart);

  // daily counts for current month
  const dailyCountsPromise = prisma.transaction.groupBy({
    by: ["occurredAt"],
    where: {
      userId,
      occurredAt: { gte: monthStart, lte: monthEnd },
    },
    _count: { _all: true },
  });

  if (dayFilter) {
    const dayTxs = await prisma.transaction.findMany({
      where: {
        userId,
        occurredAt: {
          gte: startOfDay(dayFilter),
          lte: endOfDay(dayFilter),
        },
      },
      orderBy: { occurredAt: "desc" },
      take: 200,
    });

    const dailyCounts = await dailyCountsPromise;
    const daysWithCounts = dailyCounts.map((dc) => ({
      date: format(dc.occurredAt, "yyyy-MM-dd"),
      count: dc._count._all,
    }));

    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold">交易</h1>
        <div className="grid md:grid-cols-[260px_1fr] gap-6 items-start">
          <div className="md:sticky md:top-0 md:self-start h-fit">
            <TransactionsCalendar daysWithCounts={daysWithCounts} />
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-medium">{format(dayFilter, "yyyy-MM-dd")}</h2>
              <Link
                href="/dashboard/transactions"
                className="text-xs text-blue-600 underline"
              >
                清除筛选
              </Link>
            </div>
            <TransactionsList items={dayTxs} />
          </div>
        </div>
      </div>
    );
  }

  const txs = await prisma.transaction.findMany({
    where: { userId },
    orderBy: { occurredAt: "desc" },
    take: 300,
  });

  const dailyCounts = await dailyCountsPromise;
  const daysWithCounts = dailyCounts.map((dc) => ({
    date: format(dc.occurredAt, "yyyy-MM-dd"),
    count: dc._count._all,
  }));

  if (txs.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold">Recent Transactions</h1>
        <div className="grid md:grid-cols-[260px_1fr] gap-6 items-start">
          <TransactionsCalendar daysWithCounts={daysWithCounts} />
          <div className="text-sm text-gray-500">暂无交易数据。</div>
        </div>
      </div>
    );
  }

  const grouped: { date: string; items: typeof txs }[] = [];
  const map = new Map<string, typeof txs>();
  for (const t of txs) {
    const d = format(t.occurredAt, "yyyy-MM-dd");
    if (!map.has(d)) map.set(d, [] as any);
    (map.get(d) as typeof txs).push(t);
  }
  for (const [date, items] of map.entries()) {
    grouped.push({ date, items });
  }
  grouped.sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Recent Transactions</h1>
      <div className="grid md:grid-cols-[260px_1fr] gap-6 items-start">
        <div className="md:sticky md:top-0 md:self-start h-fit">
          <TransactionsCalendar daysWithCounts={daysWithCounts} />
        </div>
        <div className="space-y-8">
          {grouped.map((g) => (
            <div key={g.date} className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="font-medium text-sm text-gray-700">{g.date}</h2>
                <Link
                  href={`/dashboard/transactions?date=${g.date}`}
                  className="text-xs text-blue-600 underline"
                >
                  查看当天
                </Link>
              </div>
              <TransactionsList items={g.items} compact />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TransactionsList({
  items,
  compact,
}: {
  items: any[];
  compact?: boolean;
}) {
  if (items.length === 0) {
    return <div className="text-sm text-gray-500">暂无交易</div>;
  }
  return (
    <div className="grid gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          className="border rounded p-3 flex items-center justify-between"
        >
          <div>
            <div
              className="font-medium truncate max-w-[200px]"
              title={t.description}
            >
              {t.description}
            </div>
            {!compact && (
              <div className="text-xs text-gray-600">
                {format(t.occurredAt, "yyyy-MM-dd HH:mm")}
              </div>
            )}
            {compact && (
              <div className="text-xs text-gray-500">
                {format(t.occurredAt, "HH:mm")}
              </div>
            )}
          </div>
          <div className="text-right">
            <div
              className={
                Number(t.amount) < 0 ? "text-red-600" : "text-green-600"
              }
            >
              {formatCurrency(Number(t.amount))}
            </div>
            <div className="text-xs text-gray-600">
              {t.category ?? "未分类"}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
