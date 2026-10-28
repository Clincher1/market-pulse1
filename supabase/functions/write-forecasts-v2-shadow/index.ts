// Stage 4: deterministic shadow forecast aggregation_v2.
import { serveWithErrorReporting } from "../_shared/observability.ts";
//
// Writes one immutable daily snapshot per asset/horizon to
// market_forecasts_v2 and a pending row to forecast_outcomes_v2.
// It never writes cached_forecasts.
//
// 2026-10-28, calibration: the first eleven resolved forecasts scored a Brier
// of 0.41 against 0.25 for a coin flip and hit the direction 4 times out of 11,
// with nine of them calling "up". The cause was not the threshold but the
// scale: two weak events agreeing produced score_up = 1.000, i.e. certainty out
// of almost nothing. The share is now shrunk toward the asset's own base rate
// before the 60/40 gate is applied, and a directional call needs three
// independent events. Most forecasts now come out as "none" on purpose.

const SUPABASE_URL = "https://hekzplfftannlzwvgwwm.supabase.co";
const AGGREGATION_VERSION = "aggregation_v2";
const REQUIRED_PROMPT_VERSION = "event_classification_v3";
const WINDOW_HOURS = 72;
const DECAY_HALF_LIFE_HOURS = 36;
const MIN_IMPACT_STRENGTH = 0.35;
const MIN_RELEVANCE = 0.50;
const MIN_CONFIDENCE = 0.50;
const MIN_DIRECTIONAL_WEIGHT = 0.05;
// How much pseudo-evidence the base rate is worth, and how many independent
// events a directional call needs. PRIOR_WEIGHT is set near the weight of one
// strong event, so thin evidence stays near the base rate instead of reaching
// a confident extreme.
const PRIOR_WEIGHT = 0.6;
const MIN_DIRECTIONAL_EVENTS = 3;
const BASE_RATE_DAYS = 90;
const MIN_BASE_OBSERVATIONS = 20;
const HORIZONS = [1, 3, 10] as const;

const HORIZON_FACTORS: Record<string, Record<number, number>> = {
  intraday: { 1: 1.0, 3: 0.35, 10: 0.10 },
  "1_3_days": { 1: 0.70, 3: 1.0, 10: 0.35 },
  "1_2_weeks": { 1: 0.20, 3: 0.50, 10: 1.0 },
  longer: { 1: 0.05, 3: 0.15, 10: 0.50 },
  unknown: { 1: 0.25, 3: 0.25, 10: 0.25 },
};

type AnyRecord = Record<string, unknown>;

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

// How often each asset actually rises, measured on its own price history.
// A directional claim is only meaningful relative to that: saying "up" every
// day is worth 50% on a coin-flip market and less than nothing on a falling
// one. Used as the prior the evidence share is shrunk toward.
async function loadBaseUpRates(): Promise<Record<string, number>> {
  const since = new Date(Date.now() - BASE_RATE_DAYS * 86_400_000).toISOString().slice(0, 10);
  try {
    const rows = await restJson(
      `asset_price_history_v1?select=asset_key,change_pct&observation_date=gte.${since}&change_pct=not.is.null&limit=3000`,
    ) as AnyRecord[];
    const up: Record<string, number> = {};
    const total: Record<string, number> = {};
    for (const row of rows ?? []) {
      // Case-insensitive: the price history and the instrument registry do not
      // agree on capitalisation.
      const key = String(row.asset_key ?? "").toLowerCase();
      const pct = Number(row.change_pct);
      if (!key || !Number.isFinite(pct)) continue;
      total[key] = (total[key] ?? 0) + 1;
      if (pct > 0) up[key] = (up[key] ?? 0) + 1;
    }
    const rates: Record<string, number> = {};
    for (const key of Object.keys(total)) {
      // Below a couple of dozen observations the rate is noise, so fall back to
      // a coin flip; clamped so a short window cannot swing the prior to an
      // extreme that is then hard for real evidence to overcome.
      const rate = total[key] >= MIN_BASE_OBSERVATIONS ? (up[key] ?? 0) / total[key] : 0.5;
      rates[key] = Math.min(0.65, Math.max(0.35, rate));
    }
    return rates;
  } catch (error) {
    console.warn("base rates unavailable, falling back to 0.5:", error);
    return {};
  }
}

