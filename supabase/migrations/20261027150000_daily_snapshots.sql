-- Stage 4 (2026-10-27): one morning baseline snapshot per Moscow date.
-- Written once a day by the guarded snapshot-morning Edge Function
-- (first write of the day wins); read publicly by the frontend to compute
-- honest "changed since morning" deltas against live cached data.

create table if not exists public.daily_snapshots (
  date date primary key,
  captured_at timestamptz not null,
  tension jsonb,
  assets jsonb,
  russia jsonb,
  forecasts jsonb,
  created_at timestamptz not null default now()
);

comment on table public.daily_snapshots is
  'Stage 4 morning baselines: tension/assets/russia/forecasts JSON snapshots, one row per Moscow date. Public read only; writes via service role (snapshot-morning function).';

alter table public.daily_snapshots enable row level security;

drop policy if exists "Allow public read access" on public.daily_snapshots;
create policy "Allow public read access"
  on public.daily_snapshots
  for select
  using (true);

revoke all on table public.daily_snapshots from anon, authenticated;
grant select on table public.daily_snapshots to anon, authenticated;
grant select, insert, update on table public.daily_snapshots to service_role;
