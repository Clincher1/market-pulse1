// Stage 4 shadow event-study evaluator.
//
// For every classified shadow event impact, compare the primary daily price
// series after the event with the previous close and with a trailing baseline.
// Daily prices cannot identify the exact intraday reaction time; raw rows say
// so explicitly. This function writes only event_price_impacts_v2.

const SUPABASE_URL = "https://hekzplfftannlzwvgwwm.supabase.co";
const EVALUATOR_VERSION = "event_study_v1";
const HORIZONS = [1, 3, 10] as const;
const BASELINE_RETURNS = 60;
const MIN_BASELINE_RETURNS = 20;

type AnyRecord = Record<string, unknown>;
type PricePoint = { date: string; price: number };
type Instrument = {
  id: string;
  assetKey: string;
  provider: string;
  symbol: string;
  unit: string;
  prices: PricePoint[];
};

function serviceKey(): string {
  const key = Deno.env.get("SERVICE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) throw new Error("Missing SERVICE_KEY/SUPABASE_SERVICE_ROLE_KEY secret");
  return key;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < b.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Gateway verify_jwt alone is not enough: a public publishable key can pass
// JWT verification. Shadow writers therefore require the actual service-role
// bearer token (sent by the guarded dispatcher) or the shared cron secret.
function isAuthorizedService(req: Request): boolean {
  const auth = req.headers.get("Authorization") ?? "";
  const keys = [
    Deno.env.get("SERVICE_KEY") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  ].filter(Boolean);
  if (keys.some((key) => auth === `Bearer ${key}`)) return true;
  return timingSafeEqual(req.headers.get("x-cron-secret") ?? "", Deno.env.get("CRON_SECRET") ?? "");
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

function isRecord(value: unknown): value is AnyRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

function directionHit(expected: string, returnPct: number, dailyVolatility: number | null): boolean | null {
  if (expected === "up") return returnPct > 0;
  if (expected === "down") return returnPct < 0;
  if (expected === "neutral") {
    return dailyVolatility !== null ? Math.abs(returnPct) <= dailyVolatility : null;
  }
  return null;
}

Deno.serve(async (request) => {
  if (!isAuthorizedService(request)) return Response.json({ success: false, error: "unauthorized" }, { status: 401 });
  try {
    const url = new URL(request.url);
    const eventLimit = clampInteger(Number(url.searchParams.get("limit") ?? 50), 1, 200, 50);

    const instrumentRows = await restJson(
      "asset_instruments_v2?select=id,asset_key,provider,provider_symbol,unit&enabled=eq.true&is_primary=eq.true",
    ) as AnyRecord[];

    const instrumentsByAsset = new Map<string, Instrument>();
    for (const row of instrumentRows) {
      const instrument: Instrument = {
        id: String(row.id),
        assetKey: String(row.asset_key),
        provider: String(row.provider ?? ""),
        symbol: String(row.provider_symbol ?? ""),
        unit: String(row.unit ?? ""),
        prices: [],
      };
      const prices = await restJson(
        `asset_price_snapshots_v2?select=observation_date,price,close&instrument_id=eq.${encodeURIComponent(instrument.id)}` +
        "&observation_date=not.is.null&order=observation_date.asc&limit=5000",
      ) as AnyRecord[];
      instrument.prices = prices.map((priceRow) => ({
        date: String(priceRow.observation_date ?? ""),
        price: finiteNumber(priceRow.close ?? priceRow.price) ?? Number.NaN,
      })).filter((point) => point.date && Number.isFinite(point.price) && point.price > 0);
      instrumentsByAsset.set(instrument.assetKey, instrument);
    }

    const classifications = await restJson(
      "news_event_classifications_shadow?select=event_id,status,relevance,confidence,importance,sentiment,transmission_channel,impacts,model,prompt_version,classified_at" +
      `&status=eq.classified&order=classified_at.desc&limit=${eventLimit}`,
    ) as AnyRecord[];

    const eventIds = [...new Set(classifications.map((row) => String(row.event_id)).filter(Boolean))];
    const eventsById = new Map<string, AnyRecord>();
    for (let offset = 0; offset < eventIds.length; offset += 50) {
      const chunk = eventIds.slice(offset, offset + 50);
      const inList = chunk.map((id) => encodeURIComponent(id)).join(",");
      const events = await restJson(
        `news_events_shadow?select=id,title,first_published_at,latest_published_at,article_count,source_count,rank_score&id=in.(${inList})&limit=100`,
      ) as AnyRecord[];
      for (const event of events) eventsById.set(String(event.id), event);
    }

    const rows: AnyRecord[] = [];
    for (const classification of classifications) {
      const event = eventsById.get(String(classification.event_id));
      if (!event) continue;
      const publishedAtRaw = String(event.first_published_at ?? "");
      const eventDate = publishedAtRaw.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) continue;
      const impacts = Array.isArray(classification.impacts) ? classification.impacts : [];

      for (const rawImpact of impacts) {
        if (!isRecord(rawImpact)) continue;
        const assetKey = String(rawImpact.asset ?? "");
        const instrument = instrumentsByAsset.get(assetKey);
        if (!instrument) continue;
        const expectedDirection = String(rawImpact.direction ?? "uncertain");
        const prices = instrument.prices;

        let baseIndex = -1;
        for (let index = 0; index < prices.length; index += 1) {
          if (prices[index].date < eventDate) baseIndex = index;
          else break;
        }

        const baselineReturns: number[] = [];
        if (baseIndex >= 1) {
          const start = Math.max(1, baseIndex - BASELINE_RETURNS + 1);
          for (let index = start; index <= baseIndex; index += 1) {
            const previous = prices[index - 1].price;
            if (previous > 0 && prices[index].price > 0) baselineReturns.push((prices[index].price / previous - 1) * 100);
          }
        }
        const baseline = statistics(baselineReturns);

        for (const horizon of HORIZONS) {
          const base = baseIndex >= 0 ? prices[baseIndex] : null;
          const outcomeIndex = baseIndex + horizon;
          const outcome = outcomeIndex >= 0 && outcomeIndex < prices.length ? prices[outcomeIndex] : null;
          const evaluatedAt = new Date().toISOString();

          let status = "pending";
          let returnPct: number | null = null;
          let abnormalReturnPct: number | null = null;
          let abnormalZ: number | null = null;
          let hit: boolean | null = null;

          if (!base || baseline.count < MIN_BASELINE_RETURNS) {
            status = "insufficient_price_data";
          } else if (outcome) {
            status = "evaluated";
            returnPct = base.price !== 0 ? (outcome.price / base.price - 1) * 100 : null;
            if (returnPct !== null && baseline.mean !== null) {
              abnormalReturnPct = returnPct - baseline.mean * horizon;
              if (baseline.stdev !== null && baseline.stdev > 0) {
                abnormalZ = abnormalReturnPct / (baseline.stdev * Math.sqrt(horizon));
              }
              hit = directionHit(expectedDirection, returnPct, baseline.stdev);
            }
          }

          rows.push({
            event_id: String(event.id),
            asset_key: assetKey,
            instrument_id: instrument.id,
            expected_direction: expectedDirection,
            expected_strength: finiteNumber(rawImpact.strength),
            expected_horizon: String(rawImpact.horizon ?? "") || null,
            horizon_trading_days: horizon,
            status,
            event_published_at: publishedAtRaw || null,
            base_observation_date: base?.date ?? null,
            base_price: base?.price ?? null,
            outcome_observation_date: outcome?.date ?? null,
            outcome_price: outcome?.price ?? null,
            return_pct: returnPct,
            baseline_observations: baseline.count,
            baseline_mean_daily_pct: baseline.mean,
            baseline_volatility_daily_pct: baseline.stdev,
            abnormal_return_pct: abnormalReturnPct,
            abnormal_z: abnormalZ,
            direction_hit: hit,
            evaluated_at: status === "evaluated" ? evaluatedAt : null,
            evaluator_version: EVALUATOR_VERSION,
            raw: {
              alignment: "Base is the last daily observation before the UTC event date. Horizon 1 is the next available daily observation; daily data cannot prove the exact intraday reaction time.",
              event_title: event.title ?? null,
              event_source_count: event.source_count ?? null,
              event_article_count: event.article_count ?? null,
              classification: {
                relevance: classification.relevance ?? null,
                confidence: classification.confidence ?? null,
                importance: classification.importance ?? null,
                sentiment: classification.sentiment ?? null,
                transmission_channel: classification.transmission_channel ?? null,
                model: classification.model ?? null,
                prompt_version: classification.prompt_version ?? null,
              },
              impact_rationale_ru: rawImpact.rationale_ru ?? null,
              instrument: {
                provider: instrument.provider,
                symbol: instrument.symbol,
                unit: instrument.unit,
                price_points_loaded: prices.length,
              },
            },
            updated_at: evaluatedAt,
          });
        }
      }
    }

    if (rows.length) {
      await restJson(
        "event_price_impacts_v2?on_conflict=event_id,asset_key,horizon_trading_days,evaluator_version",
        {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify(rows),
        },
      );
    }

    return Response.json({
      success: true,
      evaluator_version: EVALUATOR_VERSION,
      classifications_considered: classifications.length,
      rows_upserted: rows.length,
      evaluated: rows.filter((row) => row.status === "evaluated").length,
      pending: rows.filter((row) => row.status === "pending").length,
      insufficient_price_data: rows.filter((row) => row.status === "insufficient_price_data").length,
      instruments: [...instrumentsByAsset.values()].map((instrument) => ({
        asset_key: instrument.assetKey,
        instrument_id: instrument.id,
        provider: instrument.provider,
        symbol: instrument.symbol,
        unit: instrument.unit,
        price_points: instrument.prices.length,
        first_date: instrument.prices[0]?.date ?? null,
        last_date: instrument.prices.at(-1)?.date ?? null,
      })),
      sample: rows.slice(0, 20).map((row) => ({
        event_id: row.event_id,
        asset_key: row.asset_key,
        horizon: row.horizon_trading_days,
        status: row.status,
        base_date: row.base_observation_date,
        outcome_date: row.outcome_observation_date,
        return_pct: row.return_pct,
        abnormal_return_pct: row.abnormal_return_pct,
        direction_hit: row.direction_hit,
      })),
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
});