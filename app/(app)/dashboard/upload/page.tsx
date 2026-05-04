"use client";
import { useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

export default function UploadPage() {
  const router = useRouter();
  const [status, setStatus] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) {
      setStatus("请选择文件");
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    setStatus("正在上传...");
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setStatus(data.error ? `上传失败：${data.error}` : "上传失败");
      return;
    }
    const data = await res.json();
    setStatus("上传成功，正在跳转到解析进度。");
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
    router.push(`/dashboard/imports/${data.jobId}`);
  }

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  };

  const prevent = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const onDragEnter = (e: React.DragEvent) => {
    prevent(e);
    setDragActive(true);
  };
  const onDragOver = (e: React.DragEvent) => {
    prevent(e);
    if (!dragActive) setDragActive(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    prevent(e);
    setDragActive(false);
  };
  const onDrop = (e: React.DragEvent) => {
    prevent(e);
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f) {
      setFile(f);
    }
  };

  const openFileDialog = useCallback(() => {
    inputRef.current?.click();
  }, []);

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-5">
        <h1 className="text-2xl font-semibold tracking-tight">上传账单文件</h1>
        <p className="mt-2 text-sm text-slate-500">
          支持 PDF / Excel (.xlsx .xls .csv)，上传后会自动进入导入详情页查看解析进度。
        </p>
      </div>

      <p className="rounded border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        本地开发时请保持 Next.js 和 Inngest dev server 同时运行，否则任务会停留在等待处理。
      </p>

      <form onSubmit={onSubmit} className="space-y-3">
        <div
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`flex min-h-64 flex-col items-center justify-center gap-2 rounded border bg-white text-center px-6 py-10 cursor-pointer transition-colors text-sm select-none
            ${
              dragActive
                ? "border-blue-500 bg-blue-50"
                : "border-dashed border-gray-300 hover:border-gray-400"
            }`}
          onClick={openFileDialog}
        >
          <input
            ref={inputRef}
            name="file"
            type="file"
            accept="application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,.xlsx,.xls,.csv"
            onChange={onFileChange}
            className="hidden"
          />
          {file ? (
            <>
              <p className="font-medium">{file.name}</p>
              <p className="text-xs text-gray-500">点击重新选择 或 拖入替换</p>
            </>
          ) : (
            <>
              <p className="font-medium">拖拽文件到此处 或 点击选择</p>
              <p className="text-xs text-gray-500">
                PDF / Excel (.xlsx .xls .csv)
              </p>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            disabled={!file || status === "正在上传..."}
            className="rounded bg-slate-950 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === "正在上传..." ? "上传中..." : "上传并解析"}
          </button>
          {file && (
            <button
              type="button"
              onClick={() => {
                setFile(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
              className="text-xs text-gray-500 underline"
            >
              清除
            </button>
          )}
        </div>
      </form>

      <p className="mt-3 text-sm text-gray-600">{status}</p>
    </div>
  );
}
