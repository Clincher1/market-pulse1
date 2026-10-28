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

    const envelope =
      `${JSON.stringify({ event_id: event.event_id, sent_at: new Date().toISOString() })}\n` +
      `${JSON.stringify({ type: "event", content_type: "application/json" })}\n` +
      `${JSON.stringify(event)}\n`;

    const send = (async () => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3000);
        await fetch(target.endpoint, {
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
  } catch {
    // Nothing to do: the original error is what matters.
  }
}

/** Wrap a handler so a thrown error is reported before it becomes a 500. */
export function withErrorReporting(
  name: string,
  handler: (request: Request) => Response | Promise<Response>,
): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    try {
      return await handler(request);
    } catch (error) {
      // Path only: a query string can carry identifiers we have no business storing.
      let path = request.url;
      try {
        path = new URL(request.url).pathname;
      } catch { /* keep the raw value */ }
      captureException(error, { function: name, method: request.method, path });
      throw error;
    }
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