function isRecord(value: unknown): value is AnyRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sourceFactor(sourceCount: number): number {
  if (sourceCount >= 3) return 1.40;
  if (sourceCount === 2) return 1.25;
  return 1.0;
}

function horizonFactor(declaredHorizon: string, forecastHorizon: number): number {
  return HORIZON_FACTORS[declaredHorizon]?.[forecastHorizon] ?? HORIZON_FACTORS.unknown[forecastHorizon];
}

serveWithErrorReporting("write-forecasts-v2-shadow", async (request) => {
  if (!isAuthorizedService(request)) return Response.json({ success: false, error: "unauthorized" }, { status: 401 });
  try {
    const issuedAt = new Date();
    const issuedAtIso = issuedAt.toISOString();
    const issueDate = issuedAtIso.slice(0, 10);
    const windowStart = new Date(issuedAt.getTime() - WINDOW_HOURS * 3600000).toISOString();

    const instruments = await restJson(
      "asset_instruments_v2?select=id,asset_key,provider,provider_symbol,unit&enabled=eq.true&is_primary=eq.true&order=asset_key.asc",
    ) as AnyRecord[];

    const classifications = await restJson(
      "news_event_classifications_shadow?select=event_id,relevance,confidence,importance,sentiment,transmission_channel,impacts,summary_ru,model,prompt_version,classified_at" +
      `&status=eq.classified&prompt_version=eq.${REQUIRED_PROMPT_VERSION}&classified_at=gte.${encodeURIComponent(windowStart)}&order=classified_at.desc&limit=500`,
    ) as AnyRecord[];

    const eventIds = [...new Set(classifications.map((row) => String(row.event_id)).filter(Boolean))];
    const eventsById = new Map<string, AnyRecord>();
    for (let offset = 0; offset < eventIds.length; offset += 50) {
      const chunk = eventIds.slice(offset, offset + 50);
      const inList = chunk.map((id) => encodeURIComponent(id)).join(",");
      const events = await restJson(
        `news_events_shadow?select=id,title,first_published_at,latest_published_at,article_count,source_count,sources,rank_score&id=in.(${inList})&limit=100`,
      ) as AnyRecord[];
      for (const event of events) eventsById.set(String(event.id), event);
    }

    const baseByInstrument = new Map<string, { date: string; price: number }>();
    for (const instrument of instruments) {
      const instrumentId = String(instrument.id);
      const rows = await restJson(
        `asset_price_snapshots_v2?select=observation_date,price,close&instrument_id=eq.${encodeURIComponent(instrumentId)}` +
        `&observation_date=lte.${issueDate}&order=observation_date.desc&limit=1`,
      ) as AnyRecord[];
      const row = rows[0];
      const price = finiteNumber(row?.close ?? row?.price);
      if (row && price !== null && price > 0) {
        baseByInstrument.set(instrumentId, { date: String(row.observation_date), price });
      }
    }

    const models = [...new Set(classifications.map((row) => String(row.model ?? "")).filter(Boolean))];
    const promptVersions = [...new Set(classifications.map((row) => String(row.prompt_version ?? "")).filter(Boolean))];
    const modelLabel = models.length === 1 ? models[0] : models.length ? "mixed" : null;
    const promptLabel = promptVersions.length === 1 ? promptVersions[0] : promptVersions.length ? "mixed" : null;

    const forecasts: AnyRecord[] = [];
    // Measured once per run, not per asset: how often each asset has actually
    // risen over the last three months.
    const baseUpRates = await loadBaseUpRates();

    for (const instrument of instruments) {
      const assetKey = String(instrument.asset_key);
      const instrumentId = String(instrument.id);
      const base = baseByInstrument.get(instrumentId) ?? null;
      const baseUp = baseUpRates[assetKey.toLowerCase()] ?? 0.5;

      type EvidenceItem = {
        eventId: string;
        direction: string;
        weight: number;
        relevance: number;
        sourceCount: number;
        detail: AnyRecord;
      };
      const evidenceByHorizon = new Map<number, EvidenceItem[]>(
        HORIZONS.map((horizon) => [horizon, [] as EvidenceItem[]]),
      );

      for (const classification of classifications) {
        const event = eventsById.get(String(classification.event_id));
        if (!event) continue;
        const relevance = finiteNumber(classification.relevance) ?? 0;
        const confidence = finiteNumber(classification.confidence) ?? 0;
        if (relevance < MIN_RELEVANCE || confidence < MIN_CONFIDENCE) continue;
        const importance = finiteNumber(classification.importance) ?? 0;
        const sourceCount = finiteNumber(event.source_count) ?? 1;
        const firstPublishedMs = new Date(String(event.first_published_at ?? "")).getTime();
        const ageHours = Number.isFinite(firstPublishedMs)
          ? Math.max(0, (issuedAt.getTime() - firstPublishedMs) / 3600000)
          : WINDOW_HOURS;
        const decay = 2 ** (-ageHours / DECAY_HALF_LIFE_HOURS);
        const impacts = Array.isArray(classification.impacts) ? classification.impacts : [];

        for (const rawImpact of impacts) {
          if (!isRecord(rawImpact) || String(rawImpact.asset ?? "") !== assetKey) continue;
          const strength = finiteNumber(rawImpact.strength) ?? 0;
          if (strength < MIN_IMPACT_STRENGTH) continue;
          const direction = String(rawImpact.direction ?? "uncertain");
          const declaredHorizon = String(rawImpact.horizon ?? "unknown");
          const baseWeight = relevance * confidence * (importance / 10) * strength * decay * sourceFactor(sourceCount);

          for (const horizon of HORIZONS) {
            const weight = baseWeight * horizonFactor(declaredHorizon, horizon);
            evidenceByHorizon.get(horizon)!.push({
              eventId: String(event.id),
              direction,
              weight,
              relevance,
              sourceCount,
              detail: {
                event_id: String(event.id),
                title: event.title ?? null,
                first_published_at: event.first_published_at ?? null,
                classified_at: classification.classified_at ?? null,
                direction,
                strength,
                declared_horizon: declaredHorizon,
                weight,
                relevance,
                confidence,
                importance,
                source_count: sourceCount,
                transmission_channel: classification.transmission_channel ?? null,
                rationale_ru: rawImpact.rationale_ru ?? null,
              },
            });
          }
        }
      }

      for (const horizon of HORIZONS) {
        const evidenceItems = evidenceByHorizon.get(horizon) ?? [];
        const upWeight = evidenceItems.filter((item) => item.direction === "up").reduce((sum, item) => sum + item.weight, 0);
        const downWeight = evidenceItems.filter((item) => item.direction === "down").reduce((sum, item) => sum + item.weight, 0);
        const directionalWeight = upWeight + downWeight;
        const scoreRaw = directionalWeight > 0 ? upWeight / directionalWeight : null;
        // Shrink the evidence share toward the asset's own base rate. Without
        // this, two weak events agreeing yield 1.000 — certainty manufactured
        // out of almost nothing — which is exactly what the first eleven
        // forecasts did before losing to a coin flip.
        const scoreUp = scoreRaw !== null
          ? (upWeight + PRIOR_WEIGHT * baseUp) / (directionalWeight + PRIOR_WEIGHT)
          : null;
        const weightedBalance = scoreUp !== null ? 2 * scoreUp - 1 : null;
        const directionalEventIds = [...new Set(
          evidenceItems.filter((item) => item.direction === "up" || item.direction === "down").map((item) => item.eventId),
        )];
        // One event, even if multi-source, cannot create a directional forecast.
        // Two agreeing events turned out not to be enough either: three is the
        // floor from 2026-10-28 on, alongside the weight floor.
        const evidenceGate = directionalWeight >= MIN_DIRECTIONAL_WEIGHT &&
          directionalEventIds.length >= MIN_DIRECTIONAL_EVENTS;

        let direction = "none";
        if (base && evidenceGate && scoreUp !== null && scoreUp >= 0.60) direction = "up";
        if (base && evidenceGate && scoreUp !== null && scoreUp <= 0.40) direction = "down";

        const allEventIds = [...new Set(evidenceItems.map((item) => item.eventId))];
        forecasts.push({
          id: `fc_${AGGREGATION_VERSION}_${issueDate.replaceAll("-", "")}_${assetKey}_h${horizon}`,
          asset_key: assetKey,
          instrument_id: instrumentId,
          issued_at: issuedAtIso,
          issue_date: issueDate,
          horizon_trading_days: horizon,
          direction,
          score_up: scoreUp,
          weighted_balance: weightedBalance,
          evidence_count: allEventIds.length,
          base_observation_date: base?.date ?? null,
          base_price: base?.price ?? null,
          aggregation_version: AGGREGATION_VERSION,
          model: modelLabel,
          prompt_version: promptLabel,
          evidence: {
            window_hours: WINDOW_HOURS,
            window_start: windowStart,
            up_weight: upWeight,
            down_weight: downWeight,
            directional_weight: directionalWeight,
            directional_event_ids: directionalEventIds,
            evidence_gate_passed: evidenceGate,
            items: evidenceItems.map((item) => item.detail),
          },
          raw: {
            aggregation: {
              decay_half_life_hours: DECAY_HALF_LIFE_HOURS,
              min_impact_strength: MIN_IMPACT_STRENGTH,
              min_relevance: MIN_RELEVANCE,
              min_confidence: MIN_CONFIDENCE,
              required_prompt_version: REQUIRED_PROMPT_VERSION,
              min_directional_weight: MIN_DIRECTIONAL_WEIGHT,
              direction_thresholds: { up: 0.60, down: 0.40 },
              calibration: "empirical_bayes_v1",
              prior_weight: PRIOR_WEIGHT,
              min_directional_events: MIN_DIRECTIONAL_EVENTS,
              base_rate_up: Number(baseUp.toFixed(4)),
              score_raw: scoreRaw === null ? null : Number(scoreRaw.toFixed(4)),
              score_calibrated: scoreUp === null ? null : Number(scoreUp.toFixed(4)),
            },
            instrument: {
              provider: instrument.provider ?? null,
              symbol: instrument.provider_symbol ?? null,
              unit: instrument.unit ?? null,
            },
            score_semantics: "Base-rate-shrunk weighted share of directional evidence; a stated P(up), deliberately conservative, not a fitted market model.",
          },
        });
      }
    }

    const inserted = forecasts.length
      ? await restJson("market_forecasts_v2?on_conflict=id", {
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
        body: JSON.stringify(forecasts),
      }) as AnyRecord[]
      : [];

    if (inserted.length) {
      const outcomes = inserted.map((forecast) => ({
        forecast_id: String(forecast.id),
        status: "pending",
        raw: { created_by: AGGREGATION_VERSION, issued_at: issuedAtIso },
      }));
      await restJson("forecast_outcomes_v2?on_conflict=forecast_id", {
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
        body: JSON.stringify(outcomes),
      });
    }

    return Response.json({
      success: true,
      aggregation_version: AGGREGATION_VERSION,
      issued_at: issuedAtIso,
      issue_date: issueDate,
      classifications_considered: classifications.length,
      forecasts_considered: forecasts.length,
      forecasts_inserted: inserted.length,
      forecasts_already_issued: forecasts.length - inserted.length,
      forecasts: forecasts.map((forecast) => ({
        id: forecast.id,
        asset_key: forecast.asset_key,
        horizon_trading_days: forecast.horizon_trading_days,
        direction: forecast.direction,
        score_up: forecast.score_up,
        weighted_balance: forecast.weighted_balance,
        evidence_count: forecast.evidence_count,
        base_observation_date: forecast.base_observation_date,
        base_price: forecast.base_price,
        inserted: inserted.some((row) => row.id === forecast.id),
      })),
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
});
