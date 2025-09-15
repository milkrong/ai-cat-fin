import { UserButton } from "@clerk/nextjs";
import Link from "next/link";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b flex items-center justify-between px-4 h-14">
        <Link href="/" className="font-semibold">Smart Ledger</Link>
        <UserButton afterSignOutUrl="/" />
      </header>
      <main className="p-4 max-w-5xl w-full mx-auto">{children}</main>
    </div>
  );
}

