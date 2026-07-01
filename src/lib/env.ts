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

export function getGscOverrides(): GscOverrides {
  return {
    windowKey: process.env.GSC_WINDOW_KEY || undefined,
    metricKey: process.env.GSC_METRIC_KEY || undefined,
    segment: process.env.GSC_SEGMENT || undefined,
  };
}
