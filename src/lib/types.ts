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
  subscription: string | number | null;
}

export interface SubscriptionRow {
  subscription_type: string | number | null;
  items_per_month: number | null;
}

export interface MonthlyStrategyRow {
  client_id: string | number | null;
  year_period: string | number | null;
  month_period: string | number | null;
  items_per_month: number | null;
  strategy_version: number | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
}

export interface GscMetricsRow {
  client_id: string | number | null;
  window_key: string | null;
  metric_key: string | null;
  segment: string | null;
  start_date: string | null;
  end_date: string | null;
  clicks: number | null;
  impressions: number | null;
  ctr: number | null;
  position: number | null;
}

export interface DomainRow {
  domain_id: string | number;
  client_id: string | number | null;
}

export interface DomainLocaleRow {
  domain_id: string | number | null;
  subscription_status: string | null;
  service_start: string | null;
  service_end: string | null;
  items_per_month: number | null;
  mrr: number | null;
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
  domains: DomainRow[];
  domainLocales: DomainLocaleRow[];
}
