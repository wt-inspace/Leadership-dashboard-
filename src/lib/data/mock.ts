import type {
  ClientRow,
  DomainLocaleRow,
  DomainRow,
  GscMetricsRow,
  MonthlyStrategyRow,
  RawDataset,
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
const TIER_ITEMS: Record<string, number> = { starter: 10, growth: 20, scale: 40 };

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function shiftMonth(year: number, monthIdx0: number, delta: number): string {
  const d = new Date(Date.UTC(year, monthIdx0 + delta, 1));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

/**
 * Generates RAW ROWS (not pre-aggregated points) shaped exactly like the live
 * Supabase tables, so demo mode exercises the same aggregation code paths.
 */
export function generateMockDataset(): RawDataset {
  return buildDataset();
}

function buildDataset(): RawDataset {
  const rand = mulberry32(1337_2026);
  const now = new Date();
  const y = now.getUTCFullYear();
  const m0 = now.getUTCMonth();

  // Oldest-first month keys ending in the current month.
  const months: string[] = [];
  for (let i = MONTHS_SPAN - 1; i >= 0; i--) months.push(shiftMonth(y, m0, -i));

  const subscriptions: SubscriptionRow[] = [
    { subscription_type: "starter", items_per_month: 10 },
    { subscription_type: "growth", items_per_month: 20 },
    { subscription_type: "scale", items_per_month: 40 },
  ];

  const clients: ClientRow[] = [];
  const monthlyStrategies: MonthlyStrategyRow[] = [];
  const gscMetrics: GscMetricsRow[] = [];
  const domains: DomainRow[] = [];
  const domainLocales: DomainLocaleRow[] = [];

  const CLIENT_COUNT = 330;

  for (let i = 0; i < CLIENT_COUNT; i++) {
    const clientId = `client-${String(i + 1).padStart(3, "0")}`;
    const dummy = i % 33 === 0; // 10 dummy clients — filtering must be exercised

    // Growth curve: a founding base plus steady acquisition throughout.
    const joinIdx =
      i < 145 ? 0 : 1 + Math.floor(rand() * (MONTHS_SPAN - 2));

    // Tier mix drifts toward Package 2/3 for later cohorts.
    const lateBias = joinIdx / MONTHS_SPAN;
    const roll = rand();
    const p1Cut = 0.55 - 0.3 * lateBias;
    const p2Cut = p1Cut + 0.32 + 0.12 * lateBias;
    const tier = roll < p1Cut ? "starter" : roll < p2Cut ? "growth" : "scale";
    const tierItems = TIER_ITEMS[tier];

    // ~2% monthly churn probability once active.
    let churnIdx: number | null = null;
    const churnP = 0.012 + rand() * 0.015;
    for (let m = joinIdx + 1; m < MONTHS_SPAN; m++) {
      if (rand() < churnP) {
        churnIdx = m;
        break;
      }
    }

    clients.push({
      client_id: clientId,
      dummy_client: dummy ? true : rand() < 0.5 ? false : null,
      subscription: rand() < 0.05 ? null : tier,
    });

    // ---- domain / domain_locale ----
    const domainId = `dom-${clientId}`;
    domains.push({ domain_id: domainId, client_id: clientId });

    const serviceStart =
      joinIdx === 0
        ? `${shiftMonth(y, m0, -(MONTHS_SPAN - 1) - Math.floor(rand() * 12))}-${pad2(3 + Math.floor(rand() * 24))}`
        : `${months[joinIdx]}-${pad2(2 + Math.floor(rand() * 10))}`;

    const churned = churnIdx !== null;
    const statusActive = rand() < 0.1 ? "Active" : "active"; // case variety
    const statusCancelled = rand() < 0.1 ? "Cancelled" : "cancelled";

    domainLocales.push({
      domain_id: domainId,
      subscription_status: churned ? statusCancelled : statusActive,
      service_start: serviceStart,
      service_end: churned ? `${months[churnIdx!]}-${pad2(8 + Math.floor(rand() * 18))}` : null,
      items_per_month: rand() < 0.07 ? null : tierItems,
      mrr: tierItems * 80,
    });

    // A few clients have a second (also cancelled) historical locale.
    if (!dummy && i % 40 === 7) {
      domainLocales.push({
        domain_id: domainId,
        subscription_status: "cancelled",
        service_start: serviceStart,
        service_end: `${months[Math.max(1, joinIdx + 1)]}-10`,
        items_per_month: tierItems,
        mrr: tierItems * 80,
      });
    }

    // ---- monthly_strategy ----
    const lastActive = churned ? churnIdx! : MONTHS_SPAN - 1;
    for (let m = joinIdx; m <= lastActive; m++) {
      const mk = months[m];
      const [yy, mm] = mk.split("-");
      const row: MonthlyStrategyRow = {
        client_id: clientId,
        year_period: Number(yy),
        // Occasionally a string month to exercise normalization tolerance.
        month_period: (i + m) % 11 === 0 ? mm : Number(mm),
        items_per_month: rand() < 0.03 ? null : tierItems,
        strategy_version: 1,
        status: "approved",
        start_date: `${mk}-01`,
        end_date: `${mk}-28`,
      };
      monthlyStrategies.push(row);

      // ~5%: a competing draft with a higher version — dedupe must prefer approved v1.
      if (rand() < 0.05) {
        monthlyStrategies.push({ ...row, strategy_version: 2, status: "draft" });
      }
    }

    // ---- gsc_sitewide_metrics ----
    const baseClicks = tier === "starter" ? 320 : tier === "growth" ? 850 : 2100;
    for (let m = joinIdx; m <= lastActive; m++) {
      const mk = months[m];
      const growth = 1 + 0.045 * (m - joinIdx);
      const nullRow = rand() < 0.02;
      const clicks = nullRow ? null : Math.round(baseClicks * growth * (0.8 + 0.4 * rand()));
      const impressions = nullRow ? null : Math.round((clicks as number) * (24 + 30 * rand()));
      const position = Math.max(3, 27 - 0.55 * m + (rand() - 0.5) * 4);

      const base: GscMetricsRow = {
        client_id: clientId,
        window_key: "last_28d", // dominant window — discovery must pick this
        metric_key: "sitewide",
        segment: "all",
        start_date: `${mk}-01`,
        end_date: `${mk}-28`,
        clicks,
        impressions,
        ctr: clicks !== null && impressions ? clicks / impressions : null,
        position: Math.round(position * 10) / 10,
      };
      gscMetrics.push(base);

      // Minority window_key so the dominant-combo discovery logic is exercised.
      if (i % 5 === 0) {
        gscMetrics.push({
          ...base,
          window_key: "last_3m",
          clicks: clicks !== null ? clicks * 3 : null,
          impressions: impressions !== null ? impressions * 3 : null,
        });
      }
    }
  }

  return { clients, subscriptions, monthlyStrategies, gscMetrics, domains, domainLocales };
}
