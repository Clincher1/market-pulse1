-- One lightweight record for each authorized hourly monitor invocation.
-- Keep attempt history separate from the unique-per-day delivery record.
create table if not exists public.monitor_digest_attempts (
  id bigint generated always as identity primary key,
  attempted_at timestamptz not null,
  outcome text not null check (outcome in ('sent', 'skipped', 'failed')),
  reason text check (reason is null or length(reason) <= 500)
);

create index if not exists monitor_digest_attempts_attempted_at_idx
  on public.monitor_digest_attempts (attempted_at desc);

alter table public.monitor_digest_attempts enable row level security;
revoke all on table public.monitor_digest_attempts from public, anon, authenticated;
grant select, insert on table public.monitor_digest_attempts to service_role;
grant usage, select on sequence public.monitor_digest_attempts_id_seq to service_role;

comment on table public.monitor_digest_attempts is
  'One row per authorized scheduled-job-runner invocation; records digest delivery or the gate/reason that prevented it.';

notify pgrst, 'reload schema';
