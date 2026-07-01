import type { PackageTier, RawDataset } from "../../types";

/** Business data starts here — series are floored at this month. */
export const DATA_FLOOR_MONTH = "2025-08";

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

/**
 * Monthly EUR -> tier by NEAREST of {600, 1000, 1750} (midpoints 800 / 1375).
 * Handles stripe outliers such as 500, 1400, 10200. 0/null -> null.
 */
export function tierFromMrr(mrr: number | null | undefined): PackageTier | null {
  if (mrr == null || !Number.isFinite(mrr) || mrr <= 0) return null;
  if (mrr <= 800) return "package1";
  if (mrr <= 1375) return "package2";
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

/** "YYYY-MM-DD..." -> "YYYY-MM", or null when not a date string. */
export function monthOf(dateStr: string | null | undefined): string | null {
  if (!dateStr || !/^\d{4}-\d{2}/.test(dateStr)) return null;
  return dateStr.slice(0, 7);
}

/** Shift a "YYYY-MM" key by `delta` months (UTC-safe). */
export function addMonthsToKey(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Current UTC month as "YYYY-MM". */
export function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
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

/** Chart window: last monthsBack months, clipped to the data floor and the current month. */
export function monthWindow(monthsBack: number): string[] {
  return lastNMonthKeys(monthsBack).filter((m) => m >= DATA_FLOOR_MONTH);
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
