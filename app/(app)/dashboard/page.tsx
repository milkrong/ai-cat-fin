import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { prisma } from "@/src/lib/db";

export default async function Page() {
  const { userId } = await auth();
  if (!userId) return null;
  const jobs = await prisma.importJob.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Dashboard</h1>
        <p className="text-sm text-gray-600">User: {userId}</p>
      </div>
      <div className="flex gap-3 text-sm">
        <Link href="/" className="text-blue-600 underline">
          Home
        </Link>
        <Link href="/dashboard/upload" className="text-blue-600 underline">
          Upload
        </Link>
        <Link
          href="/dashboard/transactions"
          className="text-blue-600 underline"
        >
          Transactions
        </Link>
      </div>
      <div>
        <h2 className="font-medium mb-2">Recent Imports</h2>
        <div className="border rounded divide-y">
          {jobs.length === 0 && (
            <div className="p-3 text-sm text-gray-500">No imports yet.</div>
          )}
          {jobs.map((j) => (
            <Link
              key={j.id}
              href={`/dashboard/imports/${j.id}`}
              className="flex items-center justify-between p-3 hover:bg-gray-50"
            >
              <div className="text-sm">
                <div className="font-medium">{j.filename}</div>
                <div className="text-xs text-gray-500">{j.status}</div>
              </div>
              <div className="text-xs text-gray-400">
                {j.createdAt.toISOString().slice(0, 10)}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
