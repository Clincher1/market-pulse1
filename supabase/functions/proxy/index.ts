// RETIRED 2026-10-22.
//
// The legacy public `proxy` function let unauthenticated callers spend
// server-side provider quota. Nothing in the current frontend calls it
// (verified by codebase search on 2026-10-22), so it is replaced by a
// permanent 410 stub.
//
// Deploying this file over the old `proxy` slug neutralizes it.
// Even better: delete the function entirely in the Supabase dashboard
// (Edge Functions -> proxy -> Delete). See docs/BACKEND_HARDENING_DEPLOY.md.

Deno.serve(() =>
  Response.json({ success: false, error: "gone: this endpoint was retired" }, { status: 410 })
);
