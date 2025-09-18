"use client";
import { useState } from "react";

export default function UploadPage() {
  const [status, setStatus] = useState<string>("");
  const [jobId, setJobId] = useState<string>("");

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
