import type { PackageDistributionPoint, PackageTier } from "../../types";
import { isActiveDuring, tierAt, type ClientModel } from "./model";
import { monthWindow } from "./shared";

/**
 * Active clients by package tier per month: a client counts in month M when
 * startMonth <= M and (not churned or churnMonth > M); its tier at M comes
 * from the client model's tier timeline (initial client_status.MRR, overridden
 * by monthly_strategy from each strategy month onward, with subscription /
 * stripe fallbacks).
 */
export function aggregatePackageDistribution(
  model: ClientModel,
  monthsBack: number,
): PackageDistributionPoint[] {
  return monthWindow(monthsBack).map((month) => {
    const counts: Record<PackageTier, number> = { package1: 0, package2: 0, package3: 0 };
    for (const s of model.states) {
      if (!isActiveDuring(s, month)) continue;
      counts[tierAt(s, month)]++;
    }
    return {
      month,
      ...counts,
      total: counts.package1 + counts.package2 + counts.package3,
    };
  });
}
