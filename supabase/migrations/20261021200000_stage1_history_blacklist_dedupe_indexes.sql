-- Stage 1: remove duplicate daily tension rows and blacklist phrases,
-- then protect them with unique indexes. Add read indexes for news recency.
-- Applied to production through the Supabase connector migration
-- `stage1_history_blacklist_dedupe_indexes` on 2026-10-21.

with ranked as (
  select id,
         row_number() over (partition by date order by created_at desc, id desc) as rn
  from public.tension_history
)
delete from public.tension_history th
using ranked r
where th.id = r.id and r.rn > 1;

alter table public.tension_history
  add constraint tension_history_date_key unique (date);

with ranked as (
  select id,
         row_number() over (partition by lower(trim(phrase)) order by id) as rn
  from public.news_blacklist
)
delete from public.news_blacklist nb
using ranked r
where nb.id = r.id and r.rn > 1;

create unique index if not exists news_blacklist_phrase_norm_unique
  on public.news_blacklist ((lower(trim(phrase))));

create index if not exists cached_news_published_at_desc_idx
  on public.cached_news (published_at desc);

create index if not exists cached_news_source_published_at_idx
  on public.cached_news (source, published_at desc);
