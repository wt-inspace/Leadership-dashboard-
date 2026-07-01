# InSpace.io — Leadership Dashboard

Executive dashboard for InSpace.io leadership: **package distribution over time**, **Google Search Console client results over time**, and **churn per package over time**, plus KPI summary cards.

Built with Next.js 15 (App Router, server components), React 19, Tailwind CSS 4, Recharts, and Supabase (service-role, server-only reads).

## Quick start

```bash
npm install
cp .env.example .env.local   # fill in values, or leave empty for demo mode
npm run dev                  # http://localhost:3000
```

Production:

```bash
npm run build && npm run start
```

Other scripts: `npm run typecheck`.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `SUPABASE_URL` | no | Supabase project URL. Defaults to the InSpace project (`https://cmyaxmzbbyjthqnczvch.supabase.co`). |
| `SUPABASE_SERVICE_ROLE_KEY` | no | Server-only service-role key. **If unset, the app runs in demo mode.** Never exposed to the client — all reads happen in server components. |
| `DEMO_MODE` | no | Set to `1` to force demo (mock) data even when a key is present. |
| `DASHBOARD_PASSWORD` | no | When set, the whole app is gated behind HTTP Basic Auth (any username, this password). When unset, no auth. |
| `GSC_WINDOW_KEY` | no | Override the auto-discovered GSC `window_key`. |
| `GSC_METRIC_KEY` | no | Override the auto-discovered GSC `metric_key`. |
| `GSC_SEGMENT` | no | Override the auto-discovered GSC `segment`. |
| `MONTHS_BACK` | no | Chart lookback window in months. Default `18`. |

## Demo mode

With no service-role key (or `DEMO_MODE=1`), the app generates a **deterministic mock dataset of raw rows** (seeded PRNG) shaped exactly like the live tables — ~330 clients (incl. ~10 dummy), 18+ months of monthly strategies with a growth curve, GSC rows with a dominant and a minority `window_key`, and 1–3% monthly churn. The mock rows flow through the **exact same aggregation functions** as live data, so demo mode exercises the full pipeline (dummy filtering, dedupe, tier fallbacks, GSC combo discovery, churn join). An amber banner marks demo mode in the UI.

If a live fetch fails at runtime, the app logs the error and falls back to demo data with a visible warning.

## Architecture

```
src/lib/data/index.ts     — facade: picks live (fetchers.ts) or mock (mock.ts) backend
src/lib/data/fetchers.ts  — one function per table; gsc/domain tables paginated via .range()
src/lib/data/mock.ts      — seeded raw-row generator (same RawDataset shape)
src/lib/data/aggregate/   — pure functions: packages.ts, gsc.ts, churn.ts, kpis.ts, shared.ts
src/app/page.tsx          — single server component; passes plain JSON to client charts
middleware.ts             — optional basic-auth gate (DASHBOARD_PASSWORD)
```

No API routes. The service-role key stays strictly server-side (`server-only` imports). The page revalidates every 300 s.

## Chart → table mapping

| Chart | Source tables | Logic |
| --- | --- | --- |
| Package distribution | `monthly_strategy` (+ `Client`, `Subscription` for fallbacks) | Distinct clients per tier per month. Dedupe per client-month: prefer status `approved`/`completed`, then highest `strategy_version`. |
| GSC client results | `gsc_sitewide_metrics` (+ `Client` for dummy filter) | Filtered to one `(window_key, metric_key, segment)` combo (see below), bucketed by `end_date` month. Clicks/impressions summed; CTR recomputed as clicks/impressions; position is impressions-weighted average. |
| Churn per package | `domain_locale` → `domain` → `Client` (+ `monthly_strategy`, `Subscription` fallbacks) | Churned = distinct clients whose locales are all inactive and have a `cancelled` locale with `service_end`; churn month = latest `service_end`. Churn rate = churned / active-at-month-start. |
| KPI cards | all of the above | Active clients from active locales (fallback: latest strategy month), current tier mix, trailing 30/90-day churn, 90-day churn rate. |

### Package tier derivation

`items_per_month` → tier: **≤ 10 → Package 1, ≤ 20 → Package 2, else → Package 3.**
Fallback chain when `items_per_month` is null/0: `monthly_strategy.items_per_month` → `Client.subscription` → `Subscription.items_per_month` → default Package 1 (with a logged warning). For churned clients: `domain_locale.items_per_month` → latest `monthly_strategy` → subscription → Package 1.

### GSC combo discovery / override

`gsc_sitewide_metrics` may contain multiple `(window_key, metric_key, segment)` combinations. The dashboard **auto-discovers the dominant combo** (most rows; tie-break: most distinct `end_date`s) and shows it in the chart caption. Each dimension can be pinned via `GSC_WINDOW_KEY` / `GSC_METRIC_KEY` / `GSC_SEGMENT`.

If more than 50% of the chosen combo's rows have null `clicks` **and** `impressions`, the aggregator assumes a one-metric-per-row schema and re-aggregates across all `metric_key`s of the chosen window/segment, coalescing columns (a warning is logged and shown under "Data caveats").

## Deploying to Vercel

1. Import the repo; framework preset **Next.js** (zero config).
2. Set env vars in Project → Settings → Environment Variables: at minimum `SUPABASE_SERVICE_ROLE_KEY` (Production, **not** exposed to the client — do not prefix with `NEXT_PUBLIC_`), and `DASHBOARD_PASSWORD` if you want the auth gate.
3. The basic-auth middleware runs on the Edge runtime (uses only `atob`/headers — edge-safe).
4. Page revalidates every 300 s (ISR); no cron needed.

## Verify against live data (checklist)

Before trusting live numbers, check these against the real database — the server logs (and the "Data caveats" footnote) surface most of them:

- [ ] **GSC `metric_key` semantics** — one row with all metrics vs. one metric per row. Watch for the "coalescing across all metric_keys" warning; if it fires, verify the coalesced numbers or pin `GSC_METRIC_KEY`.
- [ ] **Actual `window_key` / `segment` values** — the chart caption shows what was auto-discovered; confirm it's the intended window (e.g. `last_28d`) and pin via env if needed.
- [ ] **`domain_locale.subscription_status` values** — confirm `cancelled` is the churn marker (matching is case-insensitive) and check the "unknown subscription_status" warning for unexpected values.
- [ ] **`service_end` coverage** — churn detection requires non-null `service_end` on cancelled locales.
- [ ] **`year_period` / `month_period` types** — int vs. string both handled; unparsable rows fall back to `start_date`.
- [ ] **Real `items_per_month` values** — tier cutoffs assume 10/20/40; adjust `tierFromItems` in `src/lib/data/aggregate/shared.ts` if package sizes change.
- [ ] **GSC pagination total** — expect ≈ 8.6k rows from `gsc_sitewide_metrics`; the fetcher paginates in pages of 1000 until a short page.
- [ ] **Dummy clients** — rows for `dummy_client = true` clients are excluded everywhere; spot-check the count.
