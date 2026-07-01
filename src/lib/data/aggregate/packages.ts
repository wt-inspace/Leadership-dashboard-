import type { PackageDistributionPoint, PackageTier, RawDataset } from "../../types";
import { dummyClientIds, monthKeyFromPeriod, subscriptionTierMap, tierFromItems } from "./shared";

const KNOWN_STATUSES = new Set([
  "approved",
  "completed",
  "draft",
  "pending",
  "in_progress",
  "cancelled",
]);

/** approved/completed rows outrank everything else; unknown statuses rank lowest. */
function statusRank(status: string | null): number {
  const s = (status ?? "").toLowerCase();
  if (s === "approved" || s === "completed") return 0;
  if (KNOWN_STATUSES.has(s)) return 1;
  return 2;
}

export function aggregatePackageDistribution(
  ds: RawDataset,
  monthsBack: number,
  warnings: string[],
): PackageDistributionPoint[] {
  const dummies = dummyClientIds(ds);
  const subTiers = subscriptionTierMap(ds);

  // Dedupe per client-month: best status rank, then highest strategy_version.
  const best = new Map<string, { rank: number; version: number; items: number | null; clientId: string; month: string }>();
  const unknownStatuses = new Set<string>();

  for (const row of ds.monthlyStrategies) {
    if (row.client_id == null) continue;
    const clientId = String(row.client_id);
    if (dummies.has(clientId)) continue;
    const month = monthKeyFromPeriod(row.year_period, row.month_period, row.start_date);
    if (!month) continue;

    const rank = statusRank(row.status);
    if (rank === 2 && row.status) unknownStatuses.add(row.status);
    const version = row.strategy_version ?? 0;
    const key = `${clientId}|${month}`;
    const cur = best.get(key);
    if (!cur || rank < cur.rank || (rank === cur.rank && version > cur.version)) {
      best.set(key, { rank, version, items: row.items_per_month, clientId, month });
    }
  }

  if (unknownStatuses.size > 0) {
    warnings.push(
      `monthly_strategy: unknown status value(s) treated as lowest preference: ${[...unknownStatuses].join(", ")}`,
    );
  }

  // Tier per deduped client-month, with fallback chain.
  const byMonth = new Map<string, Record<PackageTier, number>>();
  let tierFallbackCount = 0;
  for (const entry of best.values()) {
    let tier = tierFromItems(entry.items);
    if (!tier) tier = subTiers.get(entry.clientId) ?? null;
    if (!tier) {
      tier = "package1";
      tierFallbackCount++;
    }
    let counts = byMonth.get(entry.month);
    if (!counts) {
      counts = { package1: 0, package2: 0, package3: 0 };
      byMonth.set(entry.month, counts);
    }
    counts[tier]++;
  }

  if (tierFallbackCount > 0) {
    warnings.push(
      `package distribution: ${tierFallbackCount} client-month(s) had no resolvable items_per_month; defaulted to Package 1`,
    );
  }

  const monthKeys = [...byMonth.keys()].sort().slice(-monthsBack);
  return monthKeys.map((month) => {
    const c = byMonth.get(month)!;
    return { month, ...c, total: c.package1 + c.package2 + c.package3 };
  });
}
