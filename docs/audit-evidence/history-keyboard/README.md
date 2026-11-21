# Expanded history tables: release acceptance

## Published product

- Product commit: `a95cc83041024d69e34eb83fb19234f7e035a1eb`.
- Vercel deployment: `dpl_8PNJefLTPuzX7WRprPT6ZCwFMmqV`, observed READY / PROMOTED.
- Production alias confirmed by the Vercel connector: https://market-pulse1-eta.vercel.app/.
- No database migrations, historical data changes or manual writer/selfcheck/morning-snapshot invocations in this follow-up.

## Fix

Russian and global expanded history tables now have named, keyboard-focusable scroll regions and visible focus outlines. The global table column says “Наблюдение”, rather than implying that every data source is an official close.

## Local checks

`npm ci`, all **351 tests**, frontend TypeScript, ESLint, production build and Deno typechecking of every Edge Function/shared module passed. The built main asset was `index-BvRrdOev.js`.

## Two consecutive live rounds

GitHub Actions run: https://github.com/Clincher1/market-pulse1/actions/runs/44878258066 — **success**.

| Check | A | B |
| --- | --- | --- |
| Completed route/viewport cases | 42 | 42 |
| Widths (px) | 360 / 768 / 1280 | 360 / 768 / 1280 |
| Expanded-history accessibility checks | 6 | 6 |
| axe violations | 0 | 0 |
| Console / HTTP / failed requests | 0 / 0 / 0 | 0 / 0 / 0 |
| Browser failures | 0 | 0 |
| HTTP, access-rights and arithmetic findings | 0 | 0 |

The browser verifies keyboard scrolling of expanded Russian/global history, comparison-table keyboard scrolling, favorite persistence, news controls, legacy redirects, raw and runtime canonical metadata, mobile navigation feedback and reduced-motion behavior. Each round also runs the read-only HTTP/rights/math audit; its full results are in `http-A.json` and `http-B.json`. Selected 360px screenshots were inspected, including the empty gold-history explanation and market overview.

Gold has a valid current spot quote but no completed new-source daily history yet. Its displayed percentage remains absent, not a fabricated zero, and the UI explicitly explains accumulation without past-day reconstruction. Historical Twelve Data projections and raw archives remain inaccessible to anonymous readers.

## Evidence boundaries

The recorded runner timestamps are A `2026-11-21T07:01:42.837Z`–`07:05:26.994Z`, B `07:05:26.999Z`–`07:07:57.141Z`; these are verbatim external timestamps, not a correction to the session/system clock. The audit reads the already scheduled health record (`2026-11-21T06:25:03.882+00:00`, ok=true). Both rounds saw that same older record: it is **not** two new selfcheck runs and does not verify post-release hourly monitoring. No claim of days-long stability or independent certification of market prices is made. Two clean browser/API rounds cover the tested release and finite observation window only.
