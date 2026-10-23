// Market Pulse Stage 2: strict-schema Groq classification for top shadow events.
//
// Shadow only. Reads news_events_shadow/news_articles_shadow and writes
// news_event_classifications_shadow. It never feeds cached_* or forecasts.

const SUPABASE_URL = "https://hekzplfftannlzwvgwwm.supabase.co";
const Groq_URL = "https://api.Groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-oss-20b";
const PROMPT_VERSION = "event_classification_v3";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const COOLDOWN_MINUTES = 10;
const MIN_IMPACT_STRENGTH = 0.35;
const Groq_MIN_INTERVAL_MS = 7000;
const Groq_MAX_RETRIES = 2;

const ASSET_KEYS = ["sp500", "btc", "Brent", "gold", "eurusd"] as const;
const DIRECTIONS = ["up", "down", "neutral", "uncertain"] as const;
const HORIZONS = ["intraday", "1_3_days", "1_2_weeks", "longer", "unknown"] as const;
const CHANNELS = [
  "monetary_policy",
  "inflation",
  "growth",
  "labor",
  "energy_supply",
  "energy_demand",
  "geopolitics",
  "trade_tariffs",
  "fiscal",
  "credit_liquidity",
  "corporate_earnings",
  "crypto_specific",
  "fx",
  "commodities",
  "regulation",
  "other",
  "none",
] as const;

