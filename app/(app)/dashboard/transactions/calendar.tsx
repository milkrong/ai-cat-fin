"use client";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  endOfWeek,
  isToday,
} from "date-fns";
import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { formatCurrency } from "@/src/lib/format";

interface CalendarProps {
  daysWithCounts: { date: string; count: number }[]; // kept for existing server-provided counts (fallback)
  initialMonth?: string; // YYYY-MM
}

export function TransactionsCalendar({
  daysWithCounts,
  initialMonth,
}: CalendarProps) {
  const search = useSearchParams();
  const router = useRouter();
  const selectedDateParam = search.get("date");
  const initial = initialMonth
    ? parseISO(initialMonth + "-01")
    : selectedDateParam
    ? parseISO(selectedDateParam)
    : new Date();
  const [month, setMonth] = useState<Date>(initial);

  const map = useMemo(
    () => new Map(daysWithCounts.map((d) => [d.date, d.count])),
    [daysWithCounts]
  );

  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(monthStart);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const monthKey = format(monthStart, "yyyy-MM");

  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  // monthly summary state
  interface DailyDetail {
    date: string;
    income: number;
    expense: number; // negative
    expenseAbs: number; // positive
    count: number;
  }
  interface SummaryData {
    income: number;
    expense: number; // negative aggregate
    expenseAbs: number;
    net: number;
    txCount: number;
    days: DailyDetail[];
    averages?: {
      calendar: { income: number; expense: number };
      active: { income: number; expense: number };
    };
    signMode: "standard" | "positive-expense";
  }
  interface SummaryState {
    loading: boolean;
    data?: SummaryData;
    error?: string;
  }
  const [summary, setSummary] = useState<SummaryState>({ loading: true });
  const dailyDetail = useMemo(() => {
    if (!summary || summary.loading || !summary.data?.days)
      return new Map<string, DailyDetail>();
    return new Map(summary.data.days.map((d) => [d.date, d]));
  }, [summary]);

  useEffect(() => {
    const controller = new AbortController();
    const monthStr = monthKey;
    setSummary({ loading: true });
    fetch(`/api/transactions/summary?month=${monthStr}`, {
      signal: controller.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => {
        setSummary({ loading: false, data: json });
      })
      .catch((e) => {
        if (e.name === "AbortError") return;
        setSummary({ loading: false, error: e.message });
      });
    return () => controller.abort();
  }, [monthKey]);

  // Build full month days (not the grid) for trend chart once summary is loaded
  const monthDays = useMemo(() => {
    const start = monthStart;
    const end = monthEnd;
    return eachDayOfInterval({ start, end });
  }, [monthStart, monthEnd]);

  const expenseTrend = useMemo(() => {
    if (!summary || summary.loading || !summary.data) return null;
    const dailyMap = dailyDetail; // Map date -> detail
    const values = monthDays.map((d) => {
      const key = format(d, "yyyy-MM-dd");
      const detail = dailyMap.get(key);
      // Use expenseAbs (positive) as the expense value
      return detail ? detail.expenseAbs : 0;
    });
    const max = Math.max(...values, 0);
    return { values, max };
  }, [summary, dailyDetail, monthDays]);

  const Chart = () => {
    if (!expenseTrend || expenseTrend.max === 0) {
      return (
        <div className="text-[11px] text-gray-500 h-16 flex items-center justify-center">
          本月暂无支出数据
        </div>
      );
    }
    const { values, max } = expenseTrend;
    const h = 60;
    const w = 260; // fixed logical width for consistency
    const n = values.length;
    const step = n > 1 ? w / (n - 1) : 0;
    const points: { x: number; y: number }[] = values.map((v, i) => ({
      x: i * step,
      y: max === 0 ? h : h - (v / max) * (h - 4), // top padding 4px
    }));
    const linePath = points
      .map(
        (p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`
      )
      .join(" ");
    const areaPath = `${linePath} L${w},${h} L0,${h} Z`;
    // Removed unused first/last calculations to satisfy lint
    return (
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full h-20 overflow-visible"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="expenseGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#f87171" stopOpacity={0.5} />
            <stop offset="100%" stopColor="#f87171" stopOpacity={0} />
          </linearGradient>
        </defs>
        <path
          d={areaPath}
          fill="url(#expenseGradient)"
          stroke="none"
          className="transition-all duration-300"
        />
        <path
          d={linePath}
          fill="none"
          stroke="#dc2626"
          strokeWidth={1.5}
          className="drop-shadow-sm"
        />
        {points.map((p, i) =>
          values[i] > 0 ? (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={2.2}
              fill="#dc2626"
              className="opacity-80"
            />
          ) : null
        )}
        {/* Simple y-axis max label */}
        <text x={0} y={10} fontSize={8} fill="#9ca3af" className="select-none">
          {formatCurrency(max)}
        </text>
      </svg>
    );
  };

  const calendarCard = (
    <div className="border rounded p-3 space-y-3">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setMonth((m) => addMonths(m, -1))}
          className="px-2 py-1 text-sm border rounded hover:bg-gray-50"
        >
          ←
        </button>
        <div className="font-medium text-sm">
          {format(monthStart, "yyyy MMMM")}
        </div>
        <button
          onClick={() => setMonth((m) => addMonths(m, 1))}
          className="px-2 py-1 text-sm border rounded hover:bg-gray-50"
        >
          →
        </button>
      </div>
      <div className="grid grid-cols-7 text-[10px] text-center text-gray-500 gap-1">
        {["一", "二", "三", "四", "五", "六", "日"].map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const key = format(d, "yyyy-MM-dd");
          // prefer API daily count if available
          const detail = dailyDetail.get(key);
          const count = detail?.count ?? map.get(key) ?? 0;
          const isCurrentMonth = isSameMonth(d, monthStart);
          const selected =
            selectedDateParam && isSameDay(d, parseISO(selectedDateParam));
          const isWeekend = d.getDay() === 0 || d.getDay() === 6; // Sunday 0, Saturday 6
          const baseClasses =
            "aspect-square relative rounded border text-[11px] cursor-pointer flex flex-col items-center justify-center overflow-hidden";
          const stateClasses = selected
            ? "bg-blue-600 text-white border-blue-600"
            : isToday(d)
            ? "border-blue-500"
            : isCurrentMonth
            ? "bg-white hover:bg-gray-50"
            : "bg-gray-50 text-gray-400";
          const weekendClasses =
            !selected && isCurrentMonth && isWeekend
              ? d.getDay() === 0
                ? " text-red-500"
                : " text-amber-600"
              : "";
          return (
            <Link
              key={key}
              href={`/dashboard/transactions?date=${key}`}
              className={
                baseClasses + " group " + stateClasses + weekendClasses
              }
              prefetch={false}
            >
              <div className="flex flex-col items-center justify-between h-full py-1">
                <span className="text-xs leading-none">{format(d, "d")}</span>
                {count > 0 ? (
                  <span className="inline-flex items-center justify-center h-4 min-w-[1.1rem] px-1 rounded-full bg-blue-100 text-blue-700 text-[10px] leading-none">
                    {count}
                  </span>
                ) : (
                  <span className="h-4 min-w-[1.1rem] px-1 invisible" />
                )}
              </div>
              {detail && (
                <div className="pointer-events-none absolute z-10 bottom-full mb-1 w-36 origin-bottom scale-90 opacity-0 group-hover:opacity-100 group-hover:scale-100 transition-all bg-gray-900 text-white rounded p-2 shadow-lg text-[10px] flex flex-col gap-1">
                  <div className="flex justify-between">
                    <span>收入</span>
                    <span className="text-green-400">
                      {formatCurrency(detail.income)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>支出</span>
                    <span className="text-red-400">
                      {formatCurrency(-detail.expenseAbs)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>笔数</span>
                    <span>{detail.count}</span>
                  </div>
                </div>
              )}
            </Link>
          );
        })}
      </div>
      {selectedDateParam && (
        <button
          onClick={() => router.push("/dashboard/transactions")}
          className="w-full text-xs text-blue-600 underline"
        >
          清除选择
        </button>
      )}
      <div className="pt-1 border-t mt-2">
        {summary.loading && (
          <div className="text-[11px] text-gray-500">加载汇总...</div>
        )}
        {!summary.loading && summary.error && (
          <div className="text-[11px] text-red-500">
            加载失败: {summary.error}
          </div>
        )}
        {!summary.loading && summary.data && (
          <div className="flex flex-col gap-1 text-[11px] leading-tight">
            {summary.data.signMode !== "positive-expense" && (
              <div className="flex justify-between">
                <span>收入</span>
                <span className="text-green-600 font-medium">
                  {formatCurrency(summary.data.income)}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span>支出</span>
              <span className="text-red-600 font-medium">
                {formatCurrency(-summary.data.expenseAbs)}
              </span>
            </div>
            {summary.data.signMode !== "positive-expense" && (
              <div className="flex justify-between border-t pt-1">
                <span>净值</span>
                <span
                  className={
                    summary.data.net >= 0
                      ? "text-green-600 font-semibold"
                      : "text-red-600 font-semibold"
                  }
                >
                  {formatCurrency(summary.data.net)}
                </span>
              </div>
            )}
            {summary.data.averages && (
              <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] text-gray-600">
                {summary.data.signMode !== "positive-expense" && (
                  <>
                    <div>
                      日均收入:{" "}
                      {formatCurrency(summary.data.averages.calendar.income)}
                    </div>
                    <div>
                      活跃日均收入:{" "}
                      {formatCurrency(summary.data.averages.active.income)}
                    </div>
                  </>
                )}
                <div>
                  日均支出:{" "}
                  {formatCurrency(summary.data.averages.calendar.expense)}
                </div>
                <div>
                  活跃日均支出:{" "}
                  {formatCurrency(summary.data.averages.active.expense)}
                </div>
              </div>
            )}
            {summary.data.signMode === "positive-expense" && (
              <div className="mt-1 text-[10px] text-gray-400">
                检测到全部为支出，已按支出模式显示。
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const trendCard = (
    <div className="border rounded p-3 space-y-2">
      <div className="flex items-center justify-between text-[11px] font-medium text-gray-700">
        <span>月度支出趋势</span>
        {!summary.loading &&
          summary.data &&
          expenseTrend &&
          expenseTrend.max > 0 && (
            <span className="text-[10px] text-gray-400">
              最高日: {formatCurrency(expenseTrend.max)}
            </span>
          )}
      </div>
      {summary.loading ? (
        <div className="text-[11px] text-gray-500 h-20 flex items-center justify-center">
          加载中...
        </div>
      ) : summary.error ? (
        <div className="text-[11px] text-red-500 h-20 flex items-center justify-center">
          加载失败
        </div>
      ) : (
        <Chart />
      )}
      {summary.data && expenseTrend && expenseTrend.max > 0 && (
        <div className="flex justify-between text-[10px] text-gray-400">
          <span>1 日</span>
          <span>{format(monthEnd, "d")} 日</span>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      {calendarCard}
      {trendCard}
    </div>
  );
}
