// Guarded dispatcher for the V2 shadow "market memory" pipeline.
//
// pg_cron calls ONLY this endpoint with x-cron-secret (from Vault). The
// dispatcher then invokes exactly one allowlisted shadow step server-to-server
// with the service-role key. Shadow writers additionally verify that key in
// code, because gateway JWT verification alone accepts public publishable keys.
//
// One step per invocation is deliberate: ingest/cluster/classify can be slow,
// and separate cron calls keep each request inside Edge Function time limits.
// Classification stays double-gated: callers must send confirm_classify=true
// (only after the v3 prompt/manual-audit gate has been deployed and checked).

type StepName =
  | "health"
  | "ingest"
  | "cluster"
  | "classify"
  | "prices"
  | "evaluate_events"
  | "forecasts"
  | "evaluate_forecasts";

const STEP_PATHS: Record<Exclude<StepName, "health">, string> = {
  ingest: "/functions/v1/ingest-news-v2-shadow",
  cluster: "/functions/v1/cluster-news-v2-shadow?hours=36&limit=700",
  classify: "/functions/v1/classify-events-v2-shadow?limit=2",
  prices: "/functions/v1/update-prices-v2-shadow?lookback_days=60&max_rows=20",
  evaluate_events: "/functions/v1/evaluate-event-impacts-v2-shadow?limit=100",
  forecasts: "/functions/v1/write-forecasts-v2-shadow",
  evaluate_forecasts: "/functions/v1/evaluate-forecasts-v2-shadow?limit=200",
};

function timingSafeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < b.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function serviceRoleKey(): string {
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_KEY") ?? "";
}

function isAuthorized(req: Request): boolean {
  const serviceRole = serviceRoleKey();
  const auth = req.headers.get("Authorization") ?? "";
  if (serviceRole && auth === `Bearer ${serviceRole}`) return true;
  return timingSafeEqual(
    req.headers.get("x-cron-secret") ?? "",
    Deno.env.get("CRON_SECRET") ?? "",
  );
}

function supabaseBaseUrl(): string {
  return (Deno.env.get("SUPABASE_URL") ?? "https://hekzplfftannlzwvgwwm.supabase.co").replace(/\/$/, "");
}

Deno.serve(async (req: Request) => {
  if (!isAuthorized(req)) {
    return Response.json({ success: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  let body: Record<string, unknown> = {};
  try {
    body = await req.clone().json() as Record<string, unknown>;
  } catch {
    body = {};
  }

  const step = String(body.step ?? url.searchParams.get("step") ?? "health") as StepName;
  if (step === "health") {
    return Response.json({
      success: true,
      dispatcher: "run-shadow-pipeline",
      steps: Object.keys({ health: true, ...STEP_PATHS }),
      classify_gate: "confirm_classify=true required",
    });
  }

  const path = STEP_PATHS[step as Exclude<StepName, "health">];
  if (!path) {
    return Response.json({ success: false, error: "unknown_step", step }, { status: 400 });
  }

  if (step === "classify" && body.confirm_classify !== true && url.searchParams.get("confirm_classify") !== "true") {
    return Response.json(
      { success: false, error: "classify_gate_closed", detail: "Send confirm_classify=true only after classifier v3 deployment and audit." },
      { status: 403 },
    );
  }

  const serviceRole = serviceRoleKey();
  if (!serviceRole) {
    return Response.json({ success: false, error: "missing_service_role_key" }, { status: 500 });
  }

  try {
    const upstream = await fetch(`${supabaseBaseUrl()}${path}`, {
      method: "POST",
      signal: AbortSignal.timeout(140000),
      headers: {
        "Content-Type": "application/json",
        apikey: serviceRole,
        Authorization: `Bearer ${serviceRole}`,
      },
      body: "{}",
    });
    const text = await upstream.text();
    return new Response(text.slice(0, 6000), {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") || "application/json",
        "X-Shadow-Step": step,
      },
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        step,
        error: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
      },
      { status: 502 },
    );
  }
});
