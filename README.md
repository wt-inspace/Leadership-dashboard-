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
| `GSC_WINDOW_KEY` | no | GSC `window_key` to use. Default `28d` (verified values: `28d`, `3m`, `6m`, `12m`). |
| `GSC_METRIC_KEY` | no | GSC `metric_key` to use. Default `gsc_sitewide_28d_all_compared` (pattern: `gsc_sitewide_{window}_{segment}_{plain|compared}`). |
| `GSC_SEGMENT` | no | GSC `segment` to use. Default `all` (verified values: `all`, `nonbranded`). |
| `MONTHS_BACK` | no | Chart lookback window in months. Default `18`. Series are additionally floored at `2025-08` (business data start) and clipped at the current month. |

## Demo mode

With no service-role key (or `DEMO_MODE=1`), the app generates a **deterministic mock dataset of raw rows** (seeded PRNG) shaped exactly like the live tables — ~330 clients (incl. ~10 dummy) with `client_status` offer dates, Stripe subscriptions (incl. canceled ones and MRR outliers), VAT-inflated invoice amounts in cents, partial-coverage monthly strategies with engagement-numbered `month_period` and future rows, and multi-snapshot GSC months. The mock rows flow through the **exact same aggregation functions** as live data, so demo mode exercises the full pipeline (dummy filtering, strategy dedupe, tier fallback chains, GSC snapshot dedupe and combo pinning, churn derivation). An amber banner marks demo mode in the UI.

If a live fetch fails at runtime, the app logs the error and falls back to demo data with a visible warning.

## Architecture

```
src/lib/data/index.ts          — facade: picks live (fetchers.ts) or mock (mock.ts) backend
src/lib/data/fetchers.ts       — one function per table; large tables paginated via .range()
src/lib/data/mock.ts           — seeded raw-row generator (same RawDataset shape)
src/lib/data/aggregate/model.ts — per-client lifecycle model (start, tier timeline, churn)
src/lib/data/aggregate/        — pure functions: packages.ts, gsc.ts, churn.ts, kpis.ts, shared.ts
src/app/page.tsx               — single server component; passes plain JSON to client charts
src/middleware.ts              — optional basic-auth gate (DASHBOARD_PASSWORD)
```

No API routes. The service-role key stays strictly server-side (`server-only` imports). The page revalidates every 300 s.

## Data model

The distribution chart, churn chart, and KPI cards all read from **one per-client lifecycle model** so they tell a consistent story:

- **Start month** — `MIN(client_status.date_offer_accepted)` per client, falling back to the earliest `stripe_subscriptions.subscription_start_date`, then the first paid invoice `paid_at`. Clients with none of these are excluded (surfaced as a warning).
- **Tier timeline** — initial tier from the first `client_status.MRR` (600/1000/1750 → P1/P2/P3); from each `monthly_strategy` month onward the strategy's `items_per_month` tier overrides it (carried forward); fallbacks: current `Client.subscription` → `Subscription.items_per_month`, then Stripe MRR; final default Package 1 (warned).
- **Churn** — (a) a `canceled`/`incomplete_expired` Stripe subscription dates churn to the month of its `updated_at` (**approximation**: the table has no `canceled_at` column), *unless* the client also has an `active`/`past_due` subscription (that is a plan change, not churn); (b) otherwise, clients with `subscription_active = false` churn the month **after** their last paid invoice, falling back to their last `monthly_strategy.end_date`. One churn event per client (latest).

## Chart → source mapping

| Chart | Sources | Logic |
| --- | --- | --- |
| Package distribution | `client_status` + `monthly_strategy` + `stripe_subscriptions`/`stripe_invoices` (+ `Client`/`Subscription` fallbacks) | Active clients per tier per month from the lifecycle model: counted in month M if started ≤ M and not churned ≤ M; tier = tier timeline at M. |
| GSC client results | `gsc_sitewide_metrics` (+ `Client` for dummy filter) | Pinned to `28d` / `gsc_sitewide_28d_all_compared` / `all` (overridable; auto-discovery fallback). **Deduped to the latest snapshot per client per month** (clients can have up to ~5 snapshots/month), then bucketed by `end_date` month. Clicks/impressions summed; CTR recomputed; position impressions-weighted. |
| Churn per package | `stripe_subscriptions` (status + `updated_at`) + `stripe_invoices` (last-paid fallback) + `Client.subscription_active` | Churn events from the model, grouped by month and tier-at-churn. Churn rate = churned / active at month start (same model). |
| KPI cards | all of the above | Active clients = non-dummy `subscription_active = true`; current tier mix = tier timeline at the current month for those clients; trailing 30/90-day churn from the events; 90-day rate vs. clients active 90 days ago. |

Note: the `domain` / `domain_locale` tables are **not** used — in production their `subscription_status` and `service_start`/`service_end` columns are entirely null, so they carry no churn signal.

### Package tier derivation

`items_per_month` → tier: **≤ 10 → Package 1, ≤ 20 → Package 2, else → Package 3** (the 5-item trial lands in P1). `Subscription` lookup: type 0 → 5 items (trial), 1 → 10, 2 → 20, 3 → 40.
Monthly EUR (MRR) → tier by nearest of {600, 1000, 1750}: ≤ 800 → P1, ≤ 1375 → P2, else P3 — this absorbs Stripe MRR outliers (500, 1400, 10200, ...).

### monthly_strategy caveats

`month_period` is the client's **engagement month number** (1, 2, 3, ...), not a calendar month, and `year_period` is almost always null — calendar bucketing uses `start_date`. Rows exist for **future** months; all series clip at the current month. Statuses seen: `to_approve`, `approved`, `modifying`; dedupe per client-month prefers `approved` (then highest `strategy_version`). Coverage is partial (~80 clients/month), which is why the distribution chart is driven by the lifecycle model rather than by strategy rows alone.

### GSC combo pinning / discovery

`gsc_sitewide_metrics` contains combos of `window_key` ∈ {`28d`, `3m`, `6m`, `12m`} × `segment` ∈ {`all`, `nonbranded`} × `metric_key` = `gsc_sitewide_{window}_{segment}_{plain|compared}`. The dashboard pins `28d` / `all` / `..._compared` by default (env-overridable); if the pinned combo matches no rows it falls back to auto-discovery (most rows; tie-break: most distinct `end_date`s) with a warning. The combo in use is shown in the chart caption. Snapshots started in 2026-01, so the GSC series is shorter than the other charts.

## Deploying to Vercel

1. Import the repo; framework preset **Next.js** (zero config).
2. Set env vars in Project → Settings → Environment Variables: at minimum `SUPABASE_SERVICE_ROLE_KEY` (Production, **not** exposed to the client — do not prefix with `NEXT_PUBLIC_`), and `DASHBOARD_PASSWORD` if you want the auth gate.
3. The basic-auth middleware runs on the Edge runtime (uses only `atob`/headers — edge-safe).
4. Page revalidates every 300 s (ISR); no cron needed.

## Known approximations

- **Churn dates from Stripe use `updated_at`** of the canceled subscription (no `canceled_at` column exists). If a canceled row is touched later, its churn month shifts accordingly.
- Invoice-derived churn is dated to the **first day of the month after** the last paid invoice.
- `stripe_invoices.amount_due` is in cents and usually includes 21% VAT; it is only used to date churn (never for tiers).
- Clients whose only inactivity signal is `subscription_active = false` with no paid invoice and no strategy rows cannot be dated and are excluded from the churn series (counted in a warning).
