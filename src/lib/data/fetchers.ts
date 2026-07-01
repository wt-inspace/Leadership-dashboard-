import "server-only";
import { getSupabaseClient } from "../supabase";
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

const PAGE_SIZE = 1000;

async function fetchTable<T>(table: string, columns: string): Promise<T[]> {
  const { data, error } = await getSupabaseClient().from(table).select(columns);
  if (error) throw new Error(`Failed to fetch ${table}: ${error.message}`);
  return (data ?? []) as T[];
}

/** Paginate with .range() until a short page — PostgREST caps single responses. */
async function fetchTablePaginated<T>(table: string, columns: string): Promise<T[]> {
  const out: T[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await getSupabaseClient()
      .from(table)
      .select(columns)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to fetch ${table} (offset ${offset}): ${error.message}`);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return out;
}

export function fetchClients(): Promise<ClientRow[]> {
  return fetchTable<ClientRow>("Client", "client_id, dummy_client, subscription, subscription_active");
}

export function fetchSubscriptions(): Promise<SubscriptionRow[]> {
  return fetchTable<SubscriptionRow>("Subscription", "subscription_type, items_per_month");
}

export function fetchMonthlyStrategies(): Promise<MonthlyStrategyRow[]> {
  return fetchTablePaginated<MonthlyStrategyRow>(
    "monthly_strategy",
    "client_id, year_period, month_period, items_per_month, strategy_version, status, start_date, end_date",
  );
}

export function fetchGscMetrics(): Promise<GscMetricsRow[]> {
  // ~8.6k rows — pagination is mandatory here.
  return fetchTablePaginated<GscMetricsRow>(
    "gsc_sitewide_metrics",
    "client_id, window_key, metric_key, segment, start_date, end_date, clicks, impressions, ctr, position",
  );
}

/** Start date + initial package source: MIN(date_offer_accepted) + its MRR per client. */
export function fetchClientStatuses(): Promise<ClientStatusRow[]> {
  return fetchTablePaginated<ClientStatusRow>(
    "client_status",
    "client_id, date_offer_accepted, MRR",
  );
}

export function fetchStripeSubscriptions(): Promise<StripeSubscriptionRow[]> {
  return fetchTablePaginated<StripeSubscriptionRow>(
    "stripe_subscriptions",
    "client_id, status, subscription_start_date, updated_at, MRR",
  );
}

export function fetchStripeInvoices(): Promise<StripeInvoiceRow[]> {
  return fetchTablePaginated<StripeInvoiceRow>(
    "stripe_invoices",
    "client_id, type, status, invoice_paid, amount_due, paid_at, invoice_created_at",
  );
}

export async function fetchRawDataset(): Promise<RawDataset> {
  const [
    clients,
    subscriptions,
    monthlyStrategies,
    gscMetrics,
    clientStatuses,
    stripeSubscriptions,
    stripeInvoices,
  ] = await Promise.all([
    fetchClients(),
    fetchSubscriptions(),
    fetchMonthlyStrategies(),
    fetchGscMetrics(),
    fetchClientStatuses(),
    fetchStripeSubscriptions(),
    fetchStripeInvoices(),
  ]);
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
