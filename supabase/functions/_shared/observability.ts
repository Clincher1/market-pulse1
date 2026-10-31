// Error reporting for edge functions, without a dependency and without touching
// the visitor.
//
// The site promises to collect nothing about the people who read it, so the
// browser SDK is never used: it would load a foreign script and break the
// project's own "no foreign domains" check. This only reports what happens
// inside our functions, to us.
//
// Nothing is sent unless SENTRY_DSN is set, so the code below can ship and stay
// dormant. A failure here must never fail the function that called it.

const SENTRY_ENVIRONMENT = "production";

type Extra = Record<string, unknown>;

function readDsn(): { endpoint: string } | null {
  const dsn = Deno.env.get("SENTRY_DSN");
  if (!dsn) return null;
  try {
    const url = new URL(dsn);
    const key = url.username;
    const projectId = url.pathname.replace(/^\/+/, "");
    if (!key || !projectId) return null;
    url.username = "";
    url.password = "";
    url.pathname = `/api/${projectId}/envelope/`;
    url.search = `?sentry_key=${encodeURIComponent(key)}&sentry_version=7`;
    return { endpoint: url.toString() };
  } catch {
    return null;
  }
}

// Turn an Error stack into frames Sentry can display. Kept deliberately simple:
// a wrong guess about a stack line is harmless, a thrown parser is not.
function framesFromStack(stack: string | undefined) {
  if (!stack) return [];
  const frames: Array<{ filename: string; function?: string; lineno?: number }> = [];
  for (const line of stack.split("\n")) {
    const match = line.match(/^\s*at\s+(?:(.+?)\s+\()?(?:(.+?):(\d+):(\d+))\)?\s*$/);
    if (!match) continue;
    const [, fnName, filename, lineno] = match;
    const frame: { filename: string; function?: string; lineno?: number } = {
      filename: String(filename ?? "unknown"),
    };
    if (fnName) frame.function = fnName;
    if (lineno && Number.isFinite(Number(lineno))) frame.lineno = Number(lineno);
    frames.push(frame);
  }
  return frames.reverse().slice(0, 40);
}

function describeError(error: unknown): { type: string; value: string; stack?: string } {
  if (error instanceof Error) {
    return { type: error.name || "Error", value: error.message, stack: error.stack };
  }
  if (typeof error === "string") return { type: "Error", value: error };
  try {
    return { type: "Error", value: JSON.stringify(error) };
  } catch {
    return { type: "Error", value: String(error) };
  }
}

/**
 * Report an error to Sentry if a DSN is configured. Never throws, never blocks
 * the caller: the send is handed to the runtime and forgotten.
 *
 * Only the request method and its path are passed along — no query string, no
 * headers, no body, no cookies. Anything else would collect data about people,
 * which this project does not do.
 */
export function captureException(error: unknown, extra: Extra = {}): void {
  try {
    const target = readDsn();
    if (!target) return;

    const described = describeError(error);
    const event = {
      event_id: crypto.randomUUID().replace(/-/g, ""),
      timestamp: new Date().toISOString().replace(/Z$/, ""),
      platform: "javascript",
      level: "error",
      logger: "edge-function",
      environment: Deno.env.get("SENTRY_ENVIRONMENT") ?? SENTRY_ENVIRONMENT,
      release: Deno.env.get("SENTRY_RELEASE") ?? undefined,
      server_name: "market-pulse",
      tags: { runtime: "supabase-edge", function: String(extra.function ?? "unknown") },
      extra,
      exception: [
        {
          type: described.type,
          value: described.value.slice(0, 8000),
          stacktrace: { frames: framesFromStack(described.stack) },
        },
      ],
    };

    sendInBackground(target.endpoint, envelopeFor(event));
  } catch {
    // Nothing to do: the original error is what matters.
  }
}

function envelopeFor(event: Record<string, unknown>): string {
  return (
    `${JSON.stringify({ event_id: event.event_id, sent_at: new Date().toISOString() })}\n` +
    `${JSON.stringify({ type: "event", content_type: "application/json" })}\n` +
    `${JSON.stringify(event)}\n`
  );
}

/**
 * The send is handed to the runtime and forgotten: a report must never delay or
 * fail the response the visitor is waiting for.
 */
function sendInBackground(endpoint: string, envelope: string): void {
  const send = (async () => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-sentry-envelope" },
        body: envelope,
        signal: controller.signal,
      });
      clearTimeout(timer);
    } catch {
      // Reporting must never become the outage.
    }
  })();
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } })
    .EdgeRuntime;
  if (runtime && typeof runtime.waitUntil === "function") runtime.waitUntil(send);
}

// ---------------------------------------------------------------------------
// Caught failures
// ---------------------------------------------------------------------------
//
// A thrown error was never the whole story. Most refusals are caught inside the
// function and leave as `{success: false}` with status 500 — a provider that
// answered nothing, a view that went missing, a price source that timed out.
// Those never reached Sentry, so the only place they were visible was the health
// log, and only to someone who went looking.
//
// They are reported here, once, from a single place: the wrapper reads the status
// of whatever the handler returned. No function had to be edited for this.

