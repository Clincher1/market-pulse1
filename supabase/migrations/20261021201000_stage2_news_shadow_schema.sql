-- Stage 2: additive shadow news pipeline schema.
-- These tables are service-role only. They do not feed the frontend and do
-- not replace cached_news until shadow quality gates pass.

create table if not exists public.news_sources_v2 (
  id text primary key,
  name text not null,
  url text not null unique,
  role text not null default 'news',
  language text not null default 'en',
  trust numeric not null default 0.7 check (trust >= 0 and trust <= 1),
  enabled boolean not null default true,
  max_age_hours integer not null default 36 check (max_age_hours > 0),
  requires_market_terms boolean not null default false,
  include_categories jsonb not null default '[]'::jsonb,
  exclude_categories jsonb not null default '[]'::jsonb,
  include_url_patterns jsonb not null default '[]'::jsonb,
  exclude_url_patterns jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.news_ingest_runs_v2 (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'success', 'partial', 'error', 'skipped')),
  sources_total integer not null default 0,
  sources_ok integer not null default 0,
  items_seen integer not null default 0,
  items_candidate integer not null default 0,
  items_rejected integer not null default 0,
  items_upserted integer not null default 0,
  error text,
  stats jsonb not null default '{}'::jsonb
);

create table if not exists public.news_source_health_v2 (
  id bigint generated always as identity primary key,
  run_id bigint references public.news_ingest_runs_v2(id) on delete cascade,
  source_id text references public.news_sources_v2(id) on delete cascade,
  ok boolean not null default false,
  http_status integer,
  duration_ms integer,
  items_seen integer not null default 0,
  items_candidate integer not null default 0,
  items_rejected integer not null default 0,
  latest_published_at timestamptz,
  final_url text,
  error text,
  created_at timestamptz not null default now()
);

