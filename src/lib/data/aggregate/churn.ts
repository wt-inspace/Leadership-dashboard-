import type { ChurnPoint, PackageTier } from "../../types";
import { isActiveAtStartOf, tierAt, type ClientModel, type ClientState } from "./model";
import { monthWindow } from "./shared";

export interface ChurnEvent {
  clientId: string;
  month: string; // "YYYY-MM"
  date: string; // "YYYY-MM-DD"
  tier: PackageTier;
}

/** One churn event per churned client (already deduped in the model). */
export function getChurnEvents(model: ClientModel): ChurnEvent[] {
  const events: ChurnEvent[] = [];
  for (const s of model.states) {
    if (s.churnMonth == null || s.churnDate == null) continue;
    events.push({
      clientId: s.clientId,
      month: s.churnMonth,
      date: s.churnDate,
      tier: tierAt(s, s.churnMonth), // last known tier at churn (stripe MRR is in the fallback chain)
    });
  }
  return events;
}

function activeAtStartOfMonth(states: ClientState[], month: string): number {
  let n = 0;
  for (const s of states) if (isActiveAtStartOf(s, month)) n++;
  return n;
}

/**
 * Churned clients per package tier per month, plus the monthly churn rate
 * (churned / active at month start) from the same client model that drives
 * the distribution chart.
 */
export function aggregateChurn(model: ClientModel, monthsBack: number): ChurnPoint[] {
  const byMonth = new Map<string, ChurnEvent[]>();
  for (const e of getChurnEvents(model)) {
    const arr = byMonth.get(e.month);
    if (arr) arr.push(e);
    else byMonth.set(e.month, [e]);
  }

  return monthWindow(monthsBack).map((month) => {
    const inMonth = byMonth.get(month) ?? [];
    const counts: Record<PackageTier, number> = { package1: 0, package2: 0, package3: 0 };
    for (const e of inMonth) counts[e.tier]++;
    const totalChurned = inMonth.length;
    const activeAtStart = activeAtStartOfMonth(model.states, month);
    return {
      month,
      ...counts,
      totalChurned,
      activeAtStart,
      churnRate: activeAtStart > 0 ? totalChurned / activeAtStart : 0,
    };
  });
}
