# Current project context

This document describes the intended current public product. Use the code and data contracts
for exact implementation details. The public canonical repository reference is
[Clincher1/market-pulse1 on `main`](https://github.com/Clincher1/market-pulse1/tree/main);
the live site is <https://market-pulse1-eta.vercel.app/>. A working branch can contain
changes not yet published to `main`.

## Product purpose

Market Pulse presents traceable market observations and source headlines. Each market value
should make clear what instrument it describes, where it came from, the date or time of the
observation, and its unit. A calculated change is separate from the source value and must be
reproducible from its displayed inputs.

The site does not issue current forecasts or investment recommendations. Forecast issuance
is stopped; old records and outcomes remain in the archive/database. A price movement after a
headline does not establish that the headline caused it, and similar headlines are not by
themselves proof of a single event.

## Public interface

- **Russian market section** (`src/components/RussiaBusiness.tsx`): Russian indicators from
  the server API, with source, basis, date/time and units; rate spreads are explicit arithmetic
  from displayed inputs. Russian business headlines are displayed with source, publication
  time and direct link.
- **Global market section** (`src/components/KeyAssets.tsx`,
  `src/components/MarketHeatmap.tsx`): market values and dated series from configured sources.
  Respect the instrument and observation-date meaning in the data contract.
- **News feed** (`src/components/NewsFeed.tsx`, `src/data/liveNews.ts`): publication title,
  source, publication time and URL only. The browser query does not request model summary,
  topic, importance, confidence, sentiment or impact fields. Headlines are not ranked or
  merged into inferred events by the public feed.
- **Daily passport** (`src/components/DailyPassport.tsx`): saved morning snapshot values and
  dates; a missing field is not filled with a current or estimated value.
- **What changed** (`src/components/WhatChanged.tsx`): transparent observations about the
  displayed series. If no display rule fires, the empty state is neutral and does not describe
  the market as normal.
- **Daily brief and image** (`src/components/DailyBrief.tsx`, `api/brief-image.js`): values
  and comparisons from market series/snapshots, not news sentiment or an inferred causal
  narrative.
- **Market memory** (`src/components/MarketMemory.tsx`): archived forecast records and their
  price-series outcomes only. Event classifications, event outcomes and historical analogue
  groups are not loaded into this public view. The archive is not a current signal and does not
  prove a news-to-price cause.
- **Methodology and system status** (`src/components/AnalyticsGuide.tsx`,
  `src/components/SystemStatus.tsx`): explain the displayed data and the public data checks.
  Internal historical checks can remain in server history without being presented as product
  metrics.

The news-tension index is not part of the public interface. Do not rename it as a “negative
share” or introduce another score in its place. Legacy server/database history is preserved;
removing its display does not authorize deleting historical rows or changing production data.

## Data and runtime boundaries

- React reads public, read-only cached data through the single client in
  `src/lib/supabase.ts`. Keep RLS/grants read-only for browser access.
- Russian market indicators and RSS headlines are fetched by `api/russia-insights.js`;
  three-month Russian history is served by `api/russia-history.js`; the Telegram/share image
  is rendered by `api/brief-image.js`.
- Scheduled Supabase Edge Functions and Postgres store/update the public caches and legacy
  archives. Their source lives under `supabase/functions/`; database changes require
  migrations. Do not infer that a historic server process or column is a public product
  feature merely because it still exists.
- External requests need server-side timeouts and must fail independently. One slow provider
  must not hold up unrelated market values or headlines.
- Only free service tiers are in scope. No cookies, analytics, telemetry or browser monitoring
  SDKs; technical monitoring is server-side.

## Rules for facts and calculations

1. Preserve the source instrument, provider, unit, cadence and observation date. A quote,
   settled close and official daily rate are not interchangeable.
2. Show missing data as missing. Do not substitute yesterday's value under today's date, a
   fake number, or an unverified “equivalent” provider.
3. Keep exact source headlines intact with source, time and URL. Do not present machine-written
   labels or summaries as verified reporting.
4. Explain arithmetic from the values actually shown. State the comparison dates and units;
   do not use a numerical coincidence to claim causation.
5. Stability and reliability are evaluated over time windows, not one measurement. Follow
   `docs/VERIFICATION-METHOD.md` and report only observed test/live results.
6. Keep graphs on the shared standard and label their cadence. Missing dates remain missing;
   do not interpolate them silently.

## Development and verification

Node.js 22 is expected. The normal local workflow is:

```bash
npm ci
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
```

Run `npm ci` before `npm test`. Edge Function validation:

```bash
cd supabase/functions && npx -y deno@2 check */index.ts _shared/*.ts
```

For repository-specific review, see `AGENTS.md`, `docs/DATA-CONTRACT.md`,
`docs/SELF-CHECK.md`, `docs/VERIFICATION-METHOD.md` and `supabase/README.md`.
`docs/CONCEPT.md` is retained as a historical artifact and is not the current product
specification.

## Personal market desk

`src/components/MarketDesk.tsx` adds a short factual summary and an optional watchlist
on the overview. The global page reuses the watchlist and offers a comparison chart.
Only the five existing global instruments are offered; provider/instrument selection
and database policies are unchanged. Favorites are a validated list of instrument IDs
in localStorage, not a user identifier. Storage denial falls back to tab-only state.

Summary selection is deterministic: the largest absolute available percentage move
within each contour. The Russian candidates are IMOEX, RGBI and USD/RUB; global moves
are recalculated from the last two dated cached observations. Comparison periods can
differ and are displayed, so this is not a claim about all markets over one session.

Comparison uses the exact intersection of the selected instruments' dated calendars,
then rebases every series at the same first observation: `(value / first - 1) * 100`.
The optional base-100 scale adds 100. The window is a count of common observations,
not a promise of a calendar week/month. Missing/invalid dates, nonpositive prices or
insufficient common history produce an explicit empty state, never interpolation or
silent omission of a selected instrument. Endpoints, units and sources are printed
beside the chart; dividends, currency conversion and costs are not included.

Validation lives in `tests/market-desk.test.mjs` (pure calculations) and
`tests/market-desk-ui.test.mjs` (React interactions in jsdom; only network boundaries
are mocked). The latter includes favorites/remount, corrupt/denied storage, initial
and refresh failures, partial coverage, cross-tab sync, chart selection/scale and a
narrow chart coordinate system. These are not full-browser visual tests.
