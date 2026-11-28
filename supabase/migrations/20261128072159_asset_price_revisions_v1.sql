-- Append-only audit trail for revisions to closed daily price observations.
create table if not exists public.asset_price_revisions_v1 (
  id bigint generated always as identity primary key,
  instrument text not null references public.asset_instruments_v2(id),
  observation_date date not null,
  original_value numeric(24, 10) not null check (original_value > 0),
  revised_value numeric(24, 10) not null check (revised_value > 0),
  delta_pct numeric(16, 8) generated always as
    (((revised_value - original_value) / original_value) * 100) stored,
  first_seen_at timestamptz not null,
  revision_seen_at timestamptz not null default statement_timestamp(),
  source text not null,
  raw_meta jsonb not null default '{}'::jsonb,
  status text not null check (status in ('accepted', 'pending review')),
  note text,
  constraint asset_price_revisions_v1_changed_value
    check (original_value <> revised_value)
);

create unique index if not exists asset_price_revisions_v1_event_unique
  on public.asset_price_revisions_v1
    (instrument, observation_date, original_value, revised_value, status);
create index if not exists asset_price_revisions_v1_latest_idx
  on public.asset_price_revisions_v1 (instrument, observation_date, revision_seen_at desc, id desc);

alter table public.asset_price_revisions_v1 enable row level security;
revoke all on table public.asset_price_revisions_v1 from public, anon, authenticated;
grant select, insert on table public.asset_price_revisions_v1 to service_role;
grant usage, select on sequence public.asset_price_revisions_v1_id_seq to service_role;

create policy asset_price_revisions_service_read
  on public.asset_price_revisions_v1 for select to service_role using (true);
create policy asset_price_revisions_service_insert
  on public.asset_price_revisions_v1 for insert to service_role with check (true);

create or replace function public.reject_asset_price_revision_mutation()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  raise exception 'asset_price_revisions_v1 is append-only';
end;
$function$;
revoke all on function public.reject_asset_price_revision_mutation() from public, anon, authenticated, service_role;
create trigger asset_price_revisions_v1_append_only
  before update or delete on public.asset_price_revisions_v1
  for each row execute function public.reject_asset_price_revision_mutation();

-- Public API exposes only the newest annotation for each instrument/session;
-- raw provider metadata remains available to service_role only.
create or replace view public.asset_price_revisions_public_v1
with (security_invoker = false)
as
  select distinct on (instrument, observation_date)
    instrument, observation_date, original_value, revised_value, delta_pct,
    first_seen_at, revision_seen_at, source, status, note
  from public.asset_price_revisions_v1
  order by instrument, observation_date, revision_seen_at desc, id desc;

revoke all on public.asset_price_revisions_public_v1 from public;
grant select on public.asset_price_revisions_public_v1 to anon, authenticated, service_role;
comment on table public.asset_price_revisions_v1 is
  'Append-only audit log for changed closed daily price observations; status changes are new rows, never updates.';
comment on view public.asset_price_revisions_public_v1 is
  'Latest non-sensitive revision annotation per instrument and observation date.';

notify pgrst, 'reload schema';
