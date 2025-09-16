import { prisma } from "@/src/lib/db";
import { auth } from "@clerk/nextjs/server";
import { format } from "date-fns";

export default async function TransactionsPage() {
  const { userId } = await auth();
  if (!userId) return null;
  const txs = await prisma.transaction.findMany({
    where: { userId },
    orderBy: { occurredAt: "desc" },
    take: 50,
  });
  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Recent Transactions</h1>
      <div className="grid gap-2">
        {txs.map((t) => (
          <div key={t.id} className="border rounded p-3 flex items-center justify-between">
            <div>
              <div className="font-medium">{t.description}</div>
              <div className="text-xs text-gray-600">{format(t.occurredAt, "yyyy-MM-dd")}</div>
            </div>
            <div className="text-right">
              <div>{t.amount.toString()} {t.currency}</div>
              <div className="text-xs text-gray-600">{t.category ?? "未分类"}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

