import type { KpiSummary, PackageTier, RawDataset } from "../../types";
import { aggregatePackageDistribution } from "./packages";
import { activeClientsAt, identifyChurnedClients, joinLocales } from "./churn";
import { shiftDays, todayIso } from "./shared";

export function computeKpis(ds: RawDataset, warnings: string[]): KpiSummary {
  const asOf = todayIso();
  const locales = joinLocales(ds, []);

  // Active clients = distinct non-dummy clients with a currently active locale.
  const activeNow = new Set<string>();
  for (const loc of locales) {
    const active =
      loc.status === "active" ||
      (loc.status !== "cancelled" && loc.serviceEnd == null) ||
      (loc.serviceEnd != null && loc.serviceEnd >= asOf && loc.status !== "cancelled");
    if (active) activeNow.add(loc.clientId);
  }

  // Distribution "now" = tier split of the latest monthly_strategy month.
  const distPoints = aggregatePackageDistribution(ds, 1, []);
  const latest = distPoints[distPoints.length - 1];
  const currentDistribution: Record<PackageTier, number> = latest
    ? { package1: latest.package1, package2: latest.package2, package3: latest.package3 }
    : { package1: 0, package2: 0, package3: 0 };

  let activeClients = activeNow.size;
  if (activeClients === 0) {
    activeClients = latest?.total ?? 0;
    warnings.push(
      "KPIs: no active domain_locale rows found; falling back to client count of the latest monthly_strategy month",
    );
  }

  const churned = identifyChurnedClients(ds, []); // warnings collected via churn aggregation
  const d30 = shiftDays(asOf, -30);
  const d90 = shiftDays(asOf, -90);
  const churnedLast30d = churned.filter((c) => c.churnDate >= d30 && c.churnDate <= asOf).length;
  const churnedLast90d = churned.filter((c) => c.churnDate >= d90 && c.churnDate <= asOf).length;

  const activeAt90 = activeClientsAt(locales, d90);
  const churnRate90d = activeAt90 > 0 ? churnedLast90d / activeAt90 : 0;

  return { activeClients, currentDistribution, churnedLast30d, churnedLast90d, churnRate90d, asOf };
}
