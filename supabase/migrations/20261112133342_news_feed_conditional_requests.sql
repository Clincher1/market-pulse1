-- Preserve the currently observed 30-minute shadow feed cadence explicitly.
-- This is not a faster schedule: shadow-ingest-v2 already runs at :05 and :35.
update public.news_sources_v2
set poll_interval_minutes = 30,
    updated_at = now()
where enabled = true
  and poll_interval_minutes is null;

alter table public.news_sources_v2
  add column if not exists feed_etag text,
  add column if not exists feed_last_modified text;

alter table public.news_sources_v2
  drop constraint if exists news_sources_v2_feed_etag_length,
  add constraint news_sources_v2_feed_etag_length
    check (feed_etag is null or length(feed_etag) <= 512),
  drop constraint if exists news_sources_v2_feed_last_modified_length,
  add constraint news_sources_v2_feed_last_modified_length
    check (feed_last_modified is null or length(feed_last_modified) <= 128);

comment on column public.news_sources_v2.feed_etag is
  'ETag from the most recent successfully parsed RSS/Atom response; sent as If-None-Match on the next scheduled poll.';
comment on column public.news_sources_v2.feed_last_modified is
  'Last-Modified from the most recent successfully parsed RSS/Atom response; sent as If-Modified-Since on the next scheduled poll.';
