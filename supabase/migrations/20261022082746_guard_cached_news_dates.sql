-- Guard the public news cache against absurd publication dates.
--
-- Incident on 2026-10-22: the legacy update-news pipeline inserted two WSJ
-- articles dated 2025-01-27 (about 632 days old). The shadow V2 ingest has
-- its own per-source stale gate; this trigger is a final database-level
-- safety net for the remaining legacy public writer.
--
-- INSERT rows outside the allowed range are skipped row-by-row (RETURN NULL)
-- so one stale RSS item cannot fail a whole batch. UPDATE attempts that move
-- published_at outside the range preserve the old row.

create or replace function public.guard_cached_news_published_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.published_at is null
     or new.published_at < clock_timestamp() - interval '7 days'
     or new.published_at > clock_timestamp() + interval '1 day' then
    if tg_op = 'INSERT' then
      return null;
    end if;
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists cached_news_guard_published_at on public.cached_news;

create trigger cached_news_guard_published_at
before insert or update of published_at on public.cached_news
for each row
execute function public.guard_cached_news_published_at();

comment on trigger cached_news_guard_published_at on public.cached_news is
  'Skips public-cache news rows with null/absurd publication dates: older than 7 days or more than 1 day in the future.';
