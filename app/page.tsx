import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/src/lib/db";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { formatCurrency } from "@/src/lib/format";
import { TrendAreaChart, CategoryBarChart } from "@/src/components/charts";

export default async function Home() {
  const { userId } = await auth();
  let jobs: any[] = [];
  let txs: any[] = [];
  let daily: { date: string; income: number; expense: number }[] = [];
  let category: { category: string; amount: number }[] = [];

  if (userId) {
    // Recent import jobs & transactions
    [jobs, txs] = await Promise.all([
      prisma.importJob.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.transaction.findMany({
        where: { userId },
        orderBy: { occurredAt: "desc" },
        take: 5,
      }),
    ]);

    const now = new Date();
    const from = startOfMonth(now);
    const to = endOfMonth(now);

    // Daily aggregation (standard sign semantics: negative = expense)
    const dailyRows = await prisma.$queryRawUnsafe<
      { day: Date; income: number; expense: number }[]
    >(
      `SELECT
        date_trunc('day', "occurredAt")::date AS day,
        SUM(CASE WHEN "amount" > 0 THEN "amount" ELSE 0 END)::double precision AS income,
        SUM(CASE WHEN "amount" < 0 THEN "amount" ELSE 0 END)::double precision AS expense
      FROM "Transaction"
      WHERE "userId" = $1 AND "occurredAt" >= $2 AND "occurredAt" <= $3
      GROUP BY 1 ORDER BY 1 ASC`,
      userId,
      from,
      to
    );
    daily = dailyRows.map((r) => ({
      date: r.day.toISOString().slice(0, 10),
      income: Number(r.income || 0),
      expense: Number(r.expense || 0),
    }));

    // Determine sign mode (legacy positive-expense fallback)
    let totalIncome = 0;
    let totalExpense = 0; // negative aggregate
    let hasNegativeExpense = false;
    for (const d of daily) {
      totalIncome += d.income;
      totalExpense += d.expense; // expense is negative values summed
      if (d.expense < 0) hasNegativeExpense = true;
    }
    let signMode: "standard" | "positive-expense" = "standard";
    if (!hasNegativeExpense && totalIncome > 0 && totalExpense === 0) {
      signMode = "positive-expense";
      // Reinterpret income as expense (legacy data ingested as positive numbers only)
      daily = daily.map((d) => ({
        date: d.date,
        income: 0,
        expense: d.income === 0 ? 0 : -d.income, // flip to negative
      }));
    }

    // Category breakdown (depends on sign mode)
    if (signMode === "standard") {
      const catRows = await prisma.$queryRawUnsafe<
        { category: string | null; total: number }[]
      >(
        `SELECT COALESCE("category", '未分类') AS category,
          SUM(CASE WHEN "amount" < 0 THEN -"amount" ELSE 0 END)::double precision AS total
        FROM "Transaction"
        WHERE "userId" = $1 AND "occurredAt" >= $2 AND "occurredAt" <= $3
        GROUP BY 1 ORDER BY total DESC LIMIT 12`,
        userId,
        from,
        to
      );
      category = catRows
        .filter((r) => (r.total || 0) > 0)
        .map((r) => ({
          category: r.category || "未分类",
          amount: Number(r.total || 0),
        }));
    } else {
      // Legacy mode: treat positive numbers as expenses
      const catRows = await prisma.$queryRawUnsafe<
        { category: string | null; total: number }[]
      >(
        `SELECT COALESCE("category", '未分类') AS category,
          SUM(CASE WHEN "amount" > 0 THEN "amount" ELSE 0 END)::double precision AS total
        FROM "Transaction"
        WHERE "userId" = $1 AND "occurredAt" >= $2 AND "occurredAt" <= $3
        GROUP BY 1 ORDER BY total DESC LIMIT 12`,
        userId,
        from,
        to
      );
      category = catRows
        .filter((r) => (r.total || 0) > 0)
        .map((r) => ({
          category: r.category || "未分类",
          amount: Number(r.total || 0),
        }));
    }
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-10">
      <section className="space-y-2">
        <p className="text-sm text-gray-600">
          {userId ? `欢迎，用户 ${userId}` : "请登录以开始上传账单"}
        </p>
        <p className="text-sm text-gray-500">
          导入 PDF 账单，AI 解析中文流水并分类，确认后入库。
        </p>
      </section>
      {userId && (
        <div className="space-y-14">
          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-medium">最近导入</h2>
                <Link
                  href="/dashboard"
                  className="text-xs text-blue-600 underline"
                >
                  更多
                </Link>
              </div>
              <div className="border rounded divide-y">
                {jobs.length === 0 && (
                  <div className="p-3 text-sm text-gray-500">暂无</div>
                )}
                {jobs.map((j) => (
                  <Link
                    key={j.id}
                    href={`/dashboard/imports/${j.id}`}
                    className="flex items-center justify-between p-3 hover:bg-gray-50"
                  >
                    <div className="text-sm">
                      <div className="font-medium truncate max-w-[160px]">
                        {j.filename}
                      </div>
                      <div className="text-xs text-gray-500">{j.status}</div>
                    </div>
                    <div className="text-xs text-gray-400">
                      {format(j.createdAt, "MM-dd")}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-medium">最近交易</h2>
                <Link
                  href="/dashboard/transactions"
                  className="text-xs text-blue-600 underline"
                >
                  更多
                </Link>
              </div>
              <div className="border rounded divide-y">
                {txs.length === 0 && (
                  <div className="p-3 text-sm text-gray-500">暂无</div>
                )}
                {txs.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between p-3"
                  >
                    <div>
                      <div className="font-medium truncate max-w-[160px]">
                        {t.description}
                      </div>
                      <div className="text-xs text-gray-500">
                        {format(t.occurredAt, "MM-dd")} {t.category ?? "未分类"}
                      </div>
                    </div>
                    <div
                      className={`text-right text-sm ${
                        Number(t.amount) < 0 ? "text-red-600" : "text-green-600"
                      }`}
                    >
                      {formatCurrency(Number(t.amount))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-10">
            <div className="space-y-3">
              <h3 className="font-medium text-sm text-gray-700 flex items-center gap-2">
                本月每日支出趋势
              </h3>
              <TrendAreaChart data={daily as any} />
            </div>
            <div className="space-y-3">
              <h3 className="font-medium text-sm text-gray-700">
                本月支出类别分布 (Top)
              </h3>
              <CategoryBarChart data={category as any} />
            </div>
          </div>
        </div>
      )}
      <footer className="pt-10 text-xs text-gray-400 border-t">
        Smart Ledger © {new Date().getFullYear()}
      </footer>
    </div>
  );
}
