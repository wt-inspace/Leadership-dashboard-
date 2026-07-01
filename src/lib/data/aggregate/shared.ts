import type { PackageTier, RawDataset } from "../../types";

/** IDs of clients flagged as dummy — must be excluded from every metric. */
export function dummyClientIds(ds: RawDataset): Set<string> {
  const out = new Set<string>();
  for (const c of ds.clients) {
    if (c.dummy_client === true) out.add(String(c.client_id));
  }
  return out;
}

/** items_per_month -> tier. null/0/negative -> null (caller applies fallbacks). */
export function tierFromItems(items: number | null | undefined): PackageTier | null {
  if (items == null || !Number.isFinite(items) || items <= 0) return null;
  if (items <= 10) return "package1";
  if (items <= 20) return "package2";
  return "package3";
}

/** client_id -> tier derived from Client.subscription -> Subscription.items_per_month. */
export function subscriptionTierMap(ds: RawDataset): Map<string, PackageTier> {
  const subItems = new Map<string, number | null>();
  for (const s of ds.subscriptions) {
    if (s.subscription_type != null) subItems.set(String(s.subscription_type), s.items_per_month);
  }
  const out = new Map<string, PackageTier>();
  for (const c of ds.clients) {
    if (c.subscription == null) continue;
    const tier = tierFromItems(subItems.get(String(c.subscription)) ?? null);
    if (tier) out.set(String(c.client_id), tier);
  }
  return out;
}

/**
 * Normalize year_period/month_period (int or string) to "YYYY-MM".
 * Falls back to start_date.slice(0, 7) when unparsable.
 */
export function monthKeyFromPeriod(
  yearPeriod: string | number | null,
  monthPeriod: string | number | null,
  startDate: string | null,
): string | null {
  const yr = yearPeriod != null ? Number.parseInt(String(yearPeriod), 10) : NaN;
  const mo = monthPeriod != null ? Number.parseInt(String(monthPeriod), 10) : NaN;
  if (Number.isFinite(yr) && yr >= 1970 && Number.isFinite(mo) && mo >= 1 && mo <= 12) {
    return `${yr}-${String(mo).padStart(2, "0")}`;
  }
  if (startDate && /^\d{4}-\d{2}/.test(startDate)) return startDate.slice(0, 7);
  return null;
}

/** Last n month keys ("YYYY-MM"), oldest first, ending in the current UTC month. */
export function lastNMonthKeys(n: number): string[] {
  const now = new Date();
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/** Today's UTC date as "YYYY-MM-DD". */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** ISO date string shifted by `days` (UTC-safe). */
export function shiftDays(isoDate: string, days: number): string {
  const t = Date.parse(`${isoDate}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}
