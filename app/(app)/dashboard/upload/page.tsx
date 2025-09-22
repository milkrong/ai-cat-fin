"use client";
import { useRef, useState, useCallback } from "react";

export default function UploadPage() {
  const [status, setStatus] = useState<string>("");
  const [jobId, setJobId] = useState<string>("");
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
    setStatus("Uploading...");
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    if (!res.ok) {
      setStatus("Upload failed");
      return;
    }
    const data = await res.json();
    setJobId(data.jobId);
    setStatus("Uploaded. Parsing in background.");
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
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
      if (inputRef.current)
        inputRef.current.files = e.dataTransfer.files as any; // allow form reset convenience
    }
  };

  const openFileDialog = useCallback(() => {
    inputRef.current?.click();
  }, []);

  return (
    <div>
      <h1 className="text-xl font-semibold mb-2">上传账单文件</h1>
      <p className="text-xs text-gray-500 mb-4">
        支持 PDF / Excel (.xlsx .xls .csv)，解析后进入审核列表。
      </p>

      <form onSubmit={onSubmit} className="space-y-3">
        <div
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`flex flex-col items-center justify-center gap-2 rounded border text-center px-6 py-10 cursor-pointer transition-colors text-sm select-none
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
            disabled={!file || status === "Uploading..."}
            className="px-4 py-2 bg-black disabled:opacity-50 disabled:cursor-not-allowed text-white rounded text-sm"
          >
            {status === "Uploading..." ? "上传中..." : "上传"}
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
