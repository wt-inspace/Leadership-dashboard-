import "server-only";
import type { DashboardData, RawDataset } from "../types";
import { getGscOverrides, getMonthsBack, isDemoMode } from "../env";
import { fetchRawDataset } from "./fetchers";
import { generateMockDataset } from "./mock";
import { aggregatePackageDistribution } from "./aggregate/packages";
import { aggregateGscTrend } from "./aggregate/gsc";
import { aggregateChurn } from "./aggregate/churn";
import { computeKpis } from "./aggregate/kpis";

/**
 * Single data facade: picks the live (Supabase) or mock backend, then runs the
 * same pure aggregation functions over the resulting RawDataset.
 */
export async function getDashboardData(): Promise<DashboardData> {
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
  const packageDistribution = aggregatePackageDistribution(dataset, monthsBack, warnings);
  const gsc = aggregateGscTrend(dataset, getGscOverrides(), monthsBack, warnings);
  const churn = aggregateChurn(dataset, monthsBack, warnings);
  const kpis = computeKpis(dataset, warnings);

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