// The same broken source fails every 15 minutes. A report per run would fill the
// monthly quota with one issue and hide everything else, so a repeat of the same
// function+status is dropped for half an hour. The first occurrence — the one
// that matters — always goes through.
const REPEAT_WINDOW_MS = 30 * 60 * 1000;
const lastSent = new Map<string, number>();

function shouldReport(key: string): boolean {
  const now = Date.now();
  const previous = lastSent.get(key);
  if (previous !== undefined && now - previous < REPEAT_WINDOW_MS) return false;
  // A warm instance can live for hours; keep the bookkeeping bounded.
  if (lastSent.size > 200) lastSent.clear();
  lastSent.set(key, now);
  return true;
}

function baseEvent(logger: string, type: string, value: string): Record<string, unknown> {
  return {
    event_id: crypto.randomUUID().replace(/-/g, ""),
    timestamp: new Date().toISOString().replace(/Z$/, ""),
    platform: "javascript",
    level: "error",
    logger,
    environment: Deno.env.get("SENTRY_ENVIRONMENT") ?? SENTRY_ENVIRONMENT,
    release: Deno.env.get("SENTRY_RELEASE") ?? undefined,
    server_name: "market-pulse",
    tags: { runtime: "supabase-edge" },
    exception: [{ type, value: value.slice(0, 8000) }],
  };
}

/**
 * Report a failure the function caught itself. Only the status and the text of
 * our own response are passed on: no request body, no headers, no cookies.
 */
export function captureFailure(
  name: string,
  request: Request,
  status: number,
  body: string,
): void {
  try {
    const target = readDsn();
    if (!target) return;
    const key = `${name}|${status}|${body.slice(0, 80)}`;
    if (!shouldReport(key)) return;
    let path = request.url;
    try {
      path = new URL(request.url).pathname;
    } catch { /* keep the raw value */ }
    const reason = body.replace(/\s+/g, " ").trim().slice(0, 400) || "без текста";
    const event = baseEvent("edge-function", "FunctionFailure", `${status} ${name}: ${reason}`);
    event.tags = {
      runtime: "supabase-edge",
      function: name,
      status: String(status),
      caught: "true",
    };
    event.extra = { method: request.method, path, response_body: body.slice(0, 1000) };
    sendInBackground(target.endpoint, envelopeFor(event));
  } catch {
    // Reporting must never become the outage.
  }
}

/**
 * Prove that reports actually arrive. The self-check needs an answer it can
 * print, not a promise: this sends a real probe event through the same code path
 * and reads Sentry's HTTP status.
 *
 * The probe is marked `probe: true` so it is recognisable in the Sentry list and
 * cannot be mistaken for a real failure. One probe per hourly self-check is far
 * below the free plan's 5000 events per month.
 */
export async function verifyDsn(functionName = "selfcheck"): Promise<{ ok: boolean; detail: string }> {
  const target = readDsn();
  if (!target) {
    return { ok: false, detail: "SENTRY_DSN не задан: об ошибках функций никто не узнает" };
  }
  const started = Date.now();
  const event = baseEvent("selfcheck", "SentryProbe", "проверка доставки отчётов, это не ошибка");
  event.level = "info";
  event.tags = { runtime: "supabase-edge", function: functionName, probe: "true" };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(target.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-sentry-envelope" },
      body: envelopeFor(event),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return {
        ok: false,
        detail: `Sentry ответил ${response.status}${text ? `: ${text.replace(/\s+/g, " ").slice(0, 120)}` : ""}`,
      };
    }
    return { ok: true, detail: `Sentry принял пробное событие за ${Date.now() - started} мс` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, detail: `не удалось отправить: ${message.slice(0, 160)}` };
  }
}

/** Wrap a handler so a thrown error is reported before it becomes a 500. */
export function withErrorReporting(
  name: string,
  handler: (request: Request) => Response | Promise<Response>,
): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    let response: Response;
    try {
      response = await handler(request);
    } catch (error) {
      // Path only: a query string can carry identifiers we have no business storing.
      let path = request.url;
      try {
        path = new URL(request.url).pathname;
      } catch { /* keep the raw value */ }
      captureException(error, { function: name, method: request.method, path });
      throw error;
    }
    // A 5xx that was caught and turned into a response is a failure all the
    // same. The body is our own JSON, small, and already free of anything the
    // visitor sent us.
    if (response.status >= 500) {
      try {
        const body = await response.clone().text();
        captureFailure(name, request, response.status, body);
      } catch {
        captureFailure(name, request, response.status, "");
      }
    }
    return response;
  };
}

/**
 * Drop-in replacement for Deno.serve that reports unhandled errors.
 * Usage: serveWithErrorReporting("function-name", async (request) => { ... });
 *        serveWithErrorReporting("function-name", handler, { onRequest: ... });
 */
export function serveWithErrorReporting(
  name: string,
  handler: (request: Request) => Response | Promise<Response>,
  options?: Deno.ServeOptions,
): void {
  Deno.serve(options ?? {}, withErrorReporting(name, handler));
}
