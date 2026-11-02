-- Обрезка upstream-полезной нагрузки у старых статей.
--
-- Замер 02.11.2026 по news_articles_shadow (7 554 строки):
--   description — 24,2 % объёма, title 8,0 %, normalized_title 7,9 %,
--   url+canonical_url+guid 20,3 %, raw — 22,0 %.
--
-- Поле raw хранит ответ ленты «как пришёл»: rss-разметку, guid, категории.
-- Ни одна функция, ни один API и ни одно представление проекта его не
-- читают (проверено: в supabase/functions только запись, в select-ах его нет;
-- публичные представления из 20261022203000_market_memory_public_views.sql
-- отдают ограниченный набор колонок). Оно нужно, пока разбирают свежий
-- источник — то есть дни, а не месяцы.
--
-- Поэтому raw обнуляется через 30 дней, а всё, что используется в расчётах и
-- на странице — title, description, url, published_at, source — остаётся
-- навсегда. Экономия ~0,45 МБ в сутки при текущем потоке (971 статья в
-- сутки), около 22 % роста таблицы статей.
--
-- Честная оговорка: UPDATE не уменьшает файл таблицы, он оставляет мёртвые
-- версии строк. Autovacuum переиспользует это место под новые вставки, так что
-- рост замедлится, но pg_total_relation_size сразу после обрезки не упадёт.
-- Для этой базы этого достаточно: цель — не дать вырасти до 500 МБ, а не
-- освободить место здесь и сейчас.

create or replace function public.prune_operational_logs(
  keep_health_days integer default 90,
  keep_runs_days integer default 90,
  keep_raw_days integer default 30
)
returns table (tbl text, deleted bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  removed bigint;
begin
  if keep_health_days < 30 or keep_runs_days < 30 or keep_raw_days < 7 then
    -- Защита от случайного вызова с нулём: без неё один неверный параметр
    -- снёс бы журнал, по которому разбираются инциденты, или raw у статей,
    -- которые ещё могут понадобиться для разбора источника.
    raise exception 'retention out of range: health=%, runs=%, raw=%',
      keep_health_days, keep_runs_days, keep_raw_days;
  end if;

  delete from public.news_source_health_v2
   where created_at < now() - make_interval(days => keep_health_days);
  get diagnostics removed = row_count;
  tbl := 'news_source_health_v2'; deleted := removed; return next;

  delete from public.news_ingest_runs_v2
   where started_at < now() - make_interval(days => keep_runs_days);
  get diagnostics removed = row_count;
  tbl := 'news_ingest_runs_v2'; deleted := removed; return next;

  delete from public.news_cluster_runs_v2
   where started_at < now() - make_interval(days => keep_runs_days);
  get diagnostics removed = row_count;
  tbl := 'news_cluster_runs_v2'; deleted := removed; return next;

  -- Перезаписываем только строки, где raw ещё не пустой: иначе каждый запуск
  -- трогал бы всю историю и плодил мёртвые версии строк без пользы.
  update public.news_articles_shadow
     set raw = '{}'::jsonb
   where fetched_at < now() - make_interval(days => keep_raw_days)
     and raw is not null
     and raw <> '{}'::jsonb;
  get diagnostics removed = row_count;
  tbl := 'news_articles_shadow.raw'; deleted := removed; return next;
end;
$$;

comment on function public.prune_operational_logs(integer, integer, integer) is
  'Чистка: журналы старше N дней и upstream-raw у статей старше M дней. Новости, события, описания и архив прогнозов не удаляет.';

do $$
begin
  if exists (select 1 from cron.job where jobname = 'prune-operational-logs') then
    perform cron.unschedule('prune-operational-logs');
  end if;
end $$;

select cron.schedule(
  'prune-operational-logs',
  '20 3 * * *',
  $$select public.prune_operational_logs(90, 90, 30);$$
);
