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
      <h1 className="text-xl font-semibold mb-4">Upload PDF Bill</h1>
      <form onSubmit={onSubmit} className="flex items-center gap-3">
        <input name="file" type="file" accept="application/pdf" required />
        <button className="px-4 py-2 bg-black text-white rounded">Upload</button>
      </form>
      <p className="mt-3 text-sm text-gray-600">{status}</p>
      {jobId && <p className="mt-2 text-xs">Job: {jobId}</p>}
    </div>
  );
}

