import "server-only";
import { getSupabaseClient } from "../supabase";
import type {
  ClientRow,
  DomainLocaleRow,
  DomainRow,
  GscMetricsRow,
  MonthlyStrategyRow,
  RawDataset,
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
  return fetchTable<ClientRow>("Client", "client_id, dummy_client, subscription");
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

export function fetchDomains(): Promise<DomainRow[]> {
  return fetchTablePaginated<DomainRow>("domain", "domain_id, client_id");
}

export function fetchDomainLocales(): Promise<DomainLocaleRow[]> {
  // Joined to domain/Client in Node — no PostgREST FK embedding.
  return fetchTablePaginated<DomainLocaleRow>(
    "domain_locale",
    "domain_id, subscription_status, service_start, service_end, items_per_month, mrr",
  );
}

export async function fetchRawDataset(): Promise<RawDataset> {
  const [clients, subscriptions, monthlyStrategies, gscMetrics, domains, domainLocales] =
    await Promise.all([
      fetchClients(),
      fetchSubscriptions(),
      fetchMonthlyStrategies(),
      fetchGscMetrics(),
      fetchDomains(),
      fetchDomainLocales(),
    ]);
  return { clients, subscriptions, monthlyStrategies, gscMetrics, domains, domainLocales };
}
