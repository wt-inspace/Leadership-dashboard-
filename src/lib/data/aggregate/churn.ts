import type { ChurnPoint, PackageTier, RawDataset } from "../../types";
import {
  dummyClientIds,
  lastNMonthKeys,
  monthKeyFromPeriod,
  subscriptionTierMap,
  tierFromItems,
} from "./shared";

const KNOWN_LOCALE_STATUSES = new Set(["active", "cancelled", "paused", "trial", "pending"]);

export interface ChurnedClient {
  clientId: string;
  churnMonth: string; // "YYYY-MM"
  churnDate: string; // service_end "YYYY-MM-DD"
  tier: PackageTier;
}

interface JoinedLocale {
  clientId: string;
  status: string;
  serviceStart: string | null;
  serviceEnd: string | null;
  itemsPerMonth: number | null;
}

/** Node-join domain_locale -> domain -> Client, dropping dummy clients. */
export function joinLocales(ds: RawDataset, warnings: string[]): JoinedLocale[] {
  const dummies = dummyClientIds(ds);
  const domainToClient = new Map<string, string>();
  for (const d of ds.domains) {
    if (d.client_id != null) domainToClient.set(String(d.domain_id), String(d.client_id));
  }

  const unknownStatuses = new Set<string>();
  const out: JoinedLocale[] = [];
  for (const loc of ds.domainLocales) {
    if (loc.domain_id == null) continue;
    const clientId = domainToClient.get(String(loc.domain_id));
    if (!clientId || dummies.has(clientId)) continue;
    const status = (loc.subscription_status ?? "").toLowerCase();
    if (status && !KNOWN_LOCALE_STATUSES.has(status)) unknownStatuses.add(loc.subscription_status!);
    out.push({
      clientId,
      status,
      serviceStart: loc.service_start,
      serviceEnd: loc.service_end,
      itemsPerMonth: loc.items_per_month,
    });
  }
  if (unknownStatuses.size > 0) {
    warnings.push(
      `domain_locale: unknown subscription_status value(s): ${[...unknownStatuses].join(", ")}`,
    );
  }
  return out;
}

/** A locale still counts as active if flagged active, or open-ended and not cancelled. */
function isActiveLocale(loc: JoinedLocale): boolean {
  if (loc.status === "active") return true;
  return loc.status !== "cancelled" && loc.serviceEnd == null;
}

/** client_id -> items_per_month from that client's latest monthly_strategy row. */
function latestStrategyItems(ds: RawDataset): Map<string, number | null> {
  const latest = new Map<string, { month: string; items: number | null }>();
  for (const row of ds.monthlyStrategies) {
    if (row.client_id == null) continue;
    const month = monthKeyFromPeriod(row.year_period, row.month_period, row.start_date);
    if (!month || row.items_per_month == null) continue;
    const clientId = String(row.client_id);
    const cur = latest.get(clientId);
    if (!cur || month > cur.month) latest.set(clientId, { month, items: row.items_per_month });
  }
  const out = new Map<string, number | null>();
  for (const [k, v] of latest) out.set(k, v.items);
  return out;
}

/**
 * Distinct churned clients: cancelled locale with a service_end, and no other
 * locale still active. Shared by the churn chart and the KPI cards.
 */
export function identifyChurnedClients(ds: RawDataset, warnings: string[]): ChurnedClient[] {
  const locales = joinLocales(ds, warnings);
  const subTiers = subscriptionTierMap(ds);
  const stratItems = latestStrategyItems(ds);

  const byClient = new Map<string, JoinedLocale[]>();
  for (const loc of locales) {
    const arr = byClient.get(loc.clientId);
    if (arr) arr.push(loc);
    else byClient.set(loc.clientId, [loc]);
  }

  const churned: ChurnedClient[] = [];
  let tierFallbackCount = 0;

  for (const [clientId, locs] of byClient) {
    if (locs.some(isActiveLocale)) continue; // still has an active locale
    const cancelled = locs.filter(
      (l) => l.status === "cancelled" && l.serviceEnd != null && /^\d{4}-\d{2}/.test(l.serviceEnd),
    );
    if (cancelled.length === 0) continue;

    // Churn month = month of the latest service_end.
    cancelled.sort((a, b) => (a.serviceEnd! < b.serviceEnd! ? 1 : -1));
    const last = cancelled[0];

    let tier =
      tierFromItems(last.itemsPerMonth) ??
      tierFromItems(stratItems.get(clientId) ?? null) ??
      subTiers.get(clientId) ??
      null;
    if (!tier) {
      tier = "package1";
      tierFallbackCount++;
    }

    churned.push({
      clientId,
      churnMonth: last.serviceEnd!.slice(0, 7),
      churnDate: last.serviceEnd!.slice(0, 10),
      tier,
    });
  }

  if (tierFallbackCount > 0) {
    warnings.push(
      `churn: ${tierFallbackCount} churned client(s) had no resolvable package; defaulted to Package 1`,
    );
  }
  return churned;
}

/** Distinct clients with any locale spanning the given date ("YYYY-MM-DD"). */
export function activeClientsAt(locales: JoinedLocale[], date: string): number {
  const active = new Set<string>();
  for (const loc of locales) {
    if (loc.serviceStart == null || loc.serviceStart >= date) continue;
    if (loc.serviceEnd == null || loc.serviceEnd >= date) active.add(loc.clientId);
  }
  return active.size;
}

export function aggregateChurn(
  ds: RawDataset,
  monthsBack: number,
  warnings: string[],
): ChurnPoint[] {
  const churned = identifyChurnedClients(ds, warnings);
  const locales = joinLocales(ds, []); // warnings already collected above

  const byMonth = new Map<string, ChurnedClient[]>();
  for (const c of churned) {
    const arr = byMonth.get(c.churnMonth);
    if (arr) arr.push(c);
    else byMonth.set(c.churnMonth, [c]);
  }

  return lastNMonthKeys(monthsBack).map((month) => {
    const monthStart = `${month}-01`;
    const inMonth = byMonth.get(month) ?? [];
    const counts: Record<PackageTier, number> = { package1: 0, package2: 0, package3: 0 };
    for (const c of inMonth) counts[c.tier]++;
    const totalChurned = inMonth.length;
    const activeAtStart = activeClientsAt(locales, monthStart);
    return {
      month,
      ...counts,
      totalChurned,
      activeAtStart,
      churnRate: activeAtStart > 0 ? totalChurned / activeAtStart : 0,
    };
  });
}
