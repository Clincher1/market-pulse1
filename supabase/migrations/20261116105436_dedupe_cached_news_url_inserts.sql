-- Existing cached_news history contains duplicate URLs, so a UNIQUE(url) index
-- cannot be added without altering historical rows. Keep every old row intact;
-- enforce idempotence only for future inserts and provide exact URL lookup for the writer.

create or replace function public.cached_news_url_key(input_url text)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select pg_catalog.split_part(
    pg_catalog.split_part(pg_catalog.btrim(input_url), '#', 1),
    '?',
    1
  );
$$;

create index if not exists cached_news_url_key_idx
  on public.cached_news (public.cached_news_url_key(url));

create or replace function public.cached_news_existing_url_keys(candidate_urls text[])
returns table (url_key text)
language sql
stable
set search_path = ''
as $$
  select distinct public.cached_news_url_key(news.url) as url_key
  from public.cached_news as news
  where candidate_urls is not null
    and public.cached_news_url_key(news.url) = any (candidate_urls);
$$;

create or replace function public.cached_news_guard_duplicate_url()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  canonical_url text;
begin
  canonical_url := public.cached_news_url_key(new.url);
  if canonical_url is null or canonical_url = '' then
    return new;
  end if;

  -- Serialize concurrent attempts for the same URL. The expression index makes
  -- the subsequent historical-existence check cheap, and old rows are untouched.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(canonical_url, 0)
  );

  if exists (
    select 1
    from public.cached_news as stored
    where public.cached_news_url_key(stored.url) = canonical_url
  ) then
    return null;
  end if;

  return new;
end;
$$;

revoke all on function public.cached_news_url_key(text)
  from public, anon, authenticated;
grant execute on function public.cached_news_url_key(text) to service_role;

revoke all on function public.cached_news_existing_url_keys(text[])
  from public, anon, authenticated;
grant execute on function public.cached_news_existing_url_keys(text[])
  to service_role;

revoke all on function public.cached_news_guard_duplicate_url()
  from public, anon, authenticated;
grant execute on function public.cached_news_guard_duplicate_url()
  to service_role;

drop trigger if exists cached_news_guard_url_dedupe on public.cached_news;
create trigger cached_news_guard_url_dedupe
  before insert on public.cached_news
  for each row
  execute function public.cached_news_guard_duplicate_url();

comment on trigger cached_news_guard_url_dedupe on public.cached_news is
  'Skips new rows whose normalized URL is already stored; does not alter or remove historical rows.';

notify pgrst, 'reload schema';
