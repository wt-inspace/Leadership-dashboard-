"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { GscTrendPoint } from "@/lib/types";
import { formatCompact, formatMonthLabel, formatPercent } from "@/lib/format";

const TOOLTIP_STYLE = {
  backgroundColor: "#111a2e",
  border: "1px solid #1e293b",
  borderRadius: 8,
  color: "#e2e8f0",
  fontSize: 12,
} as const;

const AXIS_TICK = { fill: "#94a3b8", fontSize: 10 } as const;

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-ink-faint">
        {title}
      </p>
      <div className="h-40 w-full">{children}</div>
    </div>
  );
}

export default function GscTrendChart({
  data,
  comboCaption,
}: {
  data: GscTrendPoint[];
  comboCaption: string;
}) {
  const shared = {
    margin: { top: 4, right: 8, left: -8, bottom: 0 },
  };

  return (
    <div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Panel title="Clicks">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} {...shared}>
              <CartesianGrid stroke="#1e293b" vertical={false} />
              <XAxis dataKey="month" tickFormatter={formatMonthLabel} tick={AXIS_TICK} axisLine={{ stroke: "#1e293b" }} tickLine={false} />
              <YAxis tickFormatter={formatCompact} tick={AXIS_TICK} axisLine={false} tickLine={false} width={44} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelFormatter={(l) => formatMonthLabel(String(l))}
                formatter={(v: number | string) => [formatCompact(Number(v)), "Clicks"]}
              />
              <Area type="monotone" dataKey="clicks" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.18} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Impressions">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} {...shared}>
              <CartesianGrid stroke="#1e293b" vertical={false} />
              <XAxis dataKey="month" tickFormatter={formatMonthLabel} tick={AXIS_TICK} axisLine={{ stroke: "#1e293b" }} tickLine={false} />
              <YAxis tickFormatter={formatCompact} tick={AXIS_TICK} axisLine={false} tickLine={false} width={44} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelFormatter={(l) => formatMonthLabel(String(l))}
                formatter={(v: number | string) => [formatCompact(Number(v)), "Impressions"]}
              />
              <Area type="monotone" dataKey="impressions" stroke="#a78bfa" fill="#a78bfa" fillOpacity={0.18} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="CTR">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} {...shared}>
              <CartesianGrid stroke="#1e293b" vertical={false} />
              <XAxis dataKey="month" tickFormatter={formatMonthLabel} tick={AXIS_TICK} axisLine={{ stroke: "#1e293b" }} tickLine={false} />
              <YAxis tickFormatter={(v: number) => formatPercent(v, 1)} tick={AXIS_TICK} axisLine={false} tickLine={false} width={44} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelFormatter={(l) => formatMonthLabel(String(l))}
                formatter={(v: number | string) => [formatPercent(Number(v)), "CTR"]}
              />
              <Line type="monotone" dataKey="ctr" stroke="#34d399" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Avg position (lower is better)">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} {...shared}>
              <CartesianGrid stroke="#1e293b" vertical={false} />
              <XAxis dataKey="month" tickFormatter={formatMonthLabel} tick={AXIS_TICK} axisLine={{ stroke: "#1e293b" }} tickLine={false} />
              <YAxis reversed tickFormatter={(v: number) => v.toFixed(0)} tick={AXIS_TICK} axisLine={false} tickLine={false} width={44} domain={["auto", "auto"]} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelFormatter={(l) => formatMonthLabel(String(l))}
                formatter={(v: number | string) => [Number(v).toFixed(1), "Avg position"]}
              />
              <Line type="monotone" dataKey="position" stroke="#fbbf24" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
      </div>
      <p className="mt-3 text-[11px] text-ink-faint">{comboCaption}</p>
    </div>
  );
}
