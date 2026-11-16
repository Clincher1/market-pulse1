-- The tension index and its historical series are internal, not part of the public product.
-- Preserve the tables and server-role access; remove only browser-facing reads and policies.
revoke select on table public.cached_tension, public.tension_history
  from public, anon, authenticated;

drop policy if exists "Allow public read access" on public.cached_tension;
drop policy if exists "Allow public read access" on public.tension_history;
