// Periodic stale-Brent monitor. Authentication mirrors snapshot-morning.
const DATA_STALE_AFTER_MS = 15 * 60 * 1000;
const ALERT_DEDUPLICATION_MS = 15 * 60 * 1000;
const MESSAGE_TYPE = "brent_stale";

type AnyRecord = Record<string, unknown>;

function supabaseUrl(): string {
  const url = Deno.env.get("SUPABASE_URL")?.trim();
  if (!url) throw new Error("Missing required SUPABASE_URL secret");
  return url.replace(/\/$/, "");
}

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

// Same fail-closed authorization pattern as snapshot-morning:
// service-role bearer or the shared x-cron-secret header.
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

  const response = await fetch(`${supabaseUrl()}/rest/v1/${path}`, {
    ...init,
    headers,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase REST request failed with HTTP ${response.status}`);
  }
  return text ? JSON.parse(text) as unknown : null;
}

function json(body: AnyRecord, status = 200): Response {
  return Response.json(body, { status });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!isAuthorizedCron(req)) return json({ error: "Unauthorized" }, 401);

  try {
    const requestTimeMs = Date.now();
    const assets = await restJson(
      "cached_assets?select=id,updated_at&id=eq.brent&limit=1",
    ) as Array<{ id: string; updated_at: string | null }>;
    const brent = assets[0];

    if (!brent?.updated_at) {
      return json({ status: "no_data" });
    }

    const updatedAtMs = Date.parse(brent.updated_at);
    if (!Number.isFinite(updatedAtMs)) {
      return json({ error: "Invalid Brent updated_at timestamp" }, 500);
    }

    const ageMs = requestTimeMs - updatedAtMs;
    if (ageMs <= DATA_STALE_AFTER_MS) {
      return json({ status: "fresh" });
    }

    const duplicateSince = new Date(
      requestTimeMs - ALERT_DEDUPLICATION_MS,
    ).toISOString();
    const duplicateParams = new URLSearchParams({
      select: "id",
      message_type: `eq.${MESSAGE_TYPE}`,
      created_at: `gte.${duplicateSince}`,
      limit: "1",
    });
    const duplicates = await restJson(
      `alerts_log?${duplicateParams.toString()}`,
    ) as Array<{ id: string }>;

    // Explicit spam protection: suppress this alert type when any matching
    // alert was recorded within the previous 15 minutes.
    if (duplicates.length > 0) {
      return json({ status: "duplicate_suppressed" });
    }

    const telegramToken = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
    const telegramChatId = Deno.env.get("TELEGRAM_CHAT_ID") ?? "";
    if (!telegramToken || !telegramChatId) {
      return json({ error: "Telegram credentials are not configured" }, 500);
    }

    // Reserve the alert before sending so a retry sees it during deduplication.
    const reservation = await restJson("alerts_log?select=id", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        message_type: MESSAGE_TYPE,
        created_at: new Date(requestTimeMs).toISOString(),
        is_sent: false,
      }),
    }) as Array<{ id: string }>;
    const alertId = reservation[0]?.id;
    if (!alertId) throw new Error("Could not reserve alert log row");

    const message = `Brent data is stale: last update ${brent.updated_at}; age ${Math.floor(ageMs / 60000)} minutes.`;
    let sent = false;
    try {
      const response = await fetch(
        `https://api.telegram.org/bot${telegramToken}/sendMessage`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chat_id: telegramChatId,
            text: message,
            disable_web_page_preview: true,
          }),
          signal: AbortSignal.timeout(10_000),
        },
      );
      const body = await response.json().catch(() => null);
      sent = response.ok && body?.ok === true;
    } catch {
      // Do not log the request URL; it contains the bot token.
      sent = false;
    }

    await restJson(`alerts_log?id=eq.${encodeURIComponent(alertId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ is_sent: sent }),
    });

    if (!sent) return json({ error: "Telegram alert delivery failed" }, 502);
    return json({ status: "alert_sent" });
  } catch (error) {
    if (error instanceof Error && error.message === "Missing required SUPABASE_URL secret") {
      return json({ error: error.message }, 500);
    }
    // Avoid returning Supabase errors, request details, or secret values.
    return json({ error: "Scheduled job failed" }, 500);
  }
});
