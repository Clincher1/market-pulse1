// Stage 4 shadow forecast outcome evaluator.
//
// Updates only forecast_outcomes_v2. market_forecasts_v2 remains immutable.
// Target observations must be dated strictly after the forecast issue_date,
// even when the base daily price lags publication (for example FRED Brent).

const SUPABASE_URL = "https://hekzplfftannlzwvgwwm.supabase.co";
const BASELINE_RETURNS = 60;
const MIN_BASELINE_RETURNS = 20;

type AnyRecord = Record<string, unknown>;
type PricePoint = { date: string; price: number };

function serviceKey(): string {
  const key = Deno.env.get("SERVICE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) throw new Error("Missing SERVICE_KEY/SUPABASE_SERVICE_ROLE_KEY secret");
  return key;
}

async function restJson(path: string, init: RequestInit = {}): Promise<unknown> {
  const key = serviceKey();
  const headers = new Headers(init.headers);
  headers.set("apikey", key);
  headers.set("Authorization", `Bearer ${key}`);
  headers.set("Accept", "application/json");
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase REST ${response.status}: ${text.slice(0, 900)}`);
  return text ? JSON.parse(text) as unknown : null;
}

function finiteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clampInteger(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function statistics(values: number[]) {
  if (!values.length) return { count: 0, mean: null as number | null, stdev: null as number | null };
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (values.length < 2) return { count: values.length, mean, stdev: null };
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return { count: values.length, mean, stdev: Math.sqrt(variance) };
}

Deno.serve(async (request) => {
  try {
    const url = new URL(request.url);
    const limit = clampInteger(Number(url.searchParams.get("limit") ?? 200), 1, 1000, 200);

    const pending = await restJson(
      `forecast_outcomes_v2?select=id,forecast_id,status&status=eq.pending&order=id.asc&limit=${limit}`,
    ) as AnyRecord[];
    const forecastIds = pending.map((row) => String(row.forecast_id)).filter(Boolean);
    const forecastsById = new Map<string, AnyRecord>();

    for (let offset = 0; offset < forecastIds.length; offset += 50) {
      const chunk = forecastIds.slice(offset, offset + 50);
      const inList = chunk.map((id) => encodeURIComponent(id)).join(",");
      const forecasts = await restJson(
        `market_forecasts_v2?select=id,asset_key,instrument_id,issued_at,issue_date,horizon_trading_days,direction,score_up,base_observation_date,base_price,aggregation_version&id=in.(${inList})&limit=100`,
      ) as AnyRecord[];
      for (const forecast of forecasts) forecastsById.set(String(forecast.id), forecast);
    }

    const instrumentIds = [...new Set(
      [...forecastsById.values()].map((forecast) => String(forecast.instrument_id)).filter(Boolean),
    )];
    const pricesByInstrument = new Map<string, PricePoint[]>();
    for (const instrumentId of instrumentIds) {
      const rows = await restJson(
        `asset_price_snapshots_v2?select=observation_date,price,close&instrument_id=eq.${encodeURIComponent(instrumentId)}` +
        "&observation_date=not.is.null&order=observation_date.asc&limit=5000",
      ) as AnyRecord[];
      pricesByInstrument.set(
        instrumentId,
        rows.map((row) => ({
          date: String(row.observation_date ?? ""),
          price: finiteNumber(row.close ?? row.price) ?? Number.NaN,
        })).filter((point) => point.date && Number.isFinite(point.price) && point.price > 0),
      );
    }

    const updates: AnyRecord[] = [];
    let stillPending = 0;

    for (const outcomeRow of pending) {
      const forecast = forecastsById.get(String(outcomeRow.forecast_id));
      if (!forecast) continue;
      const prices = pricesByInstrument.get(String(forecast.instrument_id)) ?? [];
      const baseDate = String(forecast.base_observation_date ?? "");
      const basePrice = finiteNumber(forecast.base_price);
      const issueDate = String(forecast.issue_date ?? "");
      const horizon = finiteNumber(forecast.horizon_trading_days) ?? 0;

      const baseIndex = prices.findIndex((point) => point.date === baseDate);
      if (baseIndex < 0 || !basePrice || basePrice <= 0 || !horizon) {
        updates.push({
          forecast_id: String(forecast.id),
          status: "insufficient_price_data",
          evaluated_at: null,
          raw: { reason: "base_price_missing_or_not_found", base_observation_date: baseDate || null },
          updated_at: new Date().toISOString(),
        });
        continue;
      }

      const baselineReturns: number[] = [];
      const baselineStart = Math.max(1, baseIndex - BASELINE_RETURNS + 1);
      for (let index = baselineStart; index <= baseIndex; index += 1) {
        const previous = prices[index - 1].price;
        if (previous > 0 && prices[index].price > 0) {
          baselineReturns.push((prices[index].price / previous - 1) * 100);
        }
      }
      const baseline = statistics(baselineReturns);
      if (baseline.count < MIN_BASELINE_RETURNS) {
        updates.push({
          forecast_id: String(forecast.id),
          status: "insufficient_price_data",
          baseline_mean_daily_pct: baseline.mean,
          baseline_volatility_daily_pct: baseline.stdev,
          evaluated_at: null,
          raw: { reason: "baseline_too_short", baseline_observations: baseline.count },
          updated_at: new Date().toISOString(),
        });
        continue;
      }

      const firstAfterIssueIndex = prices.findIndex((point) => point.date > issueDate);
      const outcomeIndex = firstAfterIssueIndex >= 0 ? firstAfterIssueIndex + horizon - 1 : -1;
      const outcome = outcomeIndex >= 0 && outcomeIndex < prices.length ? prices[outcomeIndex] : null;
      if (!outcome) {
        stillPending += 1;
        continue;
      }

      const steps = outcomeIndex - baseIndex;
      const returnPct = (outcome.price / basePrice - 1) * 100;
      const abnormalReturnPct = baseline.mean !== null ? returnPct - baseline.mean * steps : null;
      const abnormalZ = abnormalReturnPct !== null && baseline.stdev !== null && baseline.stdev > 0 && steps > 0
        ? abnormalReturnPct / (baseline.stdev * Math.sqrt(steps))
        : null;
      const direction = String(forecast.direction ?? "none");
      const directionHit = direction === "up" ? returnPct > 0 : direction === "down" ? returnPct < 0 : null;
      const scoreUp = finiteNumber(forecast.score_up);
      const binaryUp = returnPct > 0 ? 1 : returnPct < 0 ? 0 : null;
      const Brier = direction !== "none" && scoreUp !== null && binaryUp !== null
        ? (scoreUp - binaryUp) ** 2
        : null;

      updates.push({
        forecast_id: String(forecast.id),
        status: "evaluated",
        outcome_observation_date: outcome.date,
        outcome_price: outcome.price,
        return_pct: returnPct,
        baseline_mean_daily_pct: baseline.mean,
        baseline_volatility_daily_pct: baseline.stdev,
        abnormal_return_pct: abnormalReturnPct,
        abnormal_z: abnormalZ,
        direction_hit: directionHit,
        Brier_score: Brier,
        evaluated_at: new Date().toISOString(),
        raw: {
          alignment: "Outcome is the horizon-th daily observation strictly after issue_date. Base may lag issue_date when the provider publishes with delay.",
          observation_steps_from_base: steps,
          baseline_observations: baseline.count,
          binary_up_for_brier: binaryUp,
          Brier_semantics: "Computed only for directional snapshots; score_up is not yet a calibrated probability.",
        },
        updated_at: new Date().toISOString(),
      });
    }

    if (updates.length) {
      await restJson("forecast_outcomes_v2?on_conflict=forecast_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(updates),
      });
    }

    return Response.json({
      success: true,
      pending_considered: pending.length,
      evaluated: updates.filter((row) => row.status === "evaluated").length,
      insufficient_price_data: updates.filter((row) => row.status === "insufficient_price_data").length,
      still_pending: stillPending,
      updates: updates.map((row) => ({
        forecast_id: row.forecast_id,
        status: row.status,
        outcome_date: row.outcome_observation_date ?? null,
        return_pct: row.return_pct ?? null,
        direction_hit: row.direction_hit ?? null,
      })),
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
});
