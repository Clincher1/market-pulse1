-- Stage 2 (2026-10-27): keep cached_tension.history_stats always in sync
-- with tension_history, regardless of which writer version upserts the row.
-- Stats are a pure function of tension_history + the row's current value.

create or replace function public.compute_tension_history_stats(current_value integer)
returns jsonb
language sql
stable
as $$
  with s as (
    select
      count(*)::int as days,
      count(*) filter (where th.value < current_value)::int as below_days,
      count(*) filter (where th.value > current_value)::int as above_days,
      count(*) filter (where th.value = current_value)::int as equal_days,
      percentile_cont(0.5) within group (order by th.value) as median,
      min(th.value) as min_v,
      max(th.value) as max_v,
      min(th.date) as first_date,
      max(th.date) as last_date
    from public.tension_history th
  )
  select case
    when days = 0 then null
    else jsonb_build_object(
      'days', days,
      'below_days', below_days,
      'above_days', above_days,
      'equal_days', equal_days,
      'median', round(median::numeric, 1),
      'min', min_v,
      'max', max_v,
      'first_date', first_date,
      'last_date', last_date,
      'value', current_value
    )
  end
  from s;
$$;

create or replace function public.set_cached_tension_history_stats()
returns trigger
language plpgsql
as $$
begin
  new.history_stats := public.compute_tension_history_stats(new.value);
  return new;
end;
$$;

drop trigger if exists trg_cached_tension_history_stats on public.cached_tension;
create trigger trg_cached_tension_history_stats
  before insert or update on public.cached_tension
  for each row
  execute function public.set_cached_tension_history_stats();

-- Backfill the single public row now; the trigger keeps it fresh afterwards.
update public.cached_tension
set history_stats = public.compute_tension_history_stats(value)
where id = 1;
