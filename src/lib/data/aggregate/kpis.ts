import type { KpiSummary, PackageTier, RawDataset } from "../../types";
import { tierAt, type ClientModel } from "./model";
import { getChurnEvents } from "./churn";
import { dummyClientIds, shiftDays, subscriptionTierMap, todayIso } from "./shared";

export function computeKpis(ds: RawDataset, model: ClientModel, warnings: string[]): KpiSummary {
  const asOf = todayIso();
  const dummies = dummyClientIds(ds);
  const subTiers = subscriptionTierMap(ds);

  // Active clients = non-dummy clients flagged subscription_active = true.
  const currentDistribution: Record<PackageTier, number> = {
    package1: 0,
    package2: 0,
    package3: 0,
  };
  let activeClients = 0;
  let missingState = 0;
  for (const c of ds.clients) {
    const id = String(c.client_id);
    if (dummies.has(id)) continue;
    if (c.subscription_active !== true) continue;
    activeClients++;
    const state = model.byId.get(id);
    if (state) {
      currentDistribution[tierAt(state, model.currentMonth)]++;
    } else {
      missingState++;
      currentDistribution[subTiers.get(id) ?? "package1"]++;
    }
  }
  if (missingState > 0) {
    warnings.push(
      `KPIs: ${missingState} active client(s) have no start-date source; tier taken from Client.subscription fallback`,
    );
  }

  // Trailing churn windows from the deduped churn events.
  const events = getChurnEvents(model);
  const d30 = shiftDays(asOf, -30);
  const d90 = shiftDays(asOf, -90);
  const churnedLast30d = events.filter((e) => e.date >= d30 && e.date <= asOf).length;
  const churnedLast90d = events.filter((e) => e.date >= d90 && e.date <= asOf).length;

  // Rate vs. clients active ~90 days ago (month-granularity active model).
  const month90 = d90.slice(0, 7);
  let activeAt90 = 0;
  for (const s of model.states) {
    if (s.startMonth <= month90 && (s.churnMonth == null || s.churnMonth > month90)) activeAt90++;
  }
  const churnRate90d = activeAt90 > 0 ? churnedLast90d / activeAt90 : 0;

  return { activeClients, currentDistribution, churnedLast30d, churnedLast90d, churnRate90d, asOf };
}
