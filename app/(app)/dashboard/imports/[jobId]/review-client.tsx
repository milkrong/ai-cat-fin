"use client";
import { useEffect, useState } from "react";

interface DraftTx {
  id: string;
  occurredAt: string;
  description: string;
  merchant: string | null;
  amount: string | number;
  currency: string;
  category: string | null;
  categoryScore: number | null;
  raw: any;
}

interface JobInfo {
  id: string;
  status: string;
}

const CATEGORY_OPTIONS = [
  "餐饮",
  "交通出行",
  "日用品",
  "娱乐",
  "网购",
  "医疗",
  "教育",
  "住房",
  "通讯",
  "服饰",
  "旅行",
  "其他",
];

export default function ReviewClient({
  job,
  initialDrafts,
}: {
  job: JobInfo;
  initialDrafts: DraftTx[];
}) {
  const [drafts, setDrafts] = useState<DraftTx[]>(initialDrafts);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [changed, setChanged] = useState<Record<string, Partial<DraftTx>>>({});

  // Poll for new drafts while in REVIEW
  useEffect(() => {
    if (job.status !== "REVIEW") return;
    const id = setInterval(async () => {
      const res = await fetch(`/api/imports/${job.id}/drafts`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setDrafts(data.drafts);
      }
    }, 5000);
    return () => clearInterval(id);
  }, [job.id, job.status]);

  function update(id: string, patch: Partial<DraftTx>) {
    setDrafts((d) => d.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    setChanged((c) => ({ ...c, [id]: { ...(c[id] || {}), ...patch } }));
  }

  async function onConfirm() {
    setLoading(true);
    setMessage("提交中...");
    const overrides = Object.entries(changed).map(([id, v]) => ({
      id,
      category: v.category,
      description: v.description,
      merchant: v.merchant,
    }));
    const res = await fetch(`/api/imports/${job.id}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ overrides }),
    });
    if (!res.ok) {
      setMessage("确认失败");
    } else {
      setMessage("已确认");
    }
    setLoading(false);
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">导入审核 #{job.id.slice(0, 8)}</h1>
      <div className="text-sm text-gray-600">状态: {job.status}</div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm border">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 border">日期</th>
              <th className="p-2 border">描述</th>
              <th className="p-2 border">金额</th>
              <th className="p-2 border">币种</th>
              <th className="p-2 border">类别</th>
              <th className="p-2 border">置信</th>
            </tr>
          </thead>
          <tbody>
            {drafts.map((d) => (
              <tr key={d.id} className="border-t">
                <td className="p-2 border whitespace-nowrap">
                  {new Date(d.occurredAt).toISOString().slice(0, 10)}
                </td>
                <td className="p-2 border">
                  <input
                    className="w-full border rounded px-1 py-0.5"
                    value={d.description}
                    onChange={(e) =>
                      update(d.id, { description: e.target.value })
                    }
                  />
                </td>
                <td className="p-2 border text-right">{d.amount}</td>
                <td className="p-2 border">{d.currency}</td>
                <td className="p-2 border">
                  <select
                    className="border rounded px-1 py-0.5"
                    value={d.category || ""}
                    onChange={(e) => update(d.id, { category: e.target.value })}
                  >
                    <option value="">未分类</option>
                    {CATEGORY_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="p-2 border text-center">
                  {d.categoryScore?.toFixed(2) ?? "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3">
        <button
          disabled={loading}
          onClick={onConfirm}
          className="px-4 py-2 bg-black text-white rounded disabled:opacity-50"
        >
          确认导入
        </button>
        <span className="text-sm text-gray-600">{message}</span>
      </div>
    </div>
  );
}
