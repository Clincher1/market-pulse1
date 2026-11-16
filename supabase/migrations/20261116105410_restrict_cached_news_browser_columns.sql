-- The browser feed uses only publication identity and source metadata.
-- Model-written descriptions/classifications remain available to trusted server roles.
revoke select on table public.cached_news
  from public, anon, authenticated;
revoke select (
  id, source, time, title, summary, url, published_at, impacts,
  sentiment, importance, topic, updated_at, confidence, model
) on table public.cached_news
  from public, anon, authenticated;
grant select (id, source, time, title, url, published_at)
  on table public.cached_news to anon, authenticated;
comment on table public.cached_news is
  'Browser roles may read only id, source, time, title, url and published_at; model classifications remain server-side.';
