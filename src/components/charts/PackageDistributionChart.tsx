"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PackageDistributionPoint } from "@/lib/types";
import { formatMonthLabel } from "@/lib/format";

const TOOLTIP_STYLE = {
  backgroundColor: "#111a2e",
  border: "1px solid #1e293b",
  borderRadius: 8,
  color: "#e2e8f0",
  fontSize: 12,
} as const;

const TIER_LABELS: Record<string, string> = {
  package1: "Package 1 (10/mo)",
  package2: "Package 2 (20/mo)",
  package3: "Package 3 (40/mo)",
};

export default function PackageDistributionChart({
  data,
}: {
  data: PackageDistributionPoint[];
}) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid stroke="#1e293b" vertical={false} />
          <XAxis
            dataKey="month"
            tickFormatter={formatMonthLabel}
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            axisLine={{ stroke: "#1e293b" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            cursor={{ fill: "rgba(148, 163, 184, 0.08)" }}
            labelFormatter={(label) => formatMonthLabel(String(label))}
            formatter={(value: number | string, name: string) => [
              value,
              TIER_LABELS[name] ?? name,
            ]}
          />
          <Legend
            formatter={(value: string) => (
              <span style={{ color: "#94a3b8", fontSize: 12 }}>{TIER_LABELS[value] ?? value}</span>
            )}
          />
          <Bar dataKey="package1" stackId="a" fill="#38bdf8" radius={[0, 0, 0, 0]} />
          <Bar dataKey="package2" stackId="a" fill="#a78bfa" />
          <Bar dataKey="package3" stackId="a" fill="#fbbf24" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
