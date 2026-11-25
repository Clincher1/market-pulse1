-- Daily market digest history. Pending/failed retries reuse the same row;
-- digest_date is unique so repeated invocations cannot create another row.
create table if not exists public.monitor_history (
  id bigint generated always as identity primary key,
  digest_date date not null unique,
  created_at timestamptz not null default now(),
  delivery_status text not null default 'pending'
    check (delivery_status in ('pending', 'sent', 'failed')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object')
);

create index if not exists monitor_history_created_at_idx
  on public.monitor_history (created_at desc);

alter table public.monitor_history enable row level security;
revoke all on table public.monitor_history from public, anon, authenticated;
grant select, insert, update on table public.monitor_history to service_role;
grant usage, select on sequence public.monitor_history_id_seq to service_role;

comment on table public.monitor_history is
  'One digest attempt per Moscow calendar date; private payload is service-role only, delivery_status records its state.';

-- cron.job_run_details is outside PostgREST's exposed schemas. Expose only two
-- aggregate counts to the trusted Edge Function, never the raw cron log rows.
create or replace function public.monitor_cron_counts(p_since timestamptz)
returns table (succeeded bigint, failed bigint)
language sql
security definer
set search_path = pg_catalog, public, cron
as $$
  select
    count(*) filter (where d.status = 'succeeded')::bigint,
    count(*) filter (where d.status = 'failed')::bigint
  from cron.job_run_details d
  join cron.job j on j.jobid = d.jobid
  where j.jobname = 'scheduled-job-runner'
    and d.start_time >= p_since
    and d.status in ('succeeded', 'failed');
$$;

revoke all on function public.monitor_cron_counts(timestamptz) from public, anon, authenticated;
grant execute on function public.monitor_cron_counts(timestamptz) to service_role;

notify pgrst, 'reload schema';
