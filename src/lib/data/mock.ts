import type {
  ClientRow,
  ClientStatusRow,
  GscMetricsRow,
  MonthlyStrategyRow,
  RawDataset,
  StripeInvoiceRow,
  StripeSubscriptionRow,
  SubscriptionRow,
} from "../types";

/** Deterministic PRNG (mulberry32) so demo data is stable across renders. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MONTHS_SPAN = 20; // generate a bit more than the default 18-month window
const GSC_MONTHS = 6; // production GSC snapshots only started recently

const TIERS = [
  { sub: 1, items: 10, eur: 600 },
  { sub: 2, items: 20, eur: 1000 },
  { sub: 3, items: 40, eur: 1750 },
] as const;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function shiftMonth(year: number, monthIdx0: number, delta: number): string {
  const d = new Date(Date.UTC(year, monthIdx0 + delta, 1));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

/**
 * Generates RAW ROWS (not pre-aggregated points) shaped exactly like the live
 * tables (Client/Subscription, monthly_strategy, gsc_sitewide_metrics,
 * client_status, stripe_subscriptions, stripe_invoices), so demo mode
 * exercises the same aggregation code paths as production.
 */
export function generateMockDataset(): RawDataset {
  const rand = mulberry32(1337_2026);
  const now = new Date();
  const y = now.getUTCFullYear();
  const m0 = now.getUTCMonth();

  // Oldest-first month keys ending in the current month.
  const months: string[] = [];
  for (let i = MONTHS_SPAN - 1; i >= 0; i--) months.push(shiftMonth(y, m0, -i));
  const nextMonth = shiftMonth(y, m0, 1);

  const subscriptions: SubscriptionRow[] = [
    { subscription_type: 0, items_per_month: 5 }, // trial
    { subscription_type: 1, items_per_month: 10 },
    { subscription_type: 2, items_per_month: 20 },
    { subscription_type: 3, items_per_month: 40 },
  ];

  const clients: ClientRow[] = [];
  const monthlyStrategies: MonthlyStrategyRow[] = [];
  const gscMetrics: GscMetricsRow[] = [];
  const clientStatuses: ClientStatusRow[] = [];
  const stripeSubscriptions: StripeSubscriptionRow[] = [];
  const stripeInvoices: StripeInvoiceRow[] = [];

  const CLIENT_COUNT = 330;

  for (let i = 0; i < CLIENT_COUNT; i++) {
    const clientId = `client-${String(i + 1).padStart(3, "0")}`;
    const dummy = i % 33 === 0; // 10 dummy clients — filtering must be exercised

    // Growth curve: a founding base plus steady acquisition throughout.
    const joinIdx = i < 145 ? 0 : 1 + Math.floor(rand() * (MONTHS_SPAN - 2));
    const joinMonth = months[joinIdx];
    const joinDate = `${joinMonth}-${pad2(2 + Math.floor(rand() * 20))}`;

    // Tier mix drifts toward Package 2/3 for later cohorts.
    const lateBias = joinIdx / MONTHS_SPAN;
    const roll = rand();
    const p1Cut = 0.55 - 0.3 * lateBias;
    const p2Cut = p1Cut + 0.32 + 0.12 * lateBias;
    const tier = roll < p1Cut ? TIERS[0] : roll < p2Cut ? TIERS[1] : TIERS[2];

    // ~1.5% monthly churn probability once active (≈15% of clients overall).
    let churnIdx: number | null = null;
    const churnP = 0.012 + rand() * 0.012;
    for (let m = joinIdx + 1; m < MONTHS_SPAN; m++) {
      if (rand() < churnP) {
        churnIdx = m;
        break;
      }
    }
    const churned = churnIdx !== null;
    const churnDate = churned ? `${months[churnIdx!]}-${pad2(3 + Math.floor(rand() * 22))}` : null;
    const lastActive = churned ? churnIdx! : MONTHS_SPAN - 1;

    clients.push({
      client_id: clientId,
      dummy_client: dummy ? true : rand() < 0.5 ? false : null,
      subscription: rand() < 0.06 ? null : tier.sub,
      subscription_active: churned ? false : rand() < 0.03 ? null : true,
    });

    // ---- client_status (START DATE + INITIAL PACKAGE source, ~85% coverage) ----
    const hasClientStatus = rand() < 0.85;
    if (hasClientStatus) {
      clientStatuses.push({
        client_id: clientId,
        date_offer_accepted: joinDate,
        MRR: rand() < 0.06 ? (rand() < 0.5 ? 0 : null) : tier.eur,
      });
      // Occasionally a later status row (e.g. after an upsell) — MIN date wins.
      if (rand() < 0.15 && lastActive > joinIdx + 2) {
        clientStatuses.push({
          client_id: clientId,
          date_offer_accepted: `${months[joinIdx + 2]}-10`,
          MRR: TIERS[Math.min(2, TIERS.indexOf(tier) + 1)].eur,
        });
      }
    }

    // ---- stripe_subscriptions (~60% coverage) ----
    const hasStripe = rand() < 0.6 || !hasClientStatus; // everyone has at least one start source
    if (hasStripe) {
      const outlier = rand() < 0.06;
      const mrr = outlier ? [500, 1400, 10200, 20500][Math.floor(rand() * 4)] : tier.eur;
      if (!dummy && i === 13) {
        // Plan change: canceled sub + a live one — must NOT count as churn.
        stripeSubscriptions.push({
          client_id: clientId,
          status: "canceled",
          subscription_start_date: joinDate,
          updated_at: `${months[Math.min(joinIdx + 3, MONTHS_SPAN - 1)]}-12`,
          MRR: TIERS[0].eur,
        });
        stripeSubscriptions.push({
          client_id: clientId,
          status: "active",
          subscription_start_date: `${months[Math.min(joinIdx + 3, MONTHS_SPAN - 1)]}-12`,
          updated_at: `${months[MONTHS_SPAN - 1]}-01`,
          MRR: mrr,
        });
      } else {
        stripeSubscriptions.push({
          client_id: clientId,
          status: churned
            ? rand() < 0.9
              ? "canceled"
              : "incomplete_expired"
            : rand() < 0.25
              ? "past_due"
              : "active",
          subscription_start_date: joinDate,
          updated_at: churned ? churnDate : `${months[MONTHS_SPAN - 1]}-${pad2(1 + Math.floor(rand() * 20))}`,
          MRR: mrr,
        });
      }
    }

    // ---- stripe_invoices (monthly paid invoices; churn-date fallback source) ----
    // A handful of inactive clients get neither invoices nor strategies to
    // exercise the "cannot date churn" warning.
    const invoiceless = !hasStripe && churned && i % 47 === 5;
    if (!invoiceless) {
      const invoiceMonths = Math.min(lastActive - joinIdx + (churned ? 0 : 1), 8);
      for (let k = 0; k < invoiceMonths; k++) {
        const m = (churned ? lastActive - 1 : MONTHS_SPAN - 1) - k;
        if (m < joinIdx) break;
        const mk = months[m];
        const withVat = rand() < 0.75;
        stripeInvoices.push({
          client_id: clientId,
          type: "subscription_cycle",
          status: "paid",
          invoice_paid: true,
          amount_due: Math.round(tier.eur * (withVat ? 1.21 : 1) * 100), // cents, often incl. 21% VAT
          paid_at: `${mk}-${pad2(3 + Math.floor(rand() * 6))}`,
          invoice_created_at: `${mk}-01`,
        });
      }
    }

    // ---- monthly_strategy (partial coverage, recent months, engagement numbering) ----
    if (i % 4 !== 1 && !invoiceless) {
      const from = Math.max(joinIdx, MONTHS_SPAN - 6);
      for (let m = from; m <= lastActive; m++) {
        const mk = months[m];
        const row: MonthlyStrategyRow = {
          client_id: clientId,
          year_period: null, // production: almost always null
          month_period: m - joinIdx + 1, // ENGAGEMENT month number, not calendar
          items_per_month: rand() < 0.04 ? null : tier.items,
          strategy_version: 1,
          status: rand() < 0.25 ? "approved" : rand() < 0.05 ? "modifying" : "to_approve",
          start_date: `${mk}-01`,
          end_date: `${mk}-28`,
        };
        monthlyStrategies.push(row);
        // ~5%: a competing higher-version to_approve — dedupe must prefer approved.
        if (rand() < 0.05) {
          monthlyStrategies.push({ ...row, strategy_version: 2, status: "to_approve" });
        }
      }
      // Some clients have FUTURE strategy rows — series must clip at the current month.
      if (!churned && rand() < 0.3) {
        monthlyStrategies.push({
          client_id: clientId,
          year_period: null,
          month_period: MONTHS_SPAN - joinIdx + 1,
          items_per_month: tier.items,
          strategy_version: 1,
          status: "to_approve",
          start_date: `${nextMonth}-01`,
          end_date: `${nextMonth}-28`,
        });
      }
    }

    // ---- gsc_sitewide_metrics (snapshots only for recent months) ----
    const baseClicks = tier.sub === 1 ? 320 : tier.sub === 2 ? 850 : 2100;
    for (let m = Math.max(joinIdx, MONTHS_SPAN - GSC_MONTHS); m <= lastActive; m++) {
      const mk = months[m];
      const growth = 1 + 0.05 * (m - Math.max(joinIdx, MONTHS_SPAN - GSC_MONTHS));
      // 1–3 snapshots in the month — aggregation must dedupe to the latest end_date.
      const snapshots = 1 + Math.floor(rand() * 3);
      for (let s = 0; s < snapshots; s++) {
        const day = 7 + s * 9; // 07 / 16 / 25
        const clicks = Math.round(baseClicks * growth * (0.8 + 0.4 * rand()) * (1 + s * 0.03));
        const impressions = Math.round(clicks * (24 + 30 * rand()));
        const position = Math.max(3, 24 - 0.8 * m + (rand() - 0.5) * 4);
        const base: GscMetricsRow = {
          client_id: clientId,
          window_key: "28d",
          metric_key: "gsc_sitewide_28d_all_compared",
          segment: "all",
          start_date: `${shiftMonth(y, m0, m - (MONTHS_SPAN - 1) - 1)}-${pad2(day)}`,
          end_date: `${mk}-${pad2(day)}`,
          clicks,
          impressions,
          ctr: impressions > 0 ? clicks / impressions : null,
          position: Math.round(position * 10) / 10,
        };
        gscMetrics.push(base);
        // Minority combos so pinning/discovery is exercised.
        if (i % 5 === 0) {
          gscMetrics.push({
            ...base,
            window_key: "3m",
            metric_key: "gsc_sitewide_3m_all_compared",
            clicks: clicks * 3,
            impressions: impressions * 3,
          });
        }
        if (i % 7 === 0) {
          gscMetrics.push({
            ...base,
            segment: "nonbranded",
            metric_key: "gsc_sitewide_28d_nonbranded_compared",
            clicks: Math.round(clicks * 0.6),
            impressions: Math.round(impressions * 0.7),
          });
        }
      }
    }
  }

  return {
    clients,
    subscriptions,
    monthlyStrategies,
    gscMetrics,
    clientStatuses,
    stripeSubscriptions,
    stripeInvoices,
  };
}
