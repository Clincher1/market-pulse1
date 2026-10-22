-- Stage 5 (partial, safe subset): the public frontend only reads cached_*
-- tables. Remove write privileges from anon/authenticated while preserving
-- SELECT. Internal tables used only by service-role functions lose all
-- public privileges. RLS policies remain as a second layer.

revoke insert, update, delete, truncate, references, trigger
  on table public.cached_assets,
           public.cached_forecasts,
           public.cached_news,
           public.cached_tension
  from anon, authenticated;

grant select
  on table public.cached_assets,
           public.cached_forecasts,
           public.cached_news,
           public.cached_tension
  to anon, authenticated;

revoke all
  on table public.news_blacklist,
           public.tension_history
  from public, anon, authenticated;

grant select, insert, update, delete
  on table public.news_blacklist,
           public.tension_history
  to service_role;
