-- Stage 2: event clusters and strict-schema classifications in shadow mode.
-- Service-role only; nothing here feeds the public frontend yet.

create table if not exists public.news_cluster_runs_v2 (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'success', 'partial', 'error', 'skipped')),
  articles_seen integer not null default 0,
  events_upserted integer not null default 0,
  multi_source_events integer not null default 0,
  error text,
  stats jsonb not null default '{}'::jsonb
);

create table if not exists public.news_events_shadow (
  id text primary key,
  representative_article_id text references public.news_articles_shadow(id) on delete set null,
  title text not null,
  normalized_title text not null,
  first_published_at timestamptz,
  latest_published_at timestamptz,
  article_count integer not null default 0 check (article_count >= 0),
  source_count integer not null default 0 check (source_count >= 0),
  sources jsonb not null default '[]'::jsonb,
  max_trust numeric not null default 0 check (max_trust >= 0 and max_trust <= 1),
  rank_score numeric not null default 0 check (rank_score >= 0 and rank_score <= 100),
  status text not null default 'candidate' check (status in ('candidate', 'rejected', 'quarantine')),
  cluster_method text not null default 'title_token_jaccard_v1',
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.news_event_articles_shadow (
  article_id text primary key references public.news_articles_shadow(id) on delete cascade,
  event_id text not null references public.news_events_shadow(id) on delete cascade,
  similarity numeric check (similarity is null or (similarity >= 0 and similarity <= 1)),
  is_representative boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, article_id)
);

create table if not exists public.news_event_classifications_shadow (
  event_id text primary key references public.news_events_shadow(id) on delete cascade,
  status text not null check (status in ('classified', 'rejected', 'quarantine')),
  market_relevant boolean,
  relevance numeric check (relevance is null or (relevance >= 0 and relevance <= 1)),
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  importance integer check (importance is null or (importance >= 1 and importance <= 10)),
  sentiment numeric check (sentiment is null or (sentiment >= -1 and sentiment <= 1)),
  transmission_channel text,
  entities jsonb not null default '[]'::jsonb,
  impacts jsonb not null default '[]'::jsonb,
  summary_ru text,
  rationale_ru text,
  model text,
  prompt_version text,
  raw_response jsonb not null default '{}'::jsonb,
  error text,
  classified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists news_events_shadow_rank_idx
  on public.news_events_shadow (rank_score desc, latest_published_at desc);

create index if not exists news_events_shadow_latest_idx
  on public.news_events_shadow (latest_published_at desc);

create index if not exists news_event_articles_event_idx
  on public.news_event_articles_shadow (event_id);

create index if not exists news_event_classifications_status_idx
  on public.news_event_classifications_shadow (status, classified_at desc);

alter table public.news_cluster_runs_v2 enable row level security;
alter table public.news_events_shadow enable row level security;
alter table public.news_event_articles_shadow enable row level security;
alter table public.news_event_classifications_shadow enable row level security;

revoke all on table public.news_cluster_runs_v2 from public, anon, authenticated;
revoke all on table public.news_events_shadow from public, anon, authenticated;
revoke all on table public.news_event_articles_shadow from public, anon, authenticated;
revoke all on table public.news_event_classifications_shadow from public, anon, authenticated;

grant select, insert, update, delete on table public.news_cluster_runs_v2 to service_role;
grant select, insert, update, delete on table public.news_events_shadow to service_role;
grant select, insert, update, delete on table public.news_event_articles_shadow to service_role;
grant select, insert, update, delete on table public.news_event_classifications_shadow to service_role;
grant usage, select on sequence public.news_cluster_runs_v2_id_seq to service_role;

-- TASS stays disabled until ingest token_prefix_v2 is deployed; prepare its
-- category exclusions for that later enablement.
update public.news_sources_v2
set exclude_categories = '["Культура", "Спорт"]'::jsonb,
    updated_at = now()
where id = 'TASS';
