-- ============================================================================
-- Legacy GDELT rows in public.cached_news: check + idempotent cleanup
-- Prepared 2026-10-22.
--
-- Public read check at 2026-10-22 17:30 UTC found:
--   cached_news total = 45; source = 'GDELT (Global)' = 0; source = 'GDELT' = 0.
-- Running this file when the count is already zero is harmless.
--
-- Run PART 1 first. Only if it returns rows should PART 2 be run.
-- ============================================================================

-- PART 1 — read-only preflight -------------------------------------------------
select source, count(*) as rows
from public.cached_news
where source in ('GDELT (Global)', 'GDELT')
group by source
order by source;

select id, source, published_at, title
from public.cached_news
where source in ('GDELT (Global)', 'GDELT')
order by published_at desc nulls last
limit 20;

-- PART 2 — delete only the exact legacy GDELT sources ------------------------
-- The temp table exists only inside this transaction/session as a rollback
-- aid. For a persistent export, download the PART 1 result before deleting.
begin;

create temp table _legacy_gdelt_rows_backup
on commit drop
as
select *
from public.cached_news
where source in ('GDELT (Global)', 'GDELT');

delete from public.cached_news
where source in ('GDELT (Global)', 'GDELT');

-- Expected after-state: no rows returned by this count (or a 0 group).
select source, count(*) as remaining_rows
from public.cached_news
where source in ('GDELT (Global)', 'GDELT')
group by source
order by source;

commit;
