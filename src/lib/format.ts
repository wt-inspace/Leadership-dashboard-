const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** 1234 -> "1.2k", 1234567 -> "1.2M" */
export function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return "–";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${Math.round(n * 10) / 10}`;
}

/** 0.0423 -> "4.2%" */
export function formatPercent(ratio: number, digits = 1): string {
  if (!Number.isFinite(ratio)) return "–";
  return `${(ratio * 100).toFixed(digits)}%`;
}

/** "2026-01" -> "Jan 26" — pure string math, no Date, no TZ drift. */
export function formatMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-");
  const mi = Number.parseInt(m ?? "", 10);
  if (!y || !Number.isFinite(mi) || mi < 1 || mi > 12) return monthKey;
  return `${MONTH_NAMES[mi - 1]} ${y.slice(2)}`;
}

/** "YYYY-MM-DD..." -> "YYYY-MM" via string slicing (UTC-safe). */
export function toMonthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}
