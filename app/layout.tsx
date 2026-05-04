import { type Metadata } from "next";
import {
  ClerkProvider,
  SignInButton,
  SignUpButton,
  SignedOut,
} from "@clerk/nextjs";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Smart Ledger",
  description: "AI-powered personal finance dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="zh-CN">
        <body
          className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-slate-50 text-slate-950`}
        >
          <SignedOut>
            <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6">
              <Link href="/" className="text-lg font-semibold tracking-tight">
                Smart Ledger
              </Link>
              <div className="flex items-center gap-3 text-sm">
                <SignInButton />
                <SignUpButton>
                  <button className="rounded bg-slate-950 px-4 py-2 text-white">
                    注册
                  </button>
                </SignUpButton>
              </div>
            </header>
          </SignedOut>
          <main>{children}</main>
        </body>
      </html>
    </ClerkProvider>
  );
}
