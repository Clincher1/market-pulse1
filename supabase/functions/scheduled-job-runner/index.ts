// Hourly market monitor and once-daily Telegram digest.
import {
  evaluateAsset,
  moscowDateKey,
  moscowHourKey,
  overallVerdict,
  percentChange,
  shouldWarnForStagnation,
} from "./logic.mjs";

const ASSET_IDS = ["brent", "sp500", "gold"] as const;
const ALERT_DEDUPLICATION_MS = 15 * 60 * 1000;
const MESSAGE_TYPE: Record<(typeof ASSET_IDS)[number], string> = {
  brent: "brent_stale",
  sp500: "sp500_stale",
  gold: "gold_stale",
};

type AnyRecord = Record<string, unknown>;
type AssetId = (typeof ASSET_IDS)[number];
type Verdict = ReturnType<typeof evaluateAsset>;
type CachedAsset = {
  id: string;
  price: string | number | null;
  updated_at: string | null;
  as_of: string | null;
};

class HttpError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

function supabaseUrl(): string {
  const url = Deno.env.get("SUPABASE_URL")?.trim();
  if (!url) throw new HttpError("Missing required SUPABASE_URL secret", 500);
  return url.replace(/\/$/, "");
}

function serviceKey(): string {
  const key = Deno.env.get("SERVICE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) throw new HttpError("Missing service key", 500);
  return key;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < b.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Keep the deployed authorization paths unchanged: service-role bearer or the
// shared x-cron-secret header compared with the Edge Function CRON_SECRET.
function isAuthorizedCron(req: Request): boolean {
  const auth = req.headers.get("Authorization") ?? "";
  const keys = [
    Deno.env.get("SERVICE_KEY") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  ].filter(Boolean);
  if (keys.some((key) => auth === `Bearer ${key}`)) return true;
  return timingSafeEqual(
    req.headers.get("x-cron-secret") ?? "",
    Deno.env.get("CRON_SECRET") ?? "",
  );
}

async function restJson(path: string, init: RequestInit = {}): Promise<unknown> {
  const key = serviceKey();
  const headers = new Headers(init.headers);
  headers.set("apikey", key);
  headers.set("Authorization", `Bearer ${key}`);
  headers.set("Accept", "application/json");
  if (init.body) headers.set("Content-Type", "application/json");

  let response: Response;
  try {
    response = await fetch(`${supabaseUrl()}/rest/v1/${path}`, {
      ...init,
      headers,
      signal: init.signal ?? AbortSignal.timeout(15_000),
    });
  } catch {
    throw new HttpError("Supabase REST request failed", 500);
  }
  const text = await response.text();
  if (!response.ok) throw new HttpError(`Supabase REST request failed (${response.status})`, 500);
  try {
    return text ? JSON.parse(text) as unknown : null;
  } catch {
    throw new HttpError("Supabase REST returned invalid JSON", 500);
  }
}

function json(body: AnyRecord, status = 200): Response {
  return Response.json(body, { status });
}

function digestHourMsk(): number {
  const configured = Deno.env.get("DIGEST_HOUR_MSK")?.trim();
  if (!configured) return 9;
  if (!/^\d{1,2}$/.test(configured)) throw new HttpError("Invalid DIGEST_HOUR_MSK", 500);
  const hour = Number(configured);
  if (hour < 0 || hour > 23) throw new HttpError("Invalid DIGEST_HOUR_MSK", 500);
  return hour;
}

function formattedPrice(row: CachedAsset | undefined): string {
  if (!row || row.price == null || String(row.price).trim() === "") return "нет данных";
  return String(row.price).trim();
}

function formattedDate(value: string | null | undefined): string {
  const date = value?.slice(0, 10);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return "дата не указана";
  return `${date.slice(8, 10)}.${date.slice(5, 7)}`;
}

function formattedChange(change: number | null): string | null {
  if (change === null || !Number.isFinite(change)) return null;
  const sign = change < 0 ? "−" : "+";
  return `${sign}${Math.abs(change).toFixed(1)}% за 24ч`;
}

function freshnessText(verdicts: Record<AssetId, Verdict>): string {
  const labels: Record<AssetId, string> = { brent: "Brent", sp500: "S&P 500", gold: "золото" };
  const bad = ASSET_IDS.filter((id) => verdicts[id].status !== "ok");
  if (bad.length === 0) return "Данные: все свежие.";
  return `Данные: ${bad.map((id) => `${labels[id]} — ${verdicts[id].status === "stale" ? "устарели" : "нет данных"}`).join("; ")}.`;
}

function alertMessage(assetId: AssetId, verdict: Verdict): string {
  const name: Record<AssetId, string> = { brent: "Brent", sp500: "S&P 500", gold: "Золото" };
  if (verdict.status === "no_data") return `⚠️ ${name[assetId]}: нет пригодных данных в кэше.`;
  if (assetId === "sp500") {
    return `⚠️ S&P 500: последнее закрытие ${formattedDate(verdict.asOf)}; ожидалось ${formattedDate(verdict.expectedSessionDate)}.`;
  }
  return `⚠️ ${name[assetId]}: кэш не обновлялся ${verdict.ageMinutes ?? "?"} мин.; порог 120 мин.`;
}

async function sendTelegram(text: string): Promise<void> {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
  const chatId = Deno.env.get("TELEGRAM_CHAT_ID") ?? "";
  if (!token || !chatId) throw new HttpError("Telegram credentials are not configured", 500);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
        signal: AbortSignal.timeout(10_000),
      });
      const body = await response.json().catch(() => null);
      if (response.ok && body?.ok === true) return;
    } catch {
      // Do not log the request URL: it contains the bot token.
    }
    if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new HttpError("Telegram delivery failed after one retry", 502);
}

