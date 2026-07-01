import "server-only";
import type { DashboardData, RawDataset } from "../types";
import { getGscOverrides, getMonthsBack, isDemoMode } from "../env";
import { fetchRawDataset } from "./fetchers";
import { generateMockDataset } from "./mock";
import { buildClientModel } from "./aggregate/model";
import { aggregatePackageDistribution } from "./aggregate/packages";
import { aggregateGscTrend } from "./aggregate/gsc";
import { aggregateChurn } from "./aggregate/churn";
import { computeKpis } from "./aggregate/kpis";

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { at: number; data: DashboardData } | null = null;

/**
 * Single data facade: picks the live (Supabase) or mock backend, builds one
 * per-client lifecycle model, then runs the same pure aggregation functions
 * over it regardless of the backend. Results are cached in memory for 5 min.
 */
export async function getDashboardData(): Promise<DashboardData> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;
  const data = await computeDashboardData();
  cache = { at: Date.now(), data };
  return data;
}

async function computeDashboardData(): Promise<DashboardData> {
  const warnings: string[] = [];
  let demoMode = isDemoMode();
  let dataset: RawDataset;

  if (demoMode) {
    dataset = generateMockDataset();
  } else {
    try {
      dataset = await fetchRawDataset();
    } catch (err) {
      console.error("[dashboard] live data fetch failed, falling back to demo data:", err);
      warnings.push("Live Supabase fetch failed — displaying demo data instead.");
      demoMode = true;
      dataset = generateMockDataset();
    }
  }

  const monthsBack = getMonthsBack();
  const model = buildClientModel(dataset, warnings);
  const packageDistribution = aggregatePackageDistribution(model, monthsBack);
  const gsc = aggregateGscTrend(dataset, getGscOverrides(), monthsBack, warnings);
  const churn = aggregateChurn(model, monthsBack);
  const kpis = computeKpis(dataset, model, warnings);

  if (warnings.length > 0) {
    console.warn("[dashboard] data warnings:", warnings);
  }

  return {
    kpis,
    packageDistribution,
    gscTrend: gsc.points,
    churn,
    meta: { demoMode, gscCombo: gsc.combo, warnings },
  };
}