create table if not exists public.news_articles_shadow (
  id text primary key,
  source_id text references public.news_sources_v2(id) on delete set null,
  source_name text not null,
  guid text,
  url text not null,
  canonical_url text not null unique,
  title text not null,
  normalized_title text not null,
  description text,
  categories jsonb not null default '[]'::jsonb,
  published_at timestamptz,
  fetched_at timestamptz not null default now(),
  status text not null check (status in ('candidate', 'rejected', 'quarantine')),
  reject_reason text,
  language text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists news_articles_shadow_published_idx
  on public.news_articles_shadow (published_at desc);

create index if not exists news_articles_shadow_status_published_idx
  on public.news_articles_shadow (status, published_at desc);

create index if not exists news_articles_shadow_source_published_idx
  on public.news_articles_shadow (source_id, published_at desc);

create index if not exists news_articles_shadow_normalized_title_idx
  on public.news_articles_shadow (normalized_title);

create index if not exists news_source_health_source_created_idx
  on public.news_source_health_v2 (source_id, created_at desc);

alter table public.news_sources_v2 enable row level security;
alter table public.news_ingest_runs_v2 enable row level security;
alter table public.news_source_health_v2 enable row level security;
alter table public.news_articles_shadow enable row level security;

revoke all on table public.news_sources_v2 from public, anon, authenticated;
revoke all on table public.news_ingest_runs_v2 from public, anon, authenticated;
revoke all on table public.news_source_health_v2 from public, anon, authenticated;
revoke all on table public.news_articles_shadow from public, anon, authenticated;

grant select, insert, update, delete on table public.news_sources_v2 to service_role;
grant select, insert, update, delete on table public.news_ingest_runs_v2 to service_role;
grant select, insert, update, delete on table public.news_source_health_v2 to service_role;
grant select, insert, update, delete on table public.news_articles_shadow to service_role;

grant usage, select on sequence public.news_ingest_runs_v2_id_seq to service_role;
grant usage, select on sequence public.news_source_health_v2_id_seq to service_role;

insert into public.news_sources_v2
  (id, name, url, role, language, trust, enabled, max_age_hours, requires_market_terms, include_categories)
values
  ('Bloomberg-markets', 'Bloomberg Markets', 'https://www.bloomberg.com/feeds/markets/news.rss', 'markets', 'en', 0.92, true, 36, false, '[]'::jsonb),
  ('Bloomberg-economics', 'Bloomberg Economics', 'https://www.bloomberg.com/feeds/economics/news.rss', 'economics', 'en', 0.92, true, 36, false, '[]'::jsonb),
  ('Bloomberg-politics', 'Bloomberg Politics', 'https://www.bloomberg.com/feeds/politics/news.rss', 'politics', 'en', 0.88, true, 36, true, '[]'::jsonb),
  ('ft-markets', 'FT Markets', 'https://www.ft.com/markets?format=rss', 'markets', 'en', 0.92, true, 36, false, '[]'::jsonb),
  ('CNBC-economy', 'CNBC Economy', 'https://www.cnbc.com/id/20910258/device/rss/rss.html', 'economics', 'en', 0.82, true, 36, false, '[]'::jsonb),
  ('CNBC-world', 'CNBC World', 'https://www.cnbc.com/id/100727362/device/rss/rss.html', 'world', 'en', 0.80, true, 36, true, '[]'::jsonb),
  ('wsj-markets', 'WSJ Markets', 'https://feeds.content.dowjones.io/public/rss/RSSMarketsMain', 'markets', 'en', 0.90, true, 36, false, '[]'::jsonb),
  ('wsj-world', 'WSJ World', 'https://feeds.content.dowjones.io/public/rss/RSSWorldNews', 'world', 'en', 0.88, true, 36, true, '[]'::jsonb),
  ('bbc-business', 'BBC Business', 'https://feeds.bbci.co.uk/news/business/rss.xml', 'business', 'en', 0.84, true, 36, false, '[]'::jsonb),
  ('bbc-world', 'BBC World', 'https://feeds.bbci.co.uk/news/world/rss.xml', 'world', 'en', 0.84, true, 36, true, '[]'::jsonb),
  ('reuters-google-business', 'Reuters via Google News Business', 'https://news.google.com/rss/search?q=when:24h+site:reuters.com/business&ceid=US:en&hl=en-US&gl=US', 'corroboration', 'en', 0.65, true, 36, false, '[]'::jsonb),
  ('fed-press', 'Federal Reserve Press', 'https://www.federalreserve.gov/feeds/press_all.xml', 'primary', 'en', 1.00, true, 72, false, '["Monetary Policy"]'::jsonb),
  ('kommersant-economics', 'Kommersant Economics', 'https://www.kommersant.ru/rss/section-economics.xml', 'economics', 'ru', 0.86, true, 36, false, '[]'::jsonb),
  ('kommersant-business', 'Kommersant Business', 'https://www.kommersant.ru/rss/section-business.xml', 'business', 'ru', 0.86, true, 36, false, '[]'::jsonb),
  ('vedomosti-economics', 'Vedomosti Economics', 'https://www.vedomosti.ru/rss/rubric/economics', 'economics', 'ru', 0.86, true, 36, false, '[]'::jsonb),
  ('vedomosti-finance', 'Vedomosti Finance', 'https://www.vedomosti.ru/rss/rubric/finance', 'finance', 'ru', 0.86, true, 36, false, '[]'::jsonb),
  ('interfax', 'Interfax', 'https://www.interfax.ru/rss.asp', 'general', 'ru', 0.84, true, 36, true, '[]'::jsonb),
  ('TASS', 'TASS', 'https://tass.ru/rss/v2.xml', 'general', 'ru', 0.78, true, 36, true, '[]'::jsonb),
  ('frank-media', 'Frank Media', 'https://frankmedia.ru/feed', 'finance', 'ru', 0.78, true, 36, false, '[]'::jsonb),
  ('oilprice', 'OilPrice', 'https://oilprice.com/rss/main', 'energy', 'en', 0.70, true, 36, false, '[]'::jsonb),
  ('coindesk', 'CoinDesk', 'https://www.coindesk.com/arc/outboundfeeds/rss/', 'crypto', 'en', 0.76, true, 36, false, '[]'::jsonb),
  ('rbc-full', 'RBC Full', 'https://rssexport.rbc.ru/rbcnews/news/30/full.rss', 'general', 'ru', 0.84, false, 36, true, '[]'::jsonb),
  ('dw-business', 'DW Business', 'https://rss.dw.com/rdf/rss-en-bus', 'business', 'en', 0.76, false, 36, false, '[]'::jsonb),
  ('guardian-business', 'Guardian Business', 'https://www.theguardian.com/uk/business/rss', 'business', 'en', 0.74, false, 36, false, '[]'::jsonb)
on conflict (id) do update set
  name = excluded.name,
  url = excluded.url,
  role = excluded.role,
  language = excluded.language,
  trust = excluded.trust,
  enabled = excluded.enabled,
  max_age_hours = excluded.max_age_hours,
  requires_market_terms = excluded.requires_market_terms,
  include_categories = excluded.include_categories,
  updated_at = now();

-- First shadow run tuning (2026-10-21):
-- Bloomberg feeds include many video pages; WSJ includes opinion;
-- Frank Media and Kommersant Business are broader than their feed names;
-- TASS is disabled until the market-term gate is token-based rather than
-- category/substring based.
update public.news_sources_v2
set exclude_url_patterns = '["/news/videos/", "/news/audio/", "/podcasts/"]'::jsonb,
    updated_at = now()
where id like 'Bloomberg-%';

update public.news_sources_v2
set exclude_url_patterns = '["/opinion/"]'::jsonb,
    updated_at = now()
where id in ('wsj-markets', 'wsj-world');

update public.news_sources_v2
set requires_market_terms = true,
    updated_at = now()
where id in ('frank-media', 'kommersant-business');

update public.news_sources_v2
set enabled = false,
    updated_at = now()
where id = 'TASS';
