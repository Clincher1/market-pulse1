# Twelve Data key rotation and `update-assets` replacement — 2026-10-22

## Result

The user updated the Supabase `TWELVE_KEY` Edge Function secret at **2026-10-22 07:17:50 UTC**. The legacy `update-assets` implementation with a hardcoded Twelve Data fallback has been replaced. The new production function reads Twelve Data only from `Deno.env.get("TWELVE_KEY")`; there is no hardcoded API-key fallback.

**The old Twelve Data key can now be revoked.** No remaining production code path found in this audit needs it: the frontend does not call Twelve Data, `update-assets` uses the Supabase secret, and `update-prices-v2-shadow` also uses the Supabase secret.

## Canonical implementation

- Canonical source: `supabase/functions/update-assets/index.ts`
- Production slug: `update-assets` v12, `verify_jwt=false` (preserved for the existing pg_cron caller; authenticated cron remains Stage 5 work)
- Shadow slug: `update-assets-v2-shadow` v3, `verify_jwt=true`
- The deployed bodies are the esbuild-minified form of the canonical TypeScript source.
- The shadow slug never writes `cached_assets`.
- Production publishes all five assets only if every provider response validates. A partial provider failure leaves the previous public cache untouched.
- A 15-minute freshness gate limits provider/API use even though pg_cron still calls the slug every 5 minutes.

## Instrument mapping after the replacement

| Public ID | Public name | Actual instrument/source | Unit |
|---|---|---|---|
| `usd-eur` | USD/EUR | Inverse of ECB EUR/USD daily reference | EUR per 1 USD |
| `sp500` | S&P 500 | FRED `SP500` cash index | index points |
| `brent` | Brent | FRED/EIA `DCOILBRENTEU` Brent spot | USD/barrel |
| `gold` | Gold | Twelve Data `XAU/USD` spot quote + daily series | USD/troy ounce |
| `btc` | BTC | Kraken `XBTUSD` daily candles; latest UTC candle may be partial | USD/BTC |

This removes the previous public-cache substitutions/rescaling: SPY×10 labelled as S&P 500, GLD×10 labelled as Gold, and USO used for the Brent row. The legacy `cached_assets.price` column is still a formatted string because that is the current frontend contract; displaying instrument/source/as-of in the UI and moving formatting fully to numeric frontend data remain later Stage 3/6 work.

## Verification sequence

1. Pre-deploy public-cache backup (5 rows):
   - `/home/user/backups/market-pulse-2026-10-22-pre-update-assets/cached_assets.json`
2. Shadow run at `2026-10-22T07:35:42.949Z`:
   - 5/5 assets OK;
   - Twelve Data `quote` and `time_series` both succeeded with the new secret;
   - `publish=false`, and SQL confirmed the old public rows were untouched.
   - Evidence: `docs/update_assets_v2_shadow_2026-10-22_run1.json`
3. First production deployment (v10) exposed an ID-case bug: it inserted `Brent` while the frontend/public contract uses lowercase `brent`. The canonical code was corrected, production was redeployed as v11 and then hardened as v12 (the temporary production `dry_run` bypass was removed), the lowercase row was published, and the single erroneous uppercase row was deleted.
4. Corrected production run at `2026-10-22T07:41:28.200Z`:
   - USD/EUR `0.8902`, −0.1691%, 30 points;
   - S&P 500 `7,757`, +0.5783%, 30 points;
   - Brent `$115.22`, −3.0298%, 30 points;
   - Gold `$4,090.4`, −1.0672%, 29 points;
   - BTC `$82,201`, −2.1682%, 30 points.
   - Evidence: `docs/update_assets_production_2026-10-22_run2_brent_fix.json`
   - Final v12 run at `2026-10-22T07:56:55.057Z` again published 5/5 (Gold `$4,085.8`, BTC `$82,078`); evidence: `docs/update_assets_production_2026-10-22_run3_v12.json`.
5. SQL and anonymous PostgREST both verified exactly 5 rows with lowercase public IDs.
6. Existing pg_cron calls at 07:45 and 07:50 UTC reached the new production function; `net._http_response` recorded HTTP 200 with the expected `asset_cache_cooldown` response.

## Freshness caveats at first corrected run

- S&P 500 and ECB reference data were dated 2026-10-21.
- FRED/EIA Brent was dated 2026-10-20 because of publication lag.
- Kraken BTC used the current, still-partial 2026-10-22 UTC daily candle.
- Twelve Data gold quote bar timestamp was `2026-10-21T20:00:00Z`, with `quote_datetime=2026-10-22` and market open.

These are source/as-of differences, not silently mixed proxy instruments. The UI guide already warns that the card is a cached latest value rather than a streaming exchange quote.

## Addendum — owner reset the Twelve key again later on 2026-10-22

Later the same day, the owner reported using Twelve Data's API-key reset and
not yet entering the newly issued value anywhere. A reset invalidates the
previous key value. The public `cached_assets` rows still showed
`updated_at = 2026-10-22T17:05:00Z` when checked at 17:30 UTC, which is
consistent with the all-or-nothing asset writer failing after the reset
(although this public read alone does not prove the exact failure reason).

Required owner action: copy the newly issued Twelve key **only** into the
Supabase Edge Function secret named `TWELVE_KEY`, replacing its previous
value. Do not put it in GitHub, Vercel, frontend code, or chat. If the new
value is no longer visible, reset it once more in Twelve Data and paste the
fresh value into that Supabase secret immediately. No function redeploy is
needed for a secret-value change; the next successful `update-assets` run
should advance `cached_assets.updated_at` for all five rows together.

## Remaining Stage 5 work

- Replace the publishable-key pg_cron invocation pattern with an authenticated server-to-server mechanism and then lock legacy writer endpoints.
- Audit/disable or protect legacy `proxy` after confirming no internal caller depends on it.
- Remove the duplicate `SERVICE_KEY` secret after all functions use the built-in service-role secret name.
- Add source/as-of display in the asset UI and a freshness watchdog.
