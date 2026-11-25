-- Track the live v2 export RPC so its implementation is reproducible from migrations.
-- The JSON contract, query, grants, and comment match the live function.
-- Ownership and the postgres -> static_snapshot_reader membership are intentionally
-- deferred: Supabase granted that membership as supabase_admin, and the available
-- migration executor cannot revoke grants made by that role (SQLSTATE 42501).
-- Limitation: a clean full-history replay could not be verified in this workspace:
-- no local PostgreSQL/Docker/Supabase CLI is available, and Supabase branching
-- requires the Pro plan.
-- ACL audit for production 1a (2026-11-25): the post-apply filtered ACL digest is
-- 42c033e53b941349f8126766c4048a53, excluding pg_temp_* and pg_toast_temp_* schemas.
-- The precheck retained only an unfiltered MD5, not row-level ACL data, so its
-- filtered digest cannot be reconstructed and compared historically. The migration
-- below changes grants only on this target function; it changes no owner/membership
-- and contains no privilege statements for other objects. After merge, recompute
-- the filtered ACL digest once and confirm it equals the baseline above.
-- On upgrade, capture the live definition so this transaction can assert it was
-- reproduced byte-for-byte. On a clean replay, the function is not present yet.
create temporary table _static_snapshot_v2_definition_before (definition text) on commit drop;
do $capture_static_snapshot_v2_definition$
begin
  if to_regprocedure('public.export_static_snapshot_v2()') is not null then
    insert into pg_temp._static_snapshot_v2_definition_before
    select pg_get_functiondef('public.export_static_snapshot_v2()'::regprocedure);
  end if;
end;
$capture_static_snapshot_v2_definition$;

create or replace function public.export_static_snapshot_v2()
returns jsonb
language sql
stable security definer
set search_path = ''
set row_security = on
as $function$
  select pg_catalog.jsonb_build_object(
    'exportedAt', pg_catalog.to_char(pg_catalog.statement_timestamp() at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'rows', coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', i.id, 'provider', i.provider, 'symbol', i.provider_symbol,
      'instrumentType', i.instrument_type, 'currency', i.currency,
      'unit', i.unit, 'frequency', i.frequency,
      'value', s.price::text, 'observationDate', s.observation_date::text,
      'priceTimestamp', case when s.price_timestamp is not null then
        pg_catalog.to_char(s.price_timestamp at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') end,
      'sourceUrl', s.source_url
    ) order by i.id), '[]'::jsonb)
  )
  from public.asset_instruments_v2 i
  left join lateral (
    select p.price, p.observation_date, p.price_timestamp, p.source_url
    from public.asset_price_snapshots_v2 p
    where p.instrument_id = i.id
      and (i.id not in ('brent_yahoo_bzf', 'sp500_yahoo_gspc')
        or p.observation_date < (pg_catalog.statement_timestamp() at time zone 'UTC')::date)
    order by p.observation_date desc nulls last,
      p.price_timestamp desc nulls last, p.id desc
    limit 1
  ) s on true
  where i.id in ('brent_yahoo_bzf', 'sp500_yahoo_gspc', 'gold_api_xau_observed_daily')
    and i.enabled and i.is_primary;
$function$;

-- Preserve the existing caller surface; the postgres owner retains its own EXECUTE.
revoke all on function public.export_static_snapshot_v2() from public;
grant execute on function public.export_static_snapshot_v2()
  to anon, authenticated, service_role;

comment on function public.export_static_snapshot_v2() is
  'Exports the latest closed Yahoo daily observation for BZ=F and ^GSPC, plus the latest timestamped XAU observation. Current forming Yahoo daily bars are excluded. Plan B: parallel v2 RPC; v1 unchanged.';

-- Fail atomically if the live definition, owner, or public caller grants diverge.
do $verify_static_snapshot_v2$
declare
  before_definition text;
  after_definition text;
begin
  if (select pg_get_userbyid(p.proowner)
      from pg_proc p
      where p.oid = 'public.export_static_snapshot_v2()'::regprocedure)
      is distinct from 'postgres' then
    raise exception 'export_static_snapshot_v2 owner changed from postgres';
  end if;

  if not has_function_privilege('anon', 'public.export_static_snapshot_v2()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.export_static_snapshot_v2()', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.export_static_snapshot_v2()', 'EXECUTE')
     or has_function_privilege('public', 'public.export_static_snapshot_v2()', 'EXECUTE') then
    raise exception 'export_static_snapshot_v2 EXECUTE grants differ from intended surface';
  end if;

  if obj_description('public.export_static_snapshot_v2()'::regprocedure, 'pg_proc') is distinct from
     'Exports the latest closed Yahoo daily observation for BZ=F and ^GSPC, plus the latest timestamped XAU observation. Current forming Yahoo daily bars are excluded. Plan B: parallel v2 RPC; v1 unchanged.' then
    raise exception 'export_static_snapshot_v2 comment differs from intended contract';
  end if;

  select definition into before_definition
  from pg_temp._static_snapshot_v2_definition_before
  limit 1;
  if found then
    after_definition := pg_get_functiondef('public.export_static_snapshot_v2()'::regprocedure);
    if before_definition is distinct from after_definition then
      raise exception 'export_static_snapshot_v2 definition changed from live pre-check';
    end if;
  end if;
end;
$verify_static_snapshot_v2$;

notify pgrst, 'reload schema';
