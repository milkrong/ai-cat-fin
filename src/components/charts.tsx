"use client";
import React from "react";
import { formatNumber, formatCurrency } from "@/src/lib/format";

interface DailyPoint {
  date: string; // YYYY-MM-DD
  expense: number; // negative
  income: number; // positive
}
interface CategoryPoint {
  category: string;
  amount: number; // absolute expense total
}

export function TrendAreaChart({
  data,
  height = 140,
  ariaLabel = "每日支出趋势",
}: {
  data: DailyPoint[];
  height?: number;
  ariaLabel?: string;
}) {
  if (!data.length) return <EmptyChart label={ariaLabel} />;
  const expenses = data.map((d) => Math.abs(d.expense));
  const max = Math.max(...expenses, 1);
  const width = Math.max(data.length * 24, 240);
  const points = data
    .map((d, i) => {
      const x = (i / (data.length - 1)) * (width - 20) + 10;
      const y = height - 20 - (Math.abs(d.expense) / max) * (height - 40);
      return `${x},${y}`;
    })
    .join(" ");
  const areaPath = `M10,${height - 20} L${points.replace(/ /g, " L")} L${
    width - 10
  },${height - 20} Z`;
  return (
    <figure aria-label={ariaLabel} className="w-full overflow-x-auto">
      <svg
        role="img"
        aria-hidden={false}
        width={width}
        height={height}
        className="text-red-500"
      >
        <title>{ariaLabel}</title>
        <defs>
          <linearGradient id="grad-exp" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(239,68,68,0.5)" />
            <stop offset="100%" stopColor="rgba(239,68,68,0)" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#grad-exp)" stroke="none" />
        <polyline
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          points={points}
        />
        {data.map((d, i) => {
          const x = (i / (data.length - 1)) * (width - 20) + 10;
          const y = height - 20 - (Math.abs(d.expense) / max) * (height - 40);
          return (
            <circle key={d.date} cx={x} cy={y} r={3} className="fill-current">
              <title>
                {d.date} 支出 {formatCurrency(Math.abs(d.expense))}
              </title>
            </circle>
          );
        })}
        {/* Axis */}
        <line
          x1={10}
          y1={height - 20}
          x2={width - 10}
          y2={height - 20}
          stroke="#ddd"
        />
      </svg>
      <figcaption className="sr-only">{ariaLabel}</figcaption>
    </figure>
  );
}

export function CategoryBarChart({
  data,
  height = 160,
  ariaLabel = "类别支出分布",
}: {
  data: CategoryPoint[];
  height?: number;
  ariaLabel?: string;
}) {
  if (!data.length) return <EmptyChart label={ariaLabel} />;
  const total = data.reduce((a, b) => a + b.amount, 0) || 1;
  const max = Math.max(...data.map((d) => d.amount), 1);
  const barWidth = 34;
  const width = data.length * barWidth + 20;
  return (
    <figure aria-label={ariaLabel} className="w-full overflow-x-auto">
      <svg role="img" aria-hidden={false} width={width} height={height}>
        <title>{ariaLabel}</title>
        {data.map((d, i) => {
          const h = (d.amount / max) * (height - 40);
          const x = 10 + i * barWidth + 6;
          const y = height - 20 - h;
          const pct = ((d.amount / total) * 100).toFixed(1);
          return (
            <g key={d.category}>
              <rect
                x={x}
                y={y}
                width={barWidth - 12}
                height={h}
                rx={4}
                className="fill-blue-500/70"
              >
                <title>
                  {d.category}: {formatCurrency(d.amount)} ({pct}%)
                </title>
              </rect>
              <text
                x={x + (barWidth - 12) / 2}
                y={height - 6}
                fontSize={10}
                textAnchor="middle"
                className="fill-gray-600"
              >
                {d.category}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="sr-only">{ariaLabel}</figcaption>
    </figure>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div
      aria-label={label}
      className="w-full h-24 flex items-center justify-center text-xs text-gray-400 border rounded"
    >
      无数据
    </div>
  );
}
