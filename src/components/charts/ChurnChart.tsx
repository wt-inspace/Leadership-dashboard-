"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChurnPoint } from "@/lib/types";
import { formatMonthLabel, formatPercent } from "@/lib/format";

const TOOLTIP_STYLE = {
  backgroundColor: "#111a2e",
  border: "1px solid #1e293b",
  borderRadius: 8,
  color: "#e2e8f0",
  fontSize: 12,
} as const;

const SERIES_LABELS: Record<string, string> = {
  package1: "Package 1",
  package2: "Package 2",
  package3: "Package 3",
  churnRate: "Churn rate",
};

export default function ChurnChart({ data }: { data: ChurnPoint[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 4, right: 0, left: -12, bottom: 0 }}>
          <CartesianGrid stroke="#1e293b" vertical={false} />
          <XAxis
            dataKey="month"
            tickFormatter={formatMonthLabel}
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            axisLine={{ stroke: "#1e293b" }}
            tickLine={false}
          />
          <YAxis
            yAxisId="left"
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tickFormatter={(v: number) => formatPercent(v, 1)}
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={48}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            cursor={{ fill: "rgba(148, 163, 184, 0.08)" }}
            labelFormatter={(l) => formatMonthLabel(String(l))}
            formatter={(value: number | string, name: string) => [
              name === "churnRate" ? formatPercent(Number(value)) : value,
              SERIES_LABELS[name] ?? name,
            ]}
          />
          <Legend
            formatter={(value: string) => (
              <span style={{ color: "#94a3b8", fontSize: 12 }}>
                {SERIES_LABELS[value] ?? value}
              </span>
            )}
          />
          <Bar yAxisId="left" dataKey="package1" stackId="churn" fill="#38bdf8" />
          <Bar yAxisId="left" dataKey="package2" stackId="churn" fill="#a78bfa" />
          <Bar yAxisId="left" dataKey="package3" stackId="churn" fill="#fbbf24" radius={[3, 3, 0, 0]} />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="churnRate"
            stroke="#f87171"
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
