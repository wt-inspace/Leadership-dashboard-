import type { KpiSummary } from "@/lib/types";
import { formatPercent } from "@/lib/format";

function Card({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "danger";
}) {
  return (
    <div className="rounded-2xl border border-panel-border bg-panel p-4 shadow-lg shadow-black/20">
      <p className="text-[11px] font-medium uppercase tracking-wider text-ink-faint">{label}</p>
      <p
        className={`mt-1.5 text-2xl font-semibold tabular-nums tracking-tight ${
          tone === "danger" ? "text-danger" : "text-ink"
        }`}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-ink-muted">{hint}</p> : null}
    </div>
  );
}

export default function KpiCards({ kpis }: { kpis: KpiSummary }) {
  const d = kpis.currentDistribution;
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
      <Card label="Active clients" value={String(kpis.activeClients)} hint="Currently subscribed" />
      <Card
        label="Package mix (now)"
        value={`${d.package1} · ${d.package2} · ${d.package3}`}
        hint="P1 · P2 · P3, latest month"
      />
      <Card label="Churned (30d)" value={String(kpis.churnedLast30d)} hint="Trailing 30 days" tone="danger" />
      <Card label="Churned (90d)" value={String(kpis.churnedLast90d)} hint="Trailing 90 days" tone="danger" />
      <Card
        label="90d churn rate"
        value={formatPercent(kpis.churnRate90d)}
        hint="vs. active clients 90 days ago"
        tone="danger"
      />
    </div>
  );
}
