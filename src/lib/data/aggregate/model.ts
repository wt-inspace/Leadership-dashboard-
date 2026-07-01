import type { PackageTier, RawDataset } from "../../types";
import {
  currentMonthKey,
  addMonthsToKey,
  dummyClientIds,
  monthOf,
  subscriptionTierMap,
  tierFromItems,
  tierFromMrr,
} from "./shared";

/**
 * Per-client lifecycle model shared by the distribution chart, the churn
 * chart, and the KPI cards, so all three tell one consistent story.
 *
 * - startMonth: min client_status.date_offer_accepted -> min stripe
 *   subscription_start_date -> first paid invoice; clients with none are
 *   excluded (counted in a warning).
 * - churn: (a) canceled/incomplete_expired stripe sub (month of updated_at)
 *   unless the client also has an active/past_due sub (plan change);
 *   (b) otherwise subscription_active=false -> month AFTER last paid invoice,
 *   falling back to last monthly_strategy end_date.
 * - tier timeline: initial tier from client_status.MRR, overridden from each
 *   monthly_strategy month onward (carried forward), with Client.subscription
 *   -> Subscription and stripe MRR as fallbacks; final default Package 1.
 */

export interface ClientState {
  clientId: string;
  startMonth: string; // "YYYY-MM"
  churnMonth: string | null;
  churnDate: string | null; // "YYYY-MM-DD" (approximate for invoice-derived churn)
  subscriptionActive: boolean | null;
  baseTier: PackageTier | null; // from initial client_status.MRR
  fallbackTier: PackageTier | null; // Client.subscription -> Subscription, then stripe MRR
  /** Ascending calendar months with a monthly_strategy tier override. */
  overrides: { month: string; tier: PackageTier }[];
}

export interface ClientModel {
  states: ClientState[];
  byId: Map<string, ClientState>;
  currentMonth: string;
}

/** Tier of a client at a given month: last strategy override <= month, else base, else fallback, else P1. */
export function tierAt(s: ClientState, month: string): PackageTier {
  let tier: PackageTier | null = null;
  for (const o of s.overrides) {
    if (o.month <= month) tier = o.tier;
    else break;
  }
  return tier ?? s.baseTier ?? s.fallbackTier ?? "package1";
}

/** Active during month M: started on/before M and not churned in/before M. */
export function isActiveDuring(s: ClientState, month: string): boolean {
  return s.startMonth <= month && (s.churnMonth == null || s.churnMonth > month);
}

/** Active at the start of month M: started before M and not churned before M. */
export function isActiveAtStartOf(s: ClientState, month: string): boolean {
  return s.startMonth < month && (s.churnMonth == null || s.churnMonth >= month);
}

// ---- monthly_strategy dedupe (per client per calendar month) ----

const KNOWN_STRATEGY_STATUSES = new Set([
  "approved",
  "completed",
  "to_approve",
  "modifying",
  "draft",
  "pending",
]);

function statusRank(status: string | null): number {
  const s = (status ?? "").toLowerCase();
  if (s === "approved" || s === "completed") return 0;
  if (KNOWN_STRATEGY_STATUSES.has(s)) return 1;
  return 2; // unknown -> lowest preference
}

