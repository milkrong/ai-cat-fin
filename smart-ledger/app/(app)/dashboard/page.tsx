import { auth } from "@clerk/nextjs/server";
import Link from "next/link";

export default async function Page() {
  const { userId } = await auth();
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Dashboard</h1>
      <p className="text-sm text-gray-600 mb-6">{userId ? `User: ${userId}` : ""}</p>
      <div className="flex gap-3">
        <Link href="/" className="text-blue-600 underline">
          Home
        </Link>
      </div>
    </div>
  );
}

