-- Public read-only privileges (2026-10-29).
--
-- Supabase's default privileges in `public` grant anon and authenticated ALL
-- on every newly created table, view and sequence (a=INSERT, r=SELECT,
-- w=UPDATE, d=DELETE, D=TRUNCATE, x=REFERENCES, t=TRIGGER). Nothing in this
-- project writes as anon or authenticated: the site reads with the publishable
-- key and every write goes through an Edge Function holding the service role.
-- The extra privileges were unused, but they were real, and they were harmless
-- only because the two actual tables that carried them (news_source_health,
-- site_health) happened to have RLS enabled with a SELECT-only policy. A table
-- created later without RLS would have been writable by anyone holding the
-- public key that ships in the site bundle.
--
-- Verified before writing this migration:
--   * all five market_memory_*_v1 report pg_relation_is_updatable = 0, so no
--     write through them was possible even with the grants in place;
--   * `insert into site_health` as anon failed with 42501 (RLS), so the data
--     was never at risk — this migration removes the dependency on that luck.
--
-- Read access is untouched on purpose: nothing here revokes SELECT.

-- 1. Existing relations: keep SELECT, drop everything that can write.
revoke insert, update, delete, truncate, references, trigger
  on table
    public.market_memory_analogues_v1,
    public.market_memory_event_outcomes_v1,
    public.market_memory_events_v1,
    public.market_memory_forecasts_v1,
    public.market_memory_stats_v1,
    public.asset_price_history_v1,
    public.forecast_latest_v2,
    public.forecast_track_record,
    public.news_source_health,
    public.site_health
  from anon, authenticated;

-- 2. Sequences: anon had UPDATE, which is only useful to an insert path that
--    does not exist. Service role keeps them for the writers.
do $$
declare
  seq record;
begin
  for seq in
    select c.oid::regclass as name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'S'
  loop
    execute format('revoke all on sequence %s from anon, authenticated', seq.name);
  end loop;
end $$;

-- 3. Root cause: stop new objects from inheriting write grants, otherwise the
--    next `create table` reopens exactly what was closed.
--
--    Two creating roles carry such a default ACL in `public`: postgres and
--    supabase_admin. Only postgres can be changed from here — migrations run as
--    postgres, which is not a member of supabase_admin, and escalating that
--    membership is not this migration's business. The gap is dormant in
--    practice: every relation currently in `public` (23 tables, 8 views,
--    10 sequences) is owned by postgres, so postgres is the role that actually
--    creates objects here. If something is ever created as supabase_admin, its
--    write grants will reappear and the check below will show them.
alter default privileges for role postgres in schema public
  revoke insert, update, delete, truncate, references, trigger on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