export function buildClientModel(ds: RawDataset, warnings: string[]): ClientModel {
  const dummies = dummyClientIds(ds);
  const subTiers = subscriptionTierMap(ds);
  const currentMonth = currentMonthKey();

  // client_status per client: min date_offer_accepted + its MRR.
  const firstOffer = new Map<string, { date: string; mrr: number | null }>();
  for (const row of ds.clientStatuses) {
    if (row.client_id == null) continue;
    const id = String(row.client_id);
    const date = row.date_offer_accepted;
    if (!date || !/^\d{4}-\d{2}/.test(date)) continue;
    const cur = firstOffer.get(id);
    if (!cur || date < cur.date) firstOffer.set(id, { date, mrr: row.MRR });
  }

  // stripe subscriptions per client.
  const LIVE_STATUSES = new Set(["active", "past_due"]);
  const CANCELED_STATUSES = new Set(["canceled", "incomplete_expired"]);
  interface StripeAgg {
    minStart: string | null;
    hasLive: boolean;
    lastCanceledAt: string | null;
    latestMrr: number | null;
    latestMrrKey: string; // updated_at used to pick "latest" MRR
  }
  const stripeByClient = new Map<string, StripeAgg>();
  for (const sub of ds.stripeSubscriptions) {
    if (sub.client_id == null) continue;
    const id = String(sub.client_id);
    let agg = stripeByClient.get(id);
    if (!agg) {
      agg = { minStart: null, hasLive: false, lastCanceledAt: null, latestMrr: null, latestMrrKey: "" };
      stripeByClient.set(id, agg);
    }
    const status = (sub.status ?? "").toLowerCase();
    const start = sub.subscription_start_date;
    if (start && /^\d{4}-\d{2}/.test(start) && (agg.minStart == null || start < agg.minStart)) {
      agg.minStart = start;
    }
    if (LIVE_STATUSES.has(status)) agg.hasLive = true;
    if (CANCELED_STATUSES.has(status)) {
      const at = sub.updated_at;
      if (at && /^\d{4}-\d{2}/.test(at) && (agg.lastCanceledAt == null || at > agg.lastCanceledAt)) {
        agg.lastCanceledAt = at;
      }
    }
    const key = sub.updated_at ?? "";
    if (sub.MRR != null && key >= agg.latestMrrKey) {
      agg.latestMrr = sub.MRR;
      agg.latestMrrKey = key;
    }
  }

  // Paid invoices per client: first and last paid_at.
  const paidInvoices = new Map<string, { first: string; last: string }>();
  for (const inv of ds.stripeInvoices) {
    if (inv.client_id == null) continue;
    if (inv.paid_at == null || !/^\d{4}-\d{2}/.test(inv.paid_at)) continue;
    if (inv.invoice_paid === false) continue;
    const id = String(inv.client_id);
    const cur = paidInvoices.get(id);
    if (!cur) paidInvoices.set(id, { first: inv.paid_at, last: inv.paid_at });
    else {
      if (inv.paid_at < cur.first) cur.first = inv.paid_at;
      if (inv.paid_at > cur.last) cur.last = inv.paid_at;
    }
  }

  // monthly_strategy: dedupe per client-month (approved > known > unknown, then
  // highest strategy_version), bucketed by start_date calendar month.
  const bestStrategy = new Map<
    string,
    { rank: number; version: number; items: number | null }
  >();
  const lastStrategyEnd = new Map<string, string>();
  const unknownStatuses = new Set<string>();
  for (const row of ds.monthlyStrategies) {
    if (row.client_id == null) continue;
    const id = String(row.client_id);
    if (dummies.has(id)) continue;
    const month = monthOf(row.start_date);
    if (!month) continue;

    const rank = statusRank(row.status);
    if (rank === 2 && row.status) unknownStatuses.add(row.status);
    const version = row.strategy_version ?? 0;
    const key = `${id}|${month}`;
    const cur = bestStrategy.get(key);
    if (!cur || rank < cur.rank || (rank === cur.rank && version > cur.version)) {
      bestStrategy.set(key, { rank, version, items: row.items_per_month });
    }

    const end = row.end_date;
    if (end && /^\d{4}-\d{2}/.test(end)) {
      const prev = lastStrategyEnd.get(id);
      if (!prev || end > prev) lastStrategyEnd.set(id, end);
    }
  }
  if (unknownStatuses.size > 0) {
    warnings.push(
      `monthly_strategy: unknown status value(s) treated as lowest preference: ${[...unknownStatuses].join(", ")}`,
    );
  }

  const overridesByClient = new Map<string, { month: string; tier: PackageTier }[]>();
  for (const [key, entry] of bestStrategy) {
    const tier = tierFromItems(entry.items);
    if (!tier) continue;
    const [id, month] = key.split("|");
    const arr = overridesByClient.get(id);
    if (arr) arr.push({ month, tier });
    else overridesByClient.set(id, [{ month, tier }]);
  }
  for (const arr of overridesByClient.values()) {
    arr.sort((a, b) => (a.month < b.month ? -1 : 1));
  }

  // ---- assemble per-client states ----
  const states: ClientState[] = [];
  const byId = new Map<string, ClientState>();
  let excludedNoStart = 0;
  let unknownTierCount = 0;
  let churnDateUnresolved = 0;

  for (const c of ds.clients) {
    const id = String(c.client_id);
    if (dummies.has(id)) continue;

    const offer = firstOffer.get(id);
    const stripe = stripeByClient.get(id);
    const invoices = paidInvoices.get(id);

    const startDate = offer?.date ?? stripe?.minStart ?? invoices?.first ?? null;
    if (!startDate) {
      excludedNoStart++;
      continue;
    }
    const startMonth = startDate.slice(0, 7);

    const baseTier = offer ? tierFromMrr(offer.mrr) : null;
    const overrides = overridesByClient.get(id) ?? [];
    const fallbackTier = subTiers.get(id) ?? tierFromMrr(stripe?.latestMrr) ?? null;
    if (!baseTier && !fallbackTier && overrides.length === 0) unknownTierCount++;

    // Churn detection.
    let churnMonth: string | null = null;
    let churnDate: string | null = null;
    if (stripe?.lastCanceledAt && !stripe.hasLive) {
      churnDate = stripe.lastCanceledAt.slice(0, 10);
      churnMonth = churnDate.slice(0, 7);
    } else if (!stripe?.lastCanceledAt && c.subscription_active === false) {
      if (invoices?.last) {
        churnMonth = addMonthsToKey(invoices.last.slice(0, 7), 1);
        churnDate = `${churnMonth}-01`;
      } else {
        const end = lastStrategyEnd.get(id);
        if (end) {
          churnDate = end.slice(0, 10);
          churnMonth = churnDate.slice(0, 7);
        } else {
          churnDateUnresolved++;
        }
      }
    }

    const state: ClientState = {
      clientId: id,
      startMonth,
      churnMonth,
      churnDate,
      subscriptionActive: c.subscription_active,
      baseTier,
      fallbackTier,
      overrides,
    };
    states.push(state);
    byId.set(id, state);
  }

  if (excludedNoStart > 0) {
    warnings.push(
      `client model: ${excludedNoStart} non-dummy client(s) excluded — no start date in client_status, stripe_subscriptions, or paid invoices`,
    );
  }
  if (unknownTierCount > 0) {
    warnings.push(
      `client model: ${unknownTierCount} client(s) have no resolvable package from any source; defaulted to Package 1`,
    );
  }
  if (churnDateUnresolved > 0) {
    warnings.push(
      `churn: ${churnDateUnresolved} inactive client(s) (subscription_active=false) had no paid invoice or strategy end_date to date their churn; excluded from churn series`,
    );
  }

  return { states, byId, currentMonth };
}
