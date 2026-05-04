import { UserButton } from "@clerk/nextjs";
import Link from "next/link";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const navItems = [
    { href: "/dashboard", label: "概览" },
    { href: "/dashboard/upload", label: "上传账单" },
    { href: "/dashboard/transactions", label: "交易" },
  ];
  const mobileNavItems = [
    { href: "/dashboard", label: "概览" },
    { href: "/dashboard/upload", label: "上传" },
    { href: "/dashboard/transactions", label: "交易" },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 border-r border-slate-200 bg-white px-5 py-5 lg:block">
        <Link href="/dashboard" className="block">
          <div className="text-lg font-semibold tracking-tight">
            Smart Ledger
          </div>
          <div className="mt-1 text-xs text-slate-500">个人财务工作台</div>
        </Link>
        <nav className="mt-8 space-y-1 text-sm">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded px-3 py-2 text-slate-700 hover:bg-slate-100 hover:text-slate-950"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="font-semibold lg:hidden">
              Smart Ledger
            </Link>
            <nav className="hidden gap-1 text-sm sm:flex lg:hidden">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded px-2 py-1 text-slate-600 hover:bg-slate-100"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/upload"
              className="rounded bg-slate-950 px-3 py-2 text-sm text-white hover:bg-slate-800"
            >
              上传
            </Link>
            <UserButton />
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 pb-24 pt-6 sm:px-6 lg:pb-6">
          {children}
        </main>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur lg:hidden">
        <div className="grid grid-cols-3 gap-2">
          {mobileNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded px-3 py-2 text-center text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
