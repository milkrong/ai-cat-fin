import { auth, currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { prisma } from "@/src/lib/db";

export default async function Page() {
  const { userId } = await auth();
  if (!userId) return null;
  const user = await currentUser();
  const displayName = (() => {
    if (user?.firstName && user?.lastName)
      return `${user.firstName} ${user.lastName}`;
    if (user?.firstName) return user.firstName;
    if (user?.username) return user.username;
    if (user?.emailAddresses?.[0]?.emailAddress)
      return user.emailAddresses[0].emailAddress;
    return userId;
  })();
  const jobs = await prisma.importJob.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-gray-600">User: {displayName}</p>
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
