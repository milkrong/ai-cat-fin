"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatCurrency } from "@/src/lib/format";

interface DraftTx {
  id: string;
  occurredAt: string;
  description: string;
  merchant: string | null;
  amount: string | number;
  currency: string;
  category: string | null;
  categoryScore: number | null;
  raw: unknown;
}

interface JobInfo {
  id: string;
  filename: string;
  status: string;
  error: string | null;
  warning: string | null;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
}

interface Summary {
  count: number;
  income: number;
  expense: number;
  lowConfidence: number;
  uncategorized: number;
  categories: Record<string, number>;
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

const statusText: Record<string, string> = {
  PENDING: "等待处理",
  PROCESSING: "解析中",
  REVIEW: "待审核",
  COMPLETED: "已完成",
  FAILED: "失败",
};

export default function ReviewClient({
  job,
  initialDrafts,
  importedTransactions,
  initialSummary,
}: {
  job: JobInfo;
  initialDrafts: DraftTx[];
  importedTransactions: DraftTx[];
  initialSummary: Summary;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<DraftTx[]>(
    initialDrafts.length > 0 ? initialDrafts : importedTransactions
  );
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [bulkCategory, setBulkCategory] = useState("");
  const [filter, setFilter] = useState("");
  const [view, setView] = useState<"all" | "needs-review" | "uncategorized">(
    "all"
  );

  const editable = job.status === "REVIEW";
  const summary = useMemo(() => summarize(rows), [rows]);
  const displaySummary = rows.length ? summary : initialSummary;
  const shouldPoll = ["PENDING", "PROCESSING", "REVIEW"].includes(job.status);

  useEffect(() => {
    if (!shouldPoll) return;
    const timer = window.setInterval(() => {
      router.refresh();
    }, job.status === "REVIEW" ? 8000 : 2500);
    return () => window.clearInterval(timer);
  }, [job.status, router, shouldPoll]);

  useEffect(() => {
    const latestRows =
      initialDrafts.length > 0 ? initialDrafts : importedTransactions;
    if (rows.length === 0 || job.status !== "REVIEW") {
      setRows(latestRows);
    }
  }, [importedTransactions, initialDrafts, job.status, rows.length]);

  const filteredRows = useMemo(() => {
    const keyword = filter.trim();
    return rows
      .filter((row) => {
        const needsReview =
          row.categoryScore !== null && Number(row.categoryScore) < 0.75;
        if (view === "needs-review" && !needsReview) return false;
        if (view === "uncategorized" && row.category) return false;
        if (!keyword) return true;
        return (
          row.description.includes(keyword) ||
          (row.merchant || "").includes(keyword) ||
          (row.category || "").includes(keyword) ||
          row.occurredAt.includes(keyword)
        );
      })
      .sort((a, b) => {
        const aScore = a.categoryScore ?? 1;
        const bScore = b.categoryScore ?? 1;
        if (aScore !== bScore) return aScore - bScore;
        return a.occurredAt.localeCompare(b.occurredAt);
      });
  }, [filter, rows, view]);

  const selectedCount = Object.values(selected).filter(Boolean).length;
  const allSelected =
    filteredRows.length > 0 && filteredRows.every((row) => selected[row.id]);

  function update(id: string, patch: Partial<DraftTx>) {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch } : row))
    );
  }

  function toggleAll() {
    if (allSelected) {
      const next = { ...selected };
      filteredRows.forEach((row) => delete next[row.id]);
      setSelected(next);
      return;
    }
    const next = { ...selected };
    filteredRows.forEach((row) => (next[row.id] = true));
    setSelected(next);
  }

  function addRow() {
    const now = new Date();
    const row: DraftTx = {
      id: `new-${Date.now()}`,
      occurredAt: now.toISOString(),
      description: "",
      merchant: null,
      amount: 0,
      currency: "CNY",
      category: null,
      categoryScore: null,
      raw: { source: "manual" },
    };
    setRows((current) => [row, ...current]);
    setSelected((current) => ({ ...current, [row.id]: true }));
  }

  function deleteSelected() {
    const ids = new Set(
      Object.entries(selected)
        .filter(([, checked]) => checked)
        .map(([id]) => id)
    );
    setRows((current) => current.filter((row) => !ids.has(row.id)));
    setSelected({});
  }

  function applyBulkCategory() {
    if (!bulkCategory) return;
    setRows((current) =>
      current.map((row) =>
        selected[row.id] ? { ...row, category: bulkCategory } : row
      )
    );
  }

  async function confirmImport() {
    setBusy(true);
    setMessage("正在确认导入...");
    const payloadRows = rows
      .filter((row) => row.description.trim())
      .map((row) => ({
        id: row.id,
        occurredAt: new Date(row.occurredAt).toISOString(),
        description: row.description.trim(),
        merchant: row.merchant?.trim() || null,
        amount: Number(row.amount),
        currency: row.currency.trim().toUpperCase() || "CNY",
        category: row.category?.trim() || null,
        categoryScore: row.categoryScore,
        raw: row.raw,
      }));

    const res = await fetch(`/api/imports/${job.id}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: payloadRows }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMessage(data.error ? `确认失败：${data.error}` : "确认失败");
      setBusy(false);
      return;
    }
    const data = await res.json();
    setMessage(`已导入 ${data.imported ?? payloadRows.length} 笔交易`);
    setBusy(false);
    router.refresh();
    router.push("/dashboard/transactions");
  }

  async function retryImport() {
    setBusy(true);
    setMessage("正在重新解析...");
    const res = await fetch(`/api/imports/${job.id}/retry`, { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMessage(data.error ? `重试失败：${data.error}` : "重试失败");
      return;
    }
    router.refresh();
  }

  async function deleteImport() {
    const ok = window.confirm("删除这个导入任务？已完成的交易不会被删除。");
    if (!ok) return;
    setBusy(true);
    const res = await fetch(`/api/imports/${job.id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMessage(data.error ? `删除失败：${data.error}` : "删除失败");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 xl:flex-row xl:items-end">
        <div className="min-w-0">
          <Link
            href="/dashboard"
            className="text-xs text-blue-600 underline underline-offset-2"
          >
            返回概览
          </Link>
          <h1 className="mt-2 truncate text-2xl font-semibold tracking-tight">
            {job.filename}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <StatusBadge status={job.status} />
            {job.status === "PENDING" && (
              <span>任务已入队，等待解析服务处理</span>
            )}
            {job.status === "PROCESSING" && (
              <span>正在读取文件并调用 AI 解析</span>
            )}
            {job.status === "REVIEW" && <span>解析完成，请核对后确认导入</span>}
            {job.status === "COMPLETED" && <span>交易已写入账本</span>}
            <span>创建 {formatDateTime(job.createdAt)}</span>
            <span>更新 {formatDateTime(job.updatedAt)}</span>
            {job.retryCount > 0 && <span>已重试 {job.retryCount} 次</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {job.status === "FAILED" && (
            <button
              onClick={retryImport}
              disabled={busy || job.retryCount >= 3}
              className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              重新解析
            </button>
          )}
          <button
            onClick={deleteImport}
            disabled={busy}
            className="rounded border border-red-200 bg-white px-4 py-2 text-sm text-red-700 disabled:opacity-50"
          >
            删除导入
          </button>
        </div>
      </section>

      {(job.error || job.warning || message) && (
        <section className="space-y-2">
          {job.error && (
            <Notice tone="red" title="解析失败" text={job.error} />
          )}
          {job.warning && (
            <Notice tone="amber" title="解析提示" text={job.warning} />
          )}
          {message && <Notice tone="blue" title="操作状态" text={message} />}
        </section>
      )}

      <section className="grid gap-3 md:grid-cols-5">
        <Metric label="交易数" value={`${displaySummary.count}`} />
        <Metric label="收入" value={formatCurrency(displaySummary.income)} />
        <Metric label="支出" value={formatCurrency(displaySummary.expense)} />
        <Metric label="低置信度" value={`${displaySummary.lowConfidence}`} />
        <Metric label="未分类" value={`${displaySummary.uncategorized}`} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_280px]">
        <div className="rounded border border-slate-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="flex flex-wrap gap-2">
              <SegmentButton
                active={view === "all"}
                onClick={() => setView("all")}
              >
                全部
              </SegmentButton>
              <SegmentButton
                active={view === "needs-review"}
                onClick={() => setView("needs-review")}
              >
                低置信度
              </SegmentButton>
              <SegmentButton
                active={view === "uncategorized"}
                onClick={() => setView("uncategorized")}
              >
                未分类
              </SegmentButton>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <input
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="搜索描述、商户、分类"
                className="h-9 rounded border border-slate-300 px-3 text-sm"
              />
              <select
                value={bulkCategory}
                onChange={(event) => setBulkCategory(event.target.value)}
                disabled={!editable}
                className="h-9 rounded border border-slate-300 px-2 text-sm disabled:bg-slate-50"
              >
                <option value="">批量分类</option>
                {CATEGORY_OPTIONS.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={applyBulkCategory}
                disabled={!editable || !bulkCategory || selectedCount === 0}
                className="h-9 rounded bg-slate-900 px-3 text-sm text-white disabled:opacity-50"
              >
                应用
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 text-sm">
            <div className="text-slate-500">
              已选 {selectedCount} 条，当前显示 {filteredRows.length} 条
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={addRow}
                disabled={!editable}
                className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm disabled:opacity-50"
              >
                新增交易
              </button>
              <button
                type="button"
                onClick={deleteSelected}
                disabled={!editable || selectedCount === 0}
                className="rounded border border-red-200 bg-white px-3 py-1.5 text-sm text-red-700 disabled:opacity-50"
              >
                删除选中
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[1120px] w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="w-10 px-3 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="全选当前列表"
                    />
                  </th>
                  <th className="px-3 py-3 text-left">日期</th>
                  <th className="px-3 py-3 text-left">描述</th>
                  <th className="px-3 py-3 text-left">商户</th>
                  <th className="px-3 py-3 text-right">金额</th>
                  <th className="px-3 py-3 text-left">币种</th>
                  <th className="px-3 py-3 text-left">类别</th>
                  <th className="px-3 py-3 text-center">置信度</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((row) => (
                  <tr
                    key={row.id}
                    className={
                      row.categoryScore !== null && row.categoryScore < 0.75
                        ? "bg-amber-50/50"
                        : ""
                    }
                  >
                    <td className="px-3 py-2 align-top">
                      <input
                        type="checkbox"
                        checked={!!selected[row.id]}
                        onChange={() =>
                          setSelected((current) => ({
                            ...current,
                            [row.id]: !current[row.id],
                          }))
                        }
                        aria-label={`选择 ${row.description || "交易"}`}
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input
                        type="date"
                        disabled={!editable}
                        value={toDateInput(row.occurredAt)}
                        onChange={(event) =>
                          update(row.id, {
                            occurredAt: `${event.target.value}T00:00:00.000Z`,
                          })
                        }
                        className="w-36 rounded border border-slate-300 px-2 py-1 disabled:border-transparent disabled:bg-transparent"
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input
                        disabled={!editable}
                        value={row.description}
                        onChange={(event) =>
                          update(row.id, { description: event.target.value })
                        }
                        className="w-full min-w-52 rounded border border-slate-300 px-2 py-1 disabled:border-transparent disabled:bg-transparent"
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input
                        disabled={!editable}
                        value={row.merchant || ""}
                        onChange={(event) =>
                          update(row.id, { merchant: event.target.value })
                        }
                        className="w-40 rounded border border-slate-300 px-2 py-1 disabled:border-transparent disabled:bg-transparent"
                      />
                    </td>
                    <td className="px-3 py-2 text-right align-top">
                      <input
                        type="number"
                        step="0.01"
                        disabled={!editable}
                        value={row.amount}
                        onChange={(event) =>
                          update(row.id, {
                            amount: Number(event.target.value || 0),
                          })
                        }
                        className="w-32 rounded border border-slate-300 px-2 py-1 text-right disabled:border-transparent disabled:bg-transparent"
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input
                        disabled={!editable}
                        value={row.currency}
                        onChange={(event) =>
                          update(row.id, {
                            currency: event.target.value.toUpperCase(),
                          })
                        }
                        className="w-20 rounded border border-slate-300 px-2 py-1 uppercase disabled:border-transparent disabled:bg-transparent"
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <select
                        disabled={!editable}
                        value={row.category || ""}
                        onChange={(event) =>
                          update(row.id, { category: event.target.value })
                        }
                        className="w-32 rounded border border-slate-300 px-2 py-1 disabled:border-transparent disabled:bg-transparent"
                      >
                        <option value="">未分类</option>
                        {CATEGORY_OPTIONS.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-center align-top">
                      <Confidence score={row.categoryScore} />
                    </td>
                  </tr>
                ))}
                {filteredRows.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-12 text-center text-sm text-slate-500"
                    >
                      没有匹配的交易。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 p-4">
            <div className="text-xs text-slate-500">
              低置信度会自动排在前面，建议先核对这些记录。
            </div>
            <button
              onClick={confirmImport}
              disabled={!editable || busy || rows.length === 0}
              className="rounded bg-slate-950 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              确认导入
            </button>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded border border-slate-200 bg-white p-4">
            <h2 className="font-medium">分类预览</h2>
            <div className="mt-3 space-y-2">
              {Object.entries(displaySummary.categories).length === 0 ? (
                <div className="text-sm text-slate-500">暂无支出分类。</div>
              ) : (
                Object.entries(displaySummary.categories)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 8)
                  .map(([category, amount]) => (
                    <div key={category}>
                      <div className="flex justify-between text-xs">
                        <span>{category}</span>
                        <span>{formatCurrency(amount)}</span>
                      </div>
                      <div className="mt-1 h-1.5 rounded bg-slate-100">
                        <div
                          className="h-1.5 rounded bg-blue-500"
                          style={{
                            width: `${Math.max(
                              6,
                              (amount / Math.max(...Object.values(displaySummary.categories))) *
                                100
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}

function summarize(rows: DraftTx[]): Summary {
  const income = rows.reduce(
    (sum, row) => sum + (Number(row.amount) > 0 ? Number(row.amount) : 0),
    0
  );
  const expense = rows.reduce(
    (sum, row) => sum + (Number(row.amount) < 0 ? Number(row.amount) : 0),
    0
  );
  const lowConfidence = rows.filter(
    (row) => row.categoryScore !== null && row.categoryScore < 0.75
  ).length;
  const uncategorized = rows.filter((row) => !row.category).length;
  const categories = rows.reduce<Record<string, number>>((acc, row) => {
    const amount = Number(row.amount);
    if (amount >= 0) return acc;
    const key = row.category || "未分类";
    acc[key] = (acc[key] || 0) + Math.abs(amount);
    return acc;
  }, {});
  return {
    count: rows.length,
    income,
    expense,
    lowConfidence,
    uncategorized,
    categories,
  };
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "COMPLETED"
      ? "bg-emerald-50 text-emerald-700"
      : status === "FAILED"
      ? "bg-red-50 text-red-700"
      : status === "REVIEW"
      ? "bg-amber-50 text-amber-700"
      : "bg-blue-50 text-blue-700";
  return (
    <span className={`rounded px-2 py-1 font-medium ${tone}`}>
      {statusText[status] || status}
    </span>
  );
}

function Notice({
  tone,
  title,
  text,
}: {
  tone: "red" | "amber" | "blue";
  title: string;
  text: string;
}) {
  const classes =
    tone === "red"
      ? "border-red-200 bg-red-50 text-red-800"
      : tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-blue-200 bg-blue-50 text-blue-800";
  return (
    <div className={`rounded border px-4 py-3 text-sm ${classes}`}>
      <div className="font-medium">{title}</div>
      <div className="mt-1">{text}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-2 text-lg font-semibold">{value}</div>
    </div>
  );
}

function SegmentButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded bg-slate-900 px-3 py-1.5 text-sm text-white"
          : "rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700"
      }
    >
      {children}
    </button>
  );
}

function Confidence({ score }: { score: number | null }) {
  if (score === null) return <span className="text-slate-400">-</span>;
  const low = score < 0.75;
  return (
    <span
      className={
        low
          ? "rounded bg-amber-100 px-2 py-1 text-xs text-amber-800"
          : "rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-700"
      }
    >
      {score.toFixed(2)}
    </span>
  );
}

function toDateInput(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
