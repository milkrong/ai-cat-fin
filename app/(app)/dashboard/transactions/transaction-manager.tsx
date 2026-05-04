"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/src/lib/format";

export interface TransactionRow {
  id: string;
  occurredAt: string;
  description: string;
  merchant: string | null;
  amount: number;
  currency: string;
  category: string | null;
  jobId: string | null;
}

type TransactionForm = {
  id?: string;
  date: string;
  description: string;
  merchant: string;
  amount: string;
  currency: string;
  category: string;
};

const DEFAULT_CATEGORIES = [
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

export function TransactionsManager({
  rows,
  initialDate,
}: {
  rows: TransactionRow[];
  initialDate: string;
}) {
  const router = useRouter();
  const [items, setItems] = useState(rows);
  const [query, setQuery] = useState("");
  const [type, setType] = useState<"all" | "expense" | "income">("all");
  const [category, setCategory] = useState("");
  const [dateFrom, setDateFrom] = useState(initialDate);
  const [dateTo, setDateTo] = useState(initialDate);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<TransactionForm>(newForm());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const categories = useMemo(() => {
    return Array.from(
      new Set([
        ...DEFAULT_CATEGORIES,
        ...items.map((item) => item.category).filter(Boolean),
      ] as string[])
    );
  }, [items]);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return items.filter((item) => {
      if (type === "expense" && item.amount >= 0) return false;
      if (type === "income" && item.amount <= 0) return false;
      if (category && (item.category || "未分类") !== category) return false;

      const date = item.occurredAt.slice(0, 10);
      if (dateFrom && date < dateFrom) return false;
      if (dateTo && date > dateTo) return false;

      if (!keyword) return true;
      return [item.description, item.merchant || "", item.category || ""]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [category, dateFrom, dateTo, items, query, type]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, item) => {
        if (item.amount > 0) acc.income += item.amount;
        if (item.amount < 0) acc.expense += item.amount;
        return acc;
      },
      { income: 0, expense: 0 }
    );
  }, [filtered]);

  function openCreate() {
    setForm(newForm(dateFrom || initialDate));
    setMessage("");
    setDialogOpen(true);
  }

  function openEdit(row: TransactionRow) {
    setForm({
      id: row.id,
      date: row.occurredAt.slice(0, 10),
      description: row.description,
      merchant: row.merchant || "",
      amount: String(row.amount),
      currency: row.currency,
      category: row.category || "",
    });
    setMessage("");
    setDialogOpen(true);
  }

  async function saveTransaction() {
    setBusy(true);
    setMessage("正在保存...");
    const payload = formToPayload(form);
    const url = form.id ? `/api/transactions/${form.id}` : "/api/transactions";
    const res = await fetch(url, {
      method: form.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMessage(data.error ? `保存失败：${data.error}` : "保存失败");
      setBusy(false);
      return;
    }

    const data = await res.json();
    const tx = normalizeApiTransaction(data.transaction);
    setItems((current) =>
      form.id
        ? current.map((item) => (item.id === tx.id ? tx : item))
        : [tx, ...current]
    );
    setDialogOpen(false);
    setBusy(false);
    router.refresh();
  }

  async function deleteTransaction(row: TransactionRow) {
    const ok = window.confirm(`删除交易「${row.description}」？此操作不可撤销。`);
    if (!ok) return;

    setBusy(true);
    const res = await fetch(`/api/transactions/${row.id}`, {
      method: "DELETE",
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMessage(data.error ? `删除失败：${data.error}` : "删除失败");
      return;
    }
    setItems((current) => current.filter((item) => item.id !== row.id));
    router.refresh();
  }

  function clearFilters() {
    setQuery("");
    setType("all");
    setCategory("");
    setDateFrom("");
    setDateTo("");
  }

  return (
    <div className="min-w-0 space-y-4">
      <section className="rounded border border-slate-200 bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.2fr_0.7fr_0.8fr_0.8fr_0.8fr_auto]">
          <div>
            <label className="text-xs text-slate-500" htmlFor="txSearch">
              搜索
            </label>
            <input
              id="txSearch"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="描述、商户、分类"
              className="mt-1 h-10 w-full rounded border border-slate-300 px-3 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500" htmlFor="txType">
              类型
            </label>
            <select
              id="txType"
              value={type}
              onChange={(event) =>
                setType(event.target.value as "all" | "expense" | "income")
              }
              className="mt-1 h-10 w-full rounded border border-slate-300 px-2 text-sm"
            >
              <option value="all">全部</option>
              <option value="expense">支出</option>
              <option value="income">收入</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500" htmlFor="txCategory">
              分类
            </label>
            <select
              id="txCategory"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="mt-1 h-10 w-full rounded border border-slate-300 px-2 text-sm"
            >
              <option value="">全部分类</option>
              <option value="未分类">未分类</option>
              {categories.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500" htmlFor="txDateFrom">
              起始日期
            </label>
            <input
              id="txDateFrom"
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="mt-1 h-10 w-full rounded border border-slate-300 px-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500" htmlFor="txDateTo">
              结束日期
            </label>
            <input
              id="txDateTo"
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="mt-1 h-10 w-full rounded border border-slate-300 px-2 text-sm"
            />
          </div>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-1">
            <button
              type="button"
              onClick={clearFilters}
              className="h-10 flex-1 rounded border border-slate-300 bg-white px-3 text-sm lg:flex-none"
            >
              清除
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="h-10 flex-1 rounded bg-slate-950 px-4 text-sm text-white lg:flex-none"
            >
              新增
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="筛选结果" value={`${filtered.length} 笔`} />
        <Metric label="收入" value={formatCurrency(totals.income)} />
        <Metric label="支出" value={formatCurrency(totals.expense)} />
        <Metric
          label="净值"
          value={formatCurrency(totals.income + totals.expense)}
        />
      </section>

      {message && (
        <div className="rounded border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          {message}
        </div>
      )}

      <section className="rounded border border-slate-200 bg-white">
        <div className="divide-y divide-slate-100 md:hidden">
          {filtered.map((row) => (
            <article key={row.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">{row.description}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {row.occurredAt.slice(0, 10)} ·{" "}
                    {row.merchant || "无商户"} · {row.category || "未分类"}
                  </div>
                  {row.jobId && (
                    <div className="mt-1 text-xs text-slate-400">来自导入</div>
                  )}
                </div>
                <div
                  className={
                    row.amount < 0
                      ? "shrink-0 text-right font-semibold text-red-600"
                      : "shrink-0 text-right font-semibold text-emerald-600"
                  }
                >
                  {formatCurrency(row.amount)}
                  <div className="mt-1 text-xs font-normal text-slate-500">
                    {row.currency}
                  </div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => openEdit(row)}
                  className="rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  编辑
                </button>
                <button
                  type="button"
                  onClick={() => deleteTransaction(row)}
                  className="rounded border border-red-200 bg-white px-3 py-2 text-sm text-red-700"
                >
                  删除
                </button>
              </div>
            </article>
          ))}
          {filtered.length === 0 && (
            <div className="px-4 py-12 text-center text-sm text-slate-500">
              没有匹配的交易。
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="hidden min-w-[880px] w-full text-sm md:table">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">日期</th>
                <th className="px-4 py-3 text-left">描述</th>
                <th className="px-4 py-3 text-left">商户</th>
                <th className="px-4 py-3 text-right">金额</th>
                <th className="px-4 py-3 text-left">币种</th>
                <th className="px-4 py-3 text-left">分类</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((row) => (
                <tr key={row.id}>
                  <td className="whitespace-nowrap px-4 py-3">
                    {row.occurredAt.slice(0, 10)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{row.description}</div>
                    {row.jobId && (
                      <div className="text-xs text-slate-400">来自导入</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {row.merchant || "-"}
                  </td>
                  <td
                    className={
                      row.amount < 0
                        ? "px-4 py-3 text-right font-medium text-red-600"
                        : "px-4 py-3 text-right font-medium text-emerald-600"
                    }
                  >
                    {formatCurrency(row.amount)}
                  </td>
                  <td className="px-4 py-3">{row.currency}</td>
                  <td className="px-4 py-3">{row.category || "未分类"}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(row)}
                        className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs"
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteTransaction(row)}
                        className="rounded border border-red-200 bg-white px-3 py-1.5 text-xs text-red-700"
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-12 text-center text-sm text-slate-500"
                  >
                    没有匹配的交易。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {dialogOpen && (
        <TransactionDialog
          busy={busy}
          form={form}
          categories={categories}
          onClose={() => setDialogOpen(false)}
          onChange={setForm}
          onSave={saveTransaction}
        />
      )}
    </div>
  );
}

function TransactionDialog({
  busy,
  form,
  categories,
  onClose,
  onChange,
  onSave,
}: {
  busy: boolean;
  form: TransactionForm;
  categories: string[];
  onClose: () => void;
  onChange: (form: TransactionForm) => void;
  onSave: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/30 p-0 sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t border border-slate-200 bg-white shadow-xl sm:max-w-2xl sm:rounded">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="font-semibold">{form.id ? "编辑交易" : "新增交易"}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          >
            关闭
          </button>
        </div>
        <div className="grid gap-4 p-5 md:grid-cols-2">
          <Field label="日期">
            <input
              type="date"
              value={form.date}
              onChange={(event) =>
                onChange({ ...form, date: event.target.value })
              }
              className="h-10 w-full rounded border border-slate-300 px-3 text-sm"
            />
          </Field>
          <Field label="金额">
            <input
              type="number"
              step="0.01"
              value={form.amount}
              onChange={(event) =>
                onChange({ ...form, amount: event.target.value })
              }
              className="h-10 w-full rounded border border-slate-300 px-3 text-sm"
            />
          </Field>
          <Field label="描述">
            <input
              value={form.description}
              onChange={(event) =>
                onChange({ ...form, description: event.target.value })
              }
              className="h-10 w-full rounded border border-slate-300 px-3 text-sm"
            />
          </Field>
          <Field label="商户">
            <input
              value={form.merchant}
              onChange={(event) =>
                onChange({ ...form, merchant: event.target.value })
              }
              className="h-10 w-full rounded border border-slate-300 px-3 text-sm"
            />
          </Field>
          <Field label="币种">
            <input
              value={form.currency}
              onChange={(event) =>
                onChange({ ...form, currency: event.target.value.toUpperCase() })
              }
              className="h-10 w-full rounded border border-slate-300 px-3 text-sm"
            />
          </Field>
          <Field label="分类">
            <select
              value={form.category}
              onChange={(event) =>
                onChange({ ...form, category: event.target.value })
              }
              className="h-10 w-full rounded border border-slate-300 px-3 text-sm"
            >
              <option value="">未分类</option>
              {categories.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={busy || !form.date || !form.description || !form.amount}
            className="rounded bg-slate-950 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="text-xs text-slate-500">{label}</span>
      {children}
    </label>
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

function newForm(date?: string): TransactionForm {
  return {
    date: date || new Date().toISOString().slice(0, 10),
    description: "",
    merchant: "",
    amount: "",
    currency: "CNY",
    category: "",
  };
}

function formToPayload(form: TransactionForm) {
  return {
    occurredAt: `${form.date}T00:00:00.000Z`,
    description: form.description,
    merchant: form.merchant || null,
    amount: Number(form.amount),
    currency: form.currency || "CNY",
    category: form.category || null,
  };
}

function normalizeApiTransaction(input: TransactionRow): TransactionRow {
  return {
    id: input.id,
    occurredAt: input.occurredAt,
    description: input.description,
    merchant: input.merchant,
    amount: Number(input.amount),
    currency: input.currency,
    category: input.category,
    jobId: input.jobId,
  };
}
