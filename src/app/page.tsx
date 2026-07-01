import { getDashboardData } from "@/lib/data";
import DemoBanner from "@/components/DemoBanner";
import KpiCards from "@/components/KpiCards";
import SectionCard from "@/components/SectionCard";
import PackageDistributionChart from "@/components/charts/PackageDistributionChart";
import GscTrendChart from "@/components/charts/GscTrendChart";
import ChurnChart from "@/components/charts/ChurnChart";

export const revalidate = 300;

export default async function DashboardPage() {
  const { kpis, packageDistribution, gscTrend, churn, meta } = await getDashboardData();

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            InSpace.io — Leadership Dashboard
          </h1>
          <p className="mt-1 text-sm text-ink-muted" suppressHydrationWarning>
            As of {kpis.asOf}
          </p>
        </div>
      </header>

      {meta.demoMode ? (
        <div className="mb-6">
          <DemoBanner />
        </div>
      ) : null}

      <div className="mb-6">
        <KpiCards kpis={kpis} />
      </div>

      <div className="grid grid-cols-1 gap-6">
        <SectionCard
          title="Package Distribution Over Time"
          subtitle="Distinct clients per package tier per month (from monthly strategies)"
        >
          <PackageDistributionChart data={packageDistribution} />
        </SectionCard>

        <SectionCard
          title="Google Search Console — Client Results Over Time"
          subtitle="Aggregated sitewide metrics across all non-dummy clients"
        >
          <GscTrendChart
            data={gscTrend}
            comboCaption={`GSC combo in use — window: ${meta.gscCombo.windowKey} · metric: ${meta.gscCombo.metricKey} · segment: ${meta.gscCombo.segment}`}
          />
        </SectionCard>

        <SectionCard
          title="Churn per Package Over Time"
          subtitle="Churned clients per package tier (bars, left) and monthly churn rate (line, right)"
        >
          <ChurnChart data={churn} />
        </SectionCard>
      </div>

      {meta.warnings.length > 0 ? (
        <details className="mt-6 rounded-xl border border-panel-border bg-panel/60 px-4 py-3 text-xs text-ink-faint">
          <summary className="cursor-pointer select-none font-medium text-ink-muted">
            Data caveats ({meta.warnings.length})
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {meta.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </details>
      ) : null}

      <footer className="mt-8 text-center text-[11px] text-ink-faint" suppressHydrationWarning>
        InSpace.io internal — data refreshes every 5 minutes.
      </footer>
    </main>
  );
}