async function sendTargetedAlert(assetId: AssetId, verdict: Verdict, nowMs: number): Promise<void> {
  const duplicateSince = new Date(nowMs - ALERT_DEDUPLICATION_MS).toISOString();
  const duplicateParams = new URLSearchParams({
    select: "id",
    message_type: `eq.${MESSAGE_TYPE[assetId]}`,
    is_sent: "eq.true",
    created_at: `gte.${duplicateSince}`,
    limit: "1",
  });
  const duplicates = await restJson(`alerts_log?${duplicateParams.toString()}`) as Array<{ id: string }>;
  if (duplicates.length > 0) return;

  const reservation = await restJson("alerts_log?select=id", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      message_type: MESSAGE_TYPE[assetId],
      created_at: new Date(nowMs).toISOString(),
      is_sent: false,
    }),
  }) as Array<{ id: string }>;
  const alertId = reservation[0]?.id;
  if (!alertId) throw new HttpError("Could not reserve market alert", 500);

  let sent = false;
  try {
    await sendTelegram(alertMessage(assetId, verdict));
    sent = true;
  } finally {
    await restJson(`alerts_log?id=eq.${encodeURIComponent(alertId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ is_sent: sent }),
    });
  }
}

function previousDigestQuery(today: string): string {
  const yesterday = new Date(`${today}T12:00:00.000Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const params = new URLSearchParams({
    select: "digest_date,payload",
    digest_date: `eq.${yesterday.toISOString().slice(0, 10)}`,
    delivery_status: "eq.sent",
    limit: "1",
  });
  return `monitor_history?${params.toString()}`;
}

function digestText(
  today: string,
  rows: Record<AssetId, CachedAsset | undefined>,
  verdicts: Record<AssetId, Verdict>,
  previousPayload: AnyRecord | null,
  runCounts: { succeeded: number; failed: number },
): { text: string; changes: Record<AssetId, number | null>; warnings: string[] } {
  const previousAssets = previousPayload?.assets as Record<string, { price?: number }> | undefined;
  const hasYesterday = previousPayload !== null;
  const changes = Object.fromEntries(ASSET_IDS.map((id) => [
    id,
    previousAssets?.[id]?.price == null
      ? null
      : percentChange(verdicts[id].price ?? Number.NaN, previousAssets[id].price),
  ])) as Record<AssetId, number | null>;
  const lines = [
    `📊 Market Pulse — ${formattedDate(today)}`,
    `• Brent: ${formattedPrice(rows.brent)}${formattedChange(changes.brent) ? ` (${formattedChange(changes.brent)})` : ""}`,
    `• S&P 500: ${formattedPrice(rows.sp500)}${formattedChange(changes.sp500) ? ` (${formattedChange(changes.sp500)})` : ""} (закрытие ${formattedDate(verdicts.sp500.asOf)})`,
    `• Золото: ${formattedPrice(rows.gold)}${formattedChange(changes.gold) ? ` (${formattedChange(changes.gold)})` : ""}`,
    freshnessText(verdicts),
    `Монитор: ${runCounts.succeeded} ок, ${runCounts.failed} сбоев за 24ч.`,
  ];
  if (!hasYesterday) lines.push("первый отчёт — сравнение за 24ч появится завтра");

  const warnings: string[] = [];
  if (shouldWarnForStagnation(today, changes.brent, changes.gold)) {
    const warning = "⚠️ Движения нет — проверьте источник данных";
    lines.push(warning);
    warnings.push("stagnation: Brent and gold moved less than 0.01% over 24h");
  }
  return { text: lines.join("\n"), changes, warnings };
}

async function runDailyDigest(
  now: Date,
  today: string,
  rows: Record<AssetId, CachedAsset | undefined>,
  verdicts: Record<AssetId, Verdict>,
): Promise<void> {
  const todayParams = new URLSearchParams({
    select: "id,delivery_status",
    digest_date: `eq.${today}`,
    limit: "1",
  });
  const existing = await restJson(`monitor_history?${todayParams.toString()}`) as Array<{ id: number; delivery_status: string }>;
  if (existing[0]?.delivery_status === "sent") return;

  const previousRows = await restJson(previousDigestQuery(today)) as Array<{ payload?: AnyRecord }>;
  const previousPayload = previousRows[0]?.payload ?? null;
  const counts = await restJson("rpc/monitor_cron_counts", {
    method: "POST",
    body: JSON.stringify({ p_since: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString() }),
  }) as Array<{ succeeded?: number; failed?: number }>;
  const runCounts = {
    succeeded: Number(counts[0]?.succeeded ?? 0),
    failed: Number(counts[0]?.failed ?? 0),
  };
  const digest = digestText(today, rows, verdicts, previousPayload, runCounts);
  const payload = {
    digest_date: today,
    assets: Object.fromEntries(ASSET_IDS.map((id) => [id, {
      price: verdicts[id].price,
      display_price: rows[id]?.price ?? null,
      as_of: verdicts[id].asOf,
      updated_at: verdicts[id].updatedAt,
      freshness: verdicts[id].status,
      reason: verdicts[id].reason,
      change_24h_pct: digest.changes[id],
    }])),
    overall_status: overallVerdict(verdicts),
    freshness: Object.fromEntries(ASSET_IDS.map((id) => [id, verdicts[id].status])),
    monitor_runs_24h: runCounts,
    warnings: digest.warnings,
  };

  // Reserve the unique daily row before delivery, so retries update the same
  // row rather than creating duplicate history. Telegram and Postgres cannot
  // share a transaction; every failed delivery is still a non-2xx response.
  let historyId = existing[0]?.id;
  if (historyId) {
    await restJson(`monitor_history?id=eq.${historyId}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ delivery_status: "pending", payload }),
    });
  } else {
    const reserved = await restJson("monitor_history?select=id", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ digest_date: today, delivery_status: "pending", payload }),
    }) as Array<{ id: number }>;
    historyId = reserved[0]?.id;
  }
  if (!historyId) throw new HttpError("Could not reserve daily digest history row", 500);

  try {
    await sendTelegram(digest.text);
  } catch (error) {
    await restJson(`monitor_history?id=eq.${historyId}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ delivery_status: "failed" }),
    });
    throw error;
  }
  await restJson(`monitor_history?id=eq.${historyId}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ delivery_status: "sent", payload }),
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!isAuthorizedCron(req)) return json({ error: "Unauthorized" }, 401);

  try {
    const now = new Date();
    const nowMs = now.getTime();
    const configuredDigestHourMsk = digestHourMsk();
    const assets = await restJson(
      "cached_assets?select=id,price,updated_at,as_of&id=in.(brent,sp500,gold)",
    ) as CachedAsset[];
    const rows = Object.fromEntries(ASSET_IDS.map((id) => [id, assets.find((asset) => asset.id === id)])) as Record<AssetId, CachedAsset | undefined>;

    let verdicts: Record<AssetId, Verdict>;
    try {
      verdicts = Object.fromEntries(ASSET_IDS.map((id) => [id, evaluateAsset(id, rows[id], now)])) as Record<AssetId, Verdict>;
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Asset timestamp validation failed";
      throw new HttpError(detail, 503);
    }

    // A missing Brent row/update timestamp is a monitor failure, not a successful no_data response.
    if (verdicts.brent.status === "no_data") {
      try {
        await sendTargetedAlert("brent", verdicts.brent, nowMs);
      } catch {
        // Preserve the explicit 503 required for the missing Brent input.
      }
      throw new HttpError("Brent row, price, or updated_at is missing", 503);
    }

    for (const assetId of ASSET_IDS) {
      if (verdicts[assetId].status !== "ok") await sendTargetedAlert(assetId, verdicts[assetId], nowMs);
    }

    // Retry the daily digest on each later hourly invocation until today's row is marked sent.
    if (Number(moscowHourKey(now)) >= configuredDigestHourMsk) {
      const today = moscowDateKey(now);
      await runDailyDigest(now, today, rows, verdicts);
      return json({ status: "digest_sent", overall_status: overallVerdict(verdicts) });
    }

    if (overallVerdict(verdicts) === "ok") return json({ status: "fresh" });
    return json({ status: overallVerdict(verdicts), assets: verdicts }, 503);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    if (status >= 500) console.error("Scheduled job failed; details withheld.");
    const message = error instanceof HttpError && status === 503
      ? error.message
      : "Scheduled job failed";
    return json({ error: message }, status);
  }
});
