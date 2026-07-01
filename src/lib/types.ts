export type PackageTier = "package1" | "package2" | "package3";

export interface PackageDistributionPoint {
  month: string; // "YYYY-MM"
  package1: number;
  package2: number;
  package3: number;
  total: number;
}

export interface GscTrendPoint {
  month: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  clientCount: number;
}

export interface ChurnPoint {
  month: string;
  package1: number;
  package2: number;
  package3: number;
  totalChurned: number;
  activeAtStart: number;
  churnRate: number;
}

export interface KpiSummary {
  activeClients: number;
  currentDistribution: Record<PackageTier, number>;
  churnedLast30d: number;
  churnedLast90d: number;
  churnRate90d: number;
  asOf: string; // ISO date
}

export interface DashboardMeta {
  demoMode: boolean;
  gscCombo: { windowKey: string; metricKey: string; segment: string };
  warnings: string[];
}

export interface DashboardData {
  kpis: KpiSummary;
  packageDistribution: PackageDistributionPoint[];
  gscTrend: GscTrendPoint[];
  churn: ChurnPoint[];
  meta: DashboardMeta;
}

// ---------- Raw row types (nullable-defensive) ----------

export interface ClientRow {
  client_id: string | number;
  dummy_client: boolean | null;
  subscription: string | number | null; // FK to Subscription.subscription_type (0..3)
  subscription_active: boolean | null;
}

export interface SubscriptionRow {
  subscription_type: string | number | null; // 0=trial(5), 1=10, 2=20, 3=40
  items_per_month: number | null;
}

export interface MonthlyStrategyRow {
  client_id: string | number | null;
  /** Almost always null in production — never rely on it. */
  year_period: string | number | null;
  /** Engagement month number (1, 2, 3, ...) — NOT a calendar month. */
  month_period: string | number | null;
  items_per_month: number | null;
  strategy_version: number | null;
  status: string | null; // to_approve | approved | modifying
  start_date: string | null; // calendar bucketing uses start_date.slice(0, 7)
  end_date: string | null;
}

export interface GscMetricsRow {
  client_id: string | number | null;
  window_key: string | null; // 28d | 3m | 6m | 12m
  metric_key: string | null; // gsc_sitewide_{window}_{segment}_{plain|compared}
  segment: string | null; // all | nonbranded
  start_date: string | null;
  end_date: string | null;
  clicks: number | null;
  impressions: number | null;
  ctr: number | null;
  position: number | null;
}

/** Offer acceptance = client start date + initial package (via MRR 600/1000/1750). */
export interface ClientStatusRow {
  client_id: string | number | null;
  date_offer_accepted: string | null;
  MRR: number | null;
}

export interface StripeSubscriptionRow {
  client_id: string | number | null;
  status: string | null; // active | past_due | canceled | incomplete_expired
  subscription_start_date: string | null;
  /** No canceled_at column exists — for canceled subs updated_at approximates the cancellation date. */
  updated_at: string | null;
  MRR: number | null;
}

export interface StripeInvoiceRow {
  client_id: string | number | null;
  type: string | null;
  status: string | null;
  invoice_paid: boolean | null;
  /** Cents, often including 21% VAT (e.g. 72600 = EUR 600 x 1.21). */
  amount_due: number | null;
  paid_at: string | null;
  invoice_created_at: string | null;
}

/**
 * Single bundle of all fetched raw rows. Both the live fetchers and the mock
 * generator produce this shape; every aggregator consumes it.
 */
export interface RawDataset {
  clients: ClientRow[];
  subscriptions: SubscriptionRow[];
  monthlyStrategies: MonthlyStrategyRow[];
  gscMetrics: GscMetricsRow[];
  clientStatuses: ClientStatusRow[];
  stripeSubscriptions: StripeSubscriptionRow[];
  stripeInvoices: StripeInvoiceRow[];
}
