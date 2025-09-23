"use client";
import { useEffect, useMemo, useState } from "react";

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
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bulkCategory, setBulkCategory] = useState("");
  const [filter, setFilter] = useState("");
  const [applyBusy, setApplyBusy] = useState(false);

  // Derived lists
  const filteredDrafts = useMemo(() => {
    if (!filter.trim()) return drafts;
    const f = filter.trim();
    return drafts.filter(
      (d) =>
        d.description.includes(f) ||
        (d.category ?? "").includes(f) ||
        d.merchant?.includes(f) ||
        d.occurredAt.includes(f)
    );
  }, [drafts, filter]);

  const allSelected = useMemo(
    () =>
      filteredDrafts.length > 0 && filteredDrafts.every((d) => selected[d.id]),
    [filteredDrafts, selected]
  );

  function toggleAll() {
    if (allSelected) {
      const next = { ...selected };
      filteredDrafts.forEach((d) => delete next[d.id]);
      setSelected(next);
    } else {
      const next = { ...selected };
      filteredDrafts.forEach((d) => (next[d.id] = true));
      setSelected(next);
    }
  }

  function toggleOne(id: string) {
    setSelected((s) => ({ ...s, [id]: !s[id] }));
  }

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

  async function applyBulkCategory() {
    if (!bulkCategory) return;
    setApplyBusy(true);
    setDrafts((ds) =>
      ds.map((d) => (selected[d.id] ? { ...d, category: bulkCategory } : d))
    );
    setChanged((c) => {
      const next = { ...c };
      Object.keys(selected).forEach((id) => {
        if (selected[id])
          next[id] = { ...(next[id] || {}), category: bulkCategory };
      });
      return next;
    });
    // UX: small delay to show feedback
    setTimeout(() => setApplyBusy(false), 150);
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
    <div className="p-4 space-y-4" aria-live="polite">
      <h1 className="text-xl font-semibold">导入审核 #{job.id.slice(0, 8)}</h1>
      <div className="text-sm text-gray-600">状态: {job.status}</div>
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-600" htmlFor="filterInput">
            筛选 (描述/类别/商户)
          </label>
          <input
            id="filterInput"
            className="border rounded px-2 py-1 text-sm"
            placeholder="输入关键字过滤"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="筛选草稿"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-600" htmlFor="bulkCategory">
            批量分类
          </label>
          <div className="flex gap-2 items-center">
            <select
              id="bulkCategory"
              className="border rounded px-2 py-1 text-sm"
              value={bulkCategory}
              onChange={(e) => setBulkCategory(e.target.value)}
              aria-label="选择批量应用分类"
            >
              <option value="">选择分类</option>
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={applyBulkCategory}
              disabled={!bulkCategory || applyBusy}
              aria-busy={applyBusy}
              className="px-3 py-1 rounded bg-blue-600 text-white text-xs disabled:opacity-50"
            >
              应用到选中
            </button>
            <span className="text-xs text-gray-500">
              已选 {Object.values(selected).filter(Boolean).length} 条
            </span>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table
          className="min-w-full text-sm border"
          role="table"
          aria-label="交易草稿表"
        >
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 border w-8 text-center">
                <input
                  type="checkbox"
                  aria-label={allSelected ? "取消全选" : "全选"}
                  checked={allSelected}
                  onChange={toggleAll}
                />
              </th>
              <th className="p-2 border">日期</th>
              <th className="p-2 border">描述</th>
              <th className="p-2 border">金额</th>
              <th className="p-2 border">币种</th>
              <th className="p-2 border">类别</th>
              <th className="p-2 border">置信</th>
            </tr>
          </thead>
          <tbody>
            {filteredDrafts.map((d) => (
              <tr key={d.id} className="border-t" role="row">
                <td className="p-2 border text-center align-top">
                  <input
                    type="checkbox"
                    aria-label={`选择交易 ${d.description}`}
                    checked={!!selected[d.id]}
                    onChange={() => toggleOne(d.id)}
                  />
                </td>
                <td className="p-2 border whitespace-nowrap">
                  {new Date(d.occurredAt).toISOString().slice(0, 10)}
                </td>
                <td className="p-2 border">
                  <input
                    className="w-full border rounded px-1 py-0.5"
                    value={d.description}
                    aria-label={`描述 ${d.description}`}
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
                    aria-label={`分类 ${d.description}`}
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
            {filteredDrafts.length === 0 && (
              <tr>
                <td
                  className="p-4 text-center text-xs text-gray-500 border"
                  colSpan={8}
                >
                  无匹配结果
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3">
        <button
          disabled={loading}
          onClick={onConfirm}
          aria-busy={loading}
          className="px-4 py-2 bg-black text-white rounded disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-black"
        >
          确认导入
        </button>
        <span className="text-sm text-gray-600">{message}</span>
      </div>
    </div>
  );
}
