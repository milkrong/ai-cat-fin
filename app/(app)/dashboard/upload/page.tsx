"use client";
import { useState } from "react";
import { SignedIn, SignedOut, SignInButton, useUser } from "@clerk/nextjs";

export default function UploadPage() {
  const [status, setStatus] = useState<string>("");
  const [jobId, setJobId] = useState<string>("");
  const { isSignedIn, isLoaded } = useUser();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    setStatus("Uploading...");
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    if (!res.ok) {
      setStatus("Upload failed");
      return;
    }
    const data = await res.json();
    setJobId(data.jobId);
    setStatus("Uploaded. Parsing in background.");
    form.reset();
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-2">上传账单文件</h1>
      <p className="text-xs text-gray-500 mb-4">
        支持 PDF / Excel (.xlsx .xls .csv)，解析后进入审核列表。
      </p>
      {/* Fallback: if Clerk components fail to mount, also rely on useUser */}
      {isSignedIn && isLoaded && (
        <form
          onSubmit={onSubmit}
          className="flex flex-col sm:flex-row items-start sm:items-center gap-3"
        >
          <input
            name="file"
            type="file"
            accept="application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,.xlsx,.xls,.csv"
            required
            className="text-sm"
          />
          <button className="px-4 py-2 bg-black text-white rounded text-sm">
            上传
          </button>
        </form>
      )}
      <SignedIn>
        <form
          onSubmit={onSubmit}
          className="flex flex-col sm:flex-row items-start sm:items-center gap-3"
        >
          <input
            name="file"
            type="file"
            accept="application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,.xlsx,.xls,.csv"
            required
            className="text-sm"
          />
          <button className="px-4 py-2 bg-black text-white rounded text-sm">
            上传
          </button>
        </form>
      </SignedIn>
      <SignedOut>
        <div className="p-4 border rounded bg-gray-50 text-sm flex flex-col gap-2 max-w-sm">
          <span>需要登录后上传账单。</span>
          <SignInButton mode="modal">
            <button className="px-3 py-2 bg-black text-white rounded text-xs w-fit">
              登录 / 注册
            </button>
          </SignInButton>
        </div>
      </SignedOut>
      {!isLoaded && <div className="text-xs text-gray-400">加载身份...</div>}
      <p className="mt-3 text-sm text-gray-600">{status}</p>
      {jobId && (
        <p className="mt-2 text-xs">
          任务: {jobId} ·{" "}
          <a className="underline" href={`/dashboard/imports/${jobId}`}>
            查看进度/审核
          </a>
        </p>
      )}
    </div>
  );
}
