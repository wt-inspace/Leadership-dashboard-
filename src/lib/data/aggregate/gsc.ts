import type { GscMetricsRow, GscTrendPoint, RawDataset } from "../../types";
import type { GscOverrides } from "../../env";
import { dummyClientIds } from "./shared";

export interface GscCombo {
  windowKey: string;
  metricKey: string;
  segment: string;
}

export interface GscAggregation {
  points: GscTrendPoint[];
  combo: GscCombo;
}

interface ComboTally {
  windowKey: string;
  metricKey: string;
  segment: string;
  count: number;
  endDates: Set<string>;
}

function bucketRows(rows: GscMetricsRow[], monthsBack: number): GscTrendPoint[] {
  interface Bucket {
    clicks: number;
    impressions: number;
    posWeighted: number; // Σ position * impressions
    posWeight: number; // Σ impressions where position present
    clients: Set<string>;
  }
  const buckets = new Map<string, Bucket>();
  for (const r of rows) {
    if (!r.end_date || !/^\d{4}-\d{2}/.test(r.end_date)) continue;
    const month = r.end_date.slice(0, 7);
    let b = buckets.get(month);
    if (!b) {
      b = { clicks: 0, impressions: 0, posWeighted: 0, posWeight: 0, clients: new Set() };
      buckets.set(month, b);
    }
    if (r.clicks != null) b.clicks += r.clicks;
    if (r.impressions != null) b.impressions += r.impressions;
    if (r.position != null && r.impressions != null && r.impressions > 0) {
      b.posWeighted += r.position * r.impressions;
      b.posWeight += r.impressions;
    }
    if (r.client_id != null) b.clients.add(String(r.client_id));
  }

  const keys = [...buckets.keys()].sort().slice(-monthsBack);
  return keys.map((month) => {
    const b = buckets.get(month)!;
    return {
      month,
      clicks: b.clicks,
      impressions: b.impressions,
      ctr: b.impressions > 0 ? b.clicks / b.impressions : 0,
      position: b.posWeight > 0 ? b.posWeighted / b.posWeight : 0,
      clientCount: b.clients.size,
    };
  });
}

export function aggregateGscTrend(
  ds: RawDataset,
  overrides: GscOverrides,
  monthsBack: number,
  warnings: string[],
): GscAggregation {
  const dummies = dummyClientIds(ds);
  const rows = ds.gscMetrics.filter(
    (r) => r.client_id == null || !dummies.has(String(r.client_id)),
  );

  // Tally rows per (window_key, metric_key, segment) combo.
  const tallies = new Map<string, ComboTally>();
  for (const r of rows) {
    const w = r.window_key ?? "";
    const m = r.metric_key ?? "";
    const s = r.segment ?? "";
    const key = `${w}|${m}|${s}`;
    let t = tallies.get(key);
    if (!t) {
      t = { windowKey: w, metricKey: m, segment: s, count: 0, endDates: new Set() };
      tallies.set(key, t);
    }
    t.count++;
    if (r.end_date) t.endDates.add(r.end_date);
  }

  // Env overrides win per-dimension; among the remainder pick the combo with
  // the most rows, tie-break by most distinct end_dates.
  let candidates = [...tallies.values()].filter(
    (t) =>
      (!overrides.windowKey || t.windowKey === overrides.windowKey) &&
      (!overrides.metricKey || t.metricKey === overrides.metricKey) &&
      (!overrides.segment || t.segment === overrides.segment),
  );
  if (candidates.length === 0 && tallies.size > 0) {
    warnings.push(
      "GSC: env overrides matched no (window_key, metric_key, segment) combo; falling back to auto-discovery",
    );
    candidates = [...tallies.values()];
  }
  candidates.sort((a, b) => b.count - a.count || b.endDates.size - a.endDates.size);
  const chosen = candidates[0];

  if (!chosen) {
    return { points: [], combo: { windowKey: "-", metricKey: "-", segment: "-" } };
  }

  let comboRows = rows.filter(
    (r) =>
      (r.window_key ?? "") === chosen.windowKey &&
      (r.metric_key ?? "") === chosen.metricKey &&
      (r.segment ?? "") === chosen.segment,
  );
  const combo: GscCombo = {
    windowKey: chosen.windowKey,
    metricKey: chosen.metricKey,
    segment: chosen.segment,
  };

  // Fallback for one-metric-per-row schemas: if the chosen metric_key's rows are
  // mostly empty, coalesce across all metric_keys of the chosen window/segment.
  const emptyRows = comboRows.filter((r) => r.clicks == null && r.impressions == null).length;
  if (comboRows.length > 0 && emptyRows / comboRows.length > 0.5) {
    warnings.push(
      `GSC: >50% of rows for metric_key "${chosen.metricKey}" had null clicks and impressions; ` +
        "coalescing across all metric_keys for the chosen window/segment (likely one-metric-per-row schema)",
    );
    comboRows = rows.filter(
      (r) =>
        (r.window_key ?? "") === chosen.windowKey && (r.segment ?? "") === chosen.segment,
    );
    combo.metricKey = "* (coalesced)";
  }

  return { points: bucketRows(comboRows, monthsBack), combo };
}
