const DEFAULT_SUPABASE_URL = "https://cmyaxmzbbyjthqnczvch.supabase.co";

export function getSupabaseUrl(): string {
  return process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
}

export function getServiceRoleKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || undefined;
}

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "1" || !getServiceRoleKey();
}

export function getMonthsBack(): number {
  const raw = process.env.MONTHS_BACK;
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 18;
}

export interface GscOverrides {
  windowKey?: string;
  metricKey?: string;
  segment?: string;
}

/**
 * Defaults match the verified production combo. Auto-discovery still kicks in
 * (with a warning) if the pinned combo matches no rows.
 */
export function getGscOverrides(): GscOverrides {
  return {
    windowKey: process.env.GSC_WINDOW_KEY || "28d",
    metricKey: process.env.GSC_METRIC_KEY || "gsc_sitewide_28d_all_compared",
    segment: process.env.GSC_SEGMENT || "all",
  };
}
