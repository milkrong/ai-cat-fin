import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/src/lib/db";
import { format } from "date-fns";
import { formatCurrency } from "@/src/lib/format";

export default async function Home() {
  const { userId } = await auth();
  const [jobs, txs] = userId
    ? await Promise.all([
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
      ])
    : [[], []];

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
      )}
      <footer className="pt-10 text-xs text-gray-400 border-t">
        Smart Ledger © {new Date().getFullYear()}
      </footer>
    </div>
  );
}
