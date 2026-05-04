import { auth, currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { endOfMonth, format, startOfMonth } from "date-fns";
import { prisma } from "@/src/lib/db";
import { formatCurrency } from "@/src/lib/format";
import { CategoryBarChart, TrendAreaChart } from "@/src/components/charts";

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) return null;

  const user = await currentUser();
  const displayName =
    user?.firstName ||
    user?.username ||
    user?.emailAddresses?.[0]?.emailAddress ||
    "你好";

  const now = new Date();
  const from = startOfMonth(now);
  const to = endOfMonth(now);

  const [jobs, txs, dailyRows, categoryRows] = await Promise.all([
    prisma.importJob.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    prisma.transaction.findMany({
      where: { userId },
      orderBy: { occurredAt: "desc" },
      take: 8,
    }),
    prisma.$queryRawUnsafe<
      { day: Date; income: number; expense: number; count: bigint }[]
    >(
      `SELECT
        date_trunc('day', "occurredAt")::date AS day,
        SUM(CASE WHEN "amount" > 0 THEN "amount" ELSE 0 END)::double precision AS income,
        SUM(CASE WHEN "amount" < 0 THEN "amount" ELSE 0 END)::double precision AS expense,
        COUNT(*)::bigint AS count
      FROM "Transaction"
      WHERE "userId" = $1 AND "occurredAt" >= $2 AND "occurredAt" <= $3
      GROUP BY 1 ORDER BY 1 ASC`,
      userId,
      from,
      to
    ),
    prisma.$queryRawUnsafe<{ category: string | null; total: number }[]>(
      `SELECT COALESCE("category", '未分类') AS category,
        SUM(CASE WHEN "amount" < 0 THEN -"amount" ELSE 0 END)::double precision AS total
      FROM "Transaction"
      WHERE "userId" = $1 AND "occurredAt" >= $2 AND "occurredAt" <= $3
      GROUP BY 1 ORDER BY total DESC LIMIT 10`,
      userId,
      from,
      to
    ),
  ]);

  const daily = dailyRows.map((row) => ({
    date: row.day.toISOString().slice(0, 10),
    income: Number(row.income || 0),
    expense: Number(row.expense || 0),
  }));
  const income = daily.reduce((sum, row) => sum + row.income, 0);
  const expense = daily.reduce((sum, row) => sum + row.expense, 0);
  const txCount = dailyRows.reduce((sum, row) => sum + Number(row.count), 0);
  const category = categoryRows
    .filter((row) => Number(row.total || 0) > 0)
    .map((row) => ({
      category: row.category || "未分类",
      amount: Number(row.total || 0),
    }));

  const pendingCount = jobs.filter((job) =>
    ["PENDING", "PROCESSING", "REVIEW", "FAILED"].includes(job.status)
  ).length;

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 md:flex-row md:items-end">
        <div>
          <p className="text-sm text-slate-500">
            {format(now, "yyyy 年 MM 月")}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
            {displayName} 的财务概览
          </h1>
        </div>
        <div className="flex gap-2">
          <Link
            href="/dashboard/upload"
            className="rounded bg-slate-950 px-4 py-2 text-sm text-white"
          >
            上传账单
          </Link>
          <Link
            href="/dashboard/transactions"
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700"
          >
            查看交易
          </Link>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="本月收入" value={formatCurrency(income)} tone="green" />
        <Metric
          label="本月支出"
          value={formatCurrency(expense)}
          tone="red"
        />
        <Metric
          label="净流入"
          value={formatCurrency(income + expense)}
          tone={income + expense >= 0 ? "green" : "red"}
        />
        <Metric label="待处理导入" value={`${pendingCount}`} tone="blue" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded border border-slate-200 bg-white p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-medium">本月支出趋势</h2>
              <p className="text-xs text-slate-500">{txCount} 笔交易</p>
            </div>
          </div>
          <TrendAreaChart data={daily} height={180} />
        </div>
        <div className="rounded border border-slate-200 bg-white p-4">
          <div className="mb-4">
            <h2 className="font-medium">支出分类 Top 10</h2>
            <p className="text-xs text-slate-500">按本月支出金额排序</p>
          </div>
          <CategoryBarChart data={category} height={180} />
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Panel
          title="最近导入"
          action={<Link href="/dashboard/upload">上传新账单</Link>}
        >
          {jobs.length === 0 ? (
            <EmptyState text="还没有导入记录。" />
          ) : (
            <div className="divide-y divide-slate-100">
              {jobs.map((job) => (
                <Link
                  key={job.id}
                  href={`/dashboard/imports/${job.id}`}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {job.filename}
                    </div>
                    <div className="text-xs text-slate-500">
                      {format(job.createdAt, "MM-dd HH:mm")}
                    </div>
                  </div>
                  <StatusBadge status={job.status} />
                </Link>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="最近交易"
          action={<Link href="/dashboard/transactions">全部交易</Link>}
        >
          {txs.length === 0 ? (
            <EmptyState text="确认导入后，交易会出现在这里。" />
          ) : (
            <div className="divide-y divide-slate-100">
              {txs.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {tx.description}
                    </div>
                    <div className="text-xs text-slate-500">
                      {format(tx.occurredAt, "MM-dd")} ·{" "}
                      {tx.category || "未分类"}
                    </div>
                  </div>
                  <div
                    className={
                      Number(tx.amount) < 0
                        ? "text-sm font-medium text-red-600"
                        : "text-sm font-medium text-emerald-600"
                    }
                  >
                    {formatCurrency(Number(tx.amount))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "green" | "red" | "blue";
}) {
  const toneClass =
    tone === "green"
      ? "text-emerald-700"
      : tone === "red"
      ? "text-red-700"
      : "text-blue-700";
  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-2 text-xl font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-medium">{title}</h2>
        <div className="text-xs text-blue-600 underline">{action}</div>
      </div>
      {children}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="py-8 text-center text-sm text-slate-500">{text}</div>;
}

function StatusBadge({ status }: { status: string }) {
  const label: Record<string, string> = {
    PENDING: "等待",
    PROCESSING: "解析中",
    REVIEW: "待审核",
    COMPLETED: "完成",
    FAILED: "失败",
  };
  const tone =
    status === "COMPLETED"
      ? "bg-emerald-50 text-emerald-700"
      : status === "FAILED"
      ? "bg-red-50 text-red-700"
      : status === "REVIEW"
      ? "bg-amber-50 text-amber-700"
      : "bg-blue-50 text-blue-700";
  return (
    <span className={`rounded px-2 py-1 text-xs font-medium ${tone}`}>
      {label[status] || status}
    </span>
  );
}