type Classification = {
  market_relevant: boolean;
  relevance: number;
  confidence: number;
  importance: number;
  sentiment: number;
  transmission_channel: string;
  entities: string[];
  impacts: Array<{
    asset: string;
    direction: string;
    strength: number;
    horizon: string;
    rationale_ru: string;
  }>;
  summary_ru: string;
  rationale_ru: string;
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

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase REST ${response.status}: ${text.slice(0, 900)}`);
  }
  return text ? JSON.parse(text) as unknown : null;
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryAfterMs(errorText: string): number {
  const match = errorText.match(/try again in\s+([0-9]+(?:\.[0-9]+)?)\s*(ms|s|m)\b/i);
  if (!match) return 8000;
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const ms = unit === "ms" ? value : unit === "m" ? value * 60000 : value * 1000;
  return Math.min(20000, Math.max(3000, Math.ceil(ms) + 750));
}

// Deterministic post-model discipline. The 2026-10-22 manual audit found
// generic "risk-on/risk-off" spillovers (for example a local UK gas project
// mapped to EURUSD/S&P 500). Persisted impacts are forecast evidence, so keep
// only directional, asset-specific channels. The unfiltered model output is
// still preserved in raw_response for audit.
function applyChannelDiscipline(
  channel: string,
  importance: number,
  impacts: Classification["impacts"],
): Classification["impacts"] {
  const directional = impacts
    .filter((impact) => impact.direction === "up" || impact.direction === "down")
    .sort((a, b) => b.strength - a.strength);

  let allowed: Set<string> | null = null;
  let maxImpacts = 3;

  switch (channel) {
    case "energy_supply":
    case "energy_demand":
      allowed = importance >= 8
        ? new Set(["Brent", "gold", "sp500", "eurusd"])
        : importance >= 7
          ? new Set(["Brent", "gold", "sp500"])
          : new Set(["Brent"]);
      break;
    case "corporate_earnings":
      allowed = new Set(["sp500"]);
      maxImpacts = 1;
      break;
    case "crypto_specific":
      allowed = new Set(["btc", "sp500"]);
      maxImpacts = 2;
      break;
    case "commodities":
      allowed = importance >= 7
        ? new Set(["Brent", "gold", "sp500", "eurusd"])
        : new Set(["Brent", "gold"]);
      break;
    case "regulation":
    case "other":
      maxImpacts = 2;
      break;
    case "none":
      return [];
    default:
      break;
  }

  return directional
    .filter((impact) => !allowed || allowed.has(impact.asset))
    .slice(0, maxImpacts);
}

function validateClassification(value: unknown): Classification {
  if (!isRecord(value)) throw new Error("Model output is not an object");

  const marketRelevant = value.market_relevant;
  const relevance = Number(value.relevance);
  const confidence = Number(value.confidence);
  const importance = Number(value.importance);
  const sentiment = Number(value.sentiment);
  const channel = String(value.transmission_channel ?? "");

  if (typeof marketRelevant !== "boolean") throw new Error("Invalid market_relevant");
  if (!Number.isFinite(relevance) || relevance < 0 || relevance > 1) throw new Error("Invalid relevance");
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error("Invalid confidence");
  if (!Number.isInteger(importance) || importance < 1 || importance > 10) throw new Error("Invalid importance");
  if (!Number.isFinite(sentiment) || sentiment < -1 || sentiment > 1) throw new Error("Invalid sentiment");
  if (!CHANNELS.includes(channel as typeof CHANNELS[number])) throw new Error("Invalid transmission_channel");
  if (!Array.isArray(value.entities) || !Array.isArray(value.impacts)) throw new Error("Invalid entities/impacts");

  const entities = [...new Set(value.entities.map((item) => String(item).trim()).filter(Boolean))].slice(0, 8);
  const impacts: Classification["impacts"] = [];
  const seenAssets = new Set<string>();

  for (const rawImpact of value.impacts.slice(0, 5)) {
    if (!isRecord(rawImpact)) throw new Error("Invalid impact object");
    const asset = String(rawImpact.asset ?? "");
    const direction = String(rawImpact.direction ?? "");
    const horizon = String(rawImpact.horizon ?? "");
    const strength = Number(rawImpact.strength);
    if (!ASSET_KEYS.includes(asset as typeof ASSET_KEYS[number])) throw new Error(`Invalid impact asset: ${asset}`);
    if (!DIRECTIONS.includes(direction as typeof DIRECTIONS[number])) throw new Error(`Invalid impact direction: ${direction}`);
    if (!HORIZONS.includes(horizon as typeof HORIZONS[number])) throw new Error(`Invalid impact horizon: ${horizon}`);
    if (!Number.isFinite(strength) || strength < 0 || strength > 1) throw new Error("Invalid impact strength");
    // Negligible or unexplained padded impacts are not evidence for later aggregation.
    if (strength < MIN_IMPACT_STRENGTH) continue;
    const rationaleRu = String(rawImpact.rationale_ru ?? "").trim().slice(0, 500);
    if ((direction === "up" || direction === "down") && rationaleRu.length < 12) continue;
    if (seenAssets.has(asset)) continue;
    seenAssets.add(asset);
    impacts.push({
      asset,
      direction,
      strength,
      horizon,
      rationale_ru: rationaleRu,
    });
  }

  const summaryRu = String(value.summary_ru ?? "").trim().slice(0, 700);
  const rationaleRu = String(value.rationale_ru ?? "").trim().slice(0, 900);
  if (!summaryRu || !rationaleRu) throw new Error("Missing Russian summary/rationale");

  if (!marketRelevant && impacts.length) {
    throw new Error("Non-relevant event must not contain asset impacts");
  }

  // Below the relevance threshold the row will be stored as rejected. Keep
  // the model's diagnostic text in raw_response, but do not persist usable
  // impacts that a later aggregation could accidentally read.
  const effectiveImpacts = relevance >= 0.35
    ? applyChannelDiscipline(channel, importance, impacts)
    : [];

  return {
    market_relevant: marketRelevant,
    relevance,
    confidence,
    importance,
    sentiment,
    transmission_channel: channel,
    entities,
    impacts: effectiveImpacts,
    summary_ru: summaryRu,
    rationale_ru: rationaleRu,
  };
}

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "market_relevant",
    "relevance",
    "confidence",
    "importance",
    "sentiment",
    "transmission_channel",
    "entities",
    "impacts",
    "summary_ru",
    "rationale_ru",
  ],
  properties: {
    market_relevant: { type: "boolean" },
    relevance: { type: "number", minimum: 0, maximum: 1 },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    importance: { type: "integer", minimum: 1, maximum: 10 },
    sentiment: { type: "number", minimum: -1, maximum: 1 },
    transmission_channel: { type: "string", enum: [...CHANNELS] },
    entities: {
      type: "array",
      maxItems: 8,
      items: { type: "string" },
    },
    impacts: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["asset", "direction", "strength", "horizon", "rationale_ru"],
        properties: {
          asset: { type: "string", enum: [...ASSET_KEYS] },
          direction: { type: "string", enum: [...DIRECTIONS] },
          strength: { type: "number", minimum: 0, maximum: 1 },
          horizon: { type: "string", enum: [...HORIZONS] },
          rationale_ru: { type: "string" },
        },
      },
    },
    summary_ru: { type: "string" },
    rationale_ru: { type: "string" },
  },
};

async function classifyWithGroq(event: Record<string, unknown>, articles: Record<string, unknown>[]) {
  const groqKey = Deno.env.get("GROQ_API_KEY");
  if (!groqKey) throw new Error("Missing GROQ_API_KEY secret");
  const model = Deno.env.get("GROQ_MODEL") ?? DEFAULT_MODEL;

  const evidence = articles.slice(0, 5).map((article, index) => ({
    n: index + 1,
    source: String(article.source_name ?? ""),
    published_at: String(article.published_at ?? ""),
    title: String(article.title ?? ""),
    description: String(article.description ?? "").slice(0, 700),
  }));

  const system = [
    "Ты — строгий аналитический классификатор рыночных событий для Market Pulse.",
    "Используй только переданные заголовки и описания. Не добавляй внешние факты и не выдумывай детали.",
    "Несколько статей могут описывать одно событие: не умножай важность только из-за числа публикаций.",
    "Оценивай влияние только на активы sp500, btc, Brent, gold и eurusd.",
    "В impacts включай максимум три актива с правдоподобным и материальным каналом влияния. Не заполняй все пять активов ради полноты; активы без ясного канала просто опускай.",
    "Общий risk-on/risk-off перелив не является достаточным основанием для направленного impact. Для каждого актива в rationale_ru назови конкретный механизм: предложение/спрос, доходности и доллар, прибыль компаний, потоки в защитные активы или иной прямой канал.",
    "Локальный проект, одна компания или региональная новость обычно дают только один прямо затронутый актив. Не выводи из них EURUSD или BTC без явного глобального механизма в тексте.",
    "strength означает силу правдоподобного влияния, а не уверенность: 0.35 — слабое, 0.5 — заметное, 0.75 и выше — сильное. Не ставь одинаковую силу всем активам без причины.",
    "sentiment — общий рыночный риск-тон: +1 максимально risk-on, -1 максимально risk-off; конкретные направления укажи в impacts.",
    "importance оценивай по масштабу, неожиданности и широте последствий, а не по громкости заголовка.",
    "Если данных мало или влияние спорно, снижай confidence и используй direction=uncertain.",
    "Если событие не имеет правдоподобного рыночного канала, market_relevant=false, relevance ниже 0.35, transmission_channel=none и impacts=[].",
    "summary_ru и rationale_ru пиши кратко и грамотно по-русски, без транслитерации и выдуманных слов. Не давай инвестиционных рекомендаций.",
    "Верни только JSON по заданной схеме.",
  ].join(" ");

  const user = JSON.stringify({
    event_title: String(event.title ?? ""),
    first_published_at: event.first_published_at ?? null,
    latest_published_at: event.latest_published_at ?? null,
    article_count: event.article_count ?? null,
    source_count: event.source_count ?? null,
    sources: event.sources ?? [],
    evidence,
  });

  const requestBody = JSON.stringify({
    model,
    temperature: 0.1,
    max_completion_tokens: 1000,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "market_event_classification",
        strict: true,
        schema: RESPONSE_SCHEMA,
      },
    },
  });

  let payload: Record<string, unknown> | null = null;
  for (let attempt = 0; attempt <= Groq_MAX_RETRIES; attempt += 1) {
    const response = await fetch(GROQ_URL, {
      method: "POST",
      signal: AbortSignal.timeout(45000),
      headers: {
        Authorization: `Bearer ${groqKey}`,
        "Content-Type": "application/json",
      },
      body: requestBody,
    });
    const text = await response.text();

    if (response.ok) {
      payload = JSON.parse(text) as Record<string, unknown>;
      break;
    }

    const isDailyQuota = text.includes("tokens per day") || text.includes("(TPD)");
    if (response.status === 429 && !isDailyQuota && attempt < Groq_MAX_RETRIES) {
      await sleep(retryAfterMs(text));
      continue;
    }

    throw new Error(`Groq HTTP ${response.status}: ${text.slice(0, 900)}`);
  }

  if (!payload) throw new Error("Groq returned no payload after retries");
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const first = isRecord(choices[0]) ? choices[0] : null;
  const message = first && isRecord(first.message) ? first.message : null;
  const content = typeof message?.content === "string" ? message.content : "";
  if (!content) throw new Error("Groq returned empty content");

  return {
    model,
    classification: validateClassification(JSON.parse(content)),
    raw: {
      id: payload.id ?? null,
      model: payload.model ?? model,
      usage: payload.usage ?? null,
      finish_reason: first?.finish_reason ?? null,
      content,
    },
  };
}

Deno.serve(async (request) => {
  if (!isAuthorizedService(request)) return Response.json({ success: false, error: "unauthorized" }, { status: 401 });
  try {
    const url = new URL(request.url);
    const limit = Math.round(clampNumber(Number(url.searchParams.get("limit") ?? 6), 1, 12));

    const latest = await restJson(
      "news_event_classifications_shadow?select=event_id,updated_at,status&order=updated_at.desc&limit=1",
    ) as Array<{ event_id: string; updated_at: string; status: string }>;
    if (latest[0]?.updated_at) {
      const ageMs = Date.now() - new Date(latest[0].updated_at).getTime();
      if (ageMs < COOLDOWN_MINUTES * 60000) {
        return Response.json({
          success: true,
          skipped: true,
          reason: "classification_cooldown",
          last_updated_at: latest[0].updated_at,
          cooldown_minutes: COOLDOWN_MINUTES,
        });
      }
    }

    const [events, existing] = await Promise.all([
      restJson(
        "news_events_shadow?select=id,title,first_published_at,latest_published_at,article_count,source_count,sources,rank_score,status,updated_at" +
        "&status=eq.candidate&order=source_count.desc,rank_score.desc,latest_published_at.desc&limit=100",
      ) as Promise<Record<string, unknown>[]>,
      restJson(
        "news_event_classifications_shadow?select=event_id,status,updated_at&order=updated_at.desc&limit=1000",
      ) as Promise<Array<{ event_id: string; status: string; updated_at: string }>>,
    ]);

    const existingByEvent = new Map(existing.map((row) => [String(row.event_id), row] as const));
    const candidates = events.filter((event) => {
      const prior = existingByEvent.get(String(event.id));
      if (!prior) return true;
      if (prior.status === "quarantine") {
        return Date.now() - new Date(prior.updated_at).getTime() > 3600000;
      }
      return false;
    }).slice(0, limit);

    const results: Record<string, unknown>[] = [];
    let rateLimited = false;

    for (const [eventIndex, event] of candidates.entries()) {
      // The free Groq tiers used here have low per-minute token budgets.
      // A deterministic pause is cheaper than burning events into quarantine.
      if (eventIndex > 0) await sleep(Groq_MIN_INTERVAL_MS);
      const now = new Date().toISOString();
      try {
        const links = await restJson(
          `news_event_articles_shadow?select=article_id,is_representative,similarity&event_id=eq.${encodeURIComponent(String(event.id))}&order=is_representative.desc&limit=20`,
        ) as Array<{ article_id: string; is_representative: boolean }>;

        const articleIds = links.map((link) => String(link.article_id)).filter(Boolean);
        if (!articleIds.length) throw new Error("Event has no linked articles");

        const inList = articleIds.map((id) => encodeURIComponent(id)).join(",");
        const articles = await restJson(
          `news_articles_shadow?select=id,source_name,title,description,url,published_at&id=in.(${inList})&order=published_at.desc&limit=20`,
        ) as Record<string, unknown>[];

        const representativeIds = new Set(
          links.filter((link) => link.is_representative).map((link) => String(link.article_id)),
        );
        articles.sort((a, b) => Number(representativeIds.has(String(b.id))) - Number(representativeIds.has(String(a.id))));

        const { model, classification, raw } = await classifyWithGroq(event, articles);
        const status = classification.market_relevant && classification.relevance >= 0.35
          ? "classified"
          : "rejected";

        await restJson("news_event_classifications_shadow?on_conflict=event_id", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify({
            event_id: String(event.id),
            status,
            market_relevant: classification.market_relevant,
            relevance: classification.relevance,
            confidence: classification.confidence,
            importance: classification.importance,
            sentiment: classification.sentiment,
            transmission_channel: classification.transmission_channel,
            entities: classification.entities,
            impacts: classification.impacts,
            summary_ru: classification.summary_ru,
            rationale_ru: classification.rationale_ru,
            model,
            prompt_version: PROMPT_VERSION,
            raw_response: raw,
            error: null,
            classified_at: now,
            updated_at: now,
          }),
        });

        results.push({
          event_id: String(event.id),
          title: event.title,
          status,
          relevance: classification.relevance,
          confidence: classification.confidence,
          importance: classification.importance,
          sentiment: classification.sentiment,
          transmission_channel: classification.transmission_channel,
          impacts: classification.impacts,
          summary_ru: classification.summary_ru,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await restJson("news_event_classifications_shadow?on_conflict=event_id", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify({
            event_id: String(event.id),
            status: "quarantine",
            model: Deno.env.get("GROQ_MODEL") ?? DEFAULT_MODEL,
            prompt_version: PROMPT_VERSION,
            raw_response: {},
            error: message.slice(0, 1200),
            classified_at: now,
            updated_at: now,
          }),
        });
        results.push({
          event_id: String(event.id),
          title: event.title,
          status: "quarantine",
          error: message.slice(0, 500),
        });

        // A provider quota error is transient and global. Mark only the
        // current event, then stop instead of quarantining the whole queue.
        if (message.includes("Groq HTTP 429")) {
          rateLimited = true;
          break;
        }
      }
    }

    return Response.json({
      success: true,
      prompt_version: PROMPT_VERSION,
      events_considered: events.length,
      events_selected: candidates.length,
      classified: results.filter((row) => row.status === "classified").length,
      rejected: results.filter((row) => row.status === "rejected").length,
      quarantined: results.filter((row) => row.status === "quarantine").length,
      rate_limited: rateLimited,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ success: false, error: message }, { status: 500 });
  }
});
