// Shared authorization for service-only Edge Functions.
//
// Gateway verify_jwt alone is NOT enough: the public publishable key that
// ships in the site bundle also passes JWT verification. Any function that
// writes data or spends a server-side API quota must therefore check, inside
// its own handler, for the real service-role bearer token or the shared cron
// secret. Fail closed: no configured secret means nobody is authorized.
export function timingSafeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < b.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function isAuthorizedService(req: Request): boolean {
  const auth = req.headers.get("Authorization") ?? "";
  const keys = [
    Deno.env.get("SERVICE_KEY") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  ].filter(Boolean);
  if (keys.some((key) => auth === `Bearer ${key}`)) return true;
  return timingSafeEqual(req.headers.get("x-cron-secret") ?? "", Deno.env.get("CRON_SECRET") ?? "");
}

export function unauthorized(): Response {
  return Response.json({ success: false, error: "unauthorized" }, { status: 401 });
}
