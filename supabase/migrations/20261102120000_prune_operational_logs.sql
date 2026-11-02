-- Хранение операционных журналов ограничено 90 днями.
--
-- Зачем. База на бесплатном тарифе Supabase — 500 МБ, и при достижении лимита
-- она переходит в режим только для чтения: сайт продолжит открываться, но
-- сборщики перестанут писать, то есть данные замрут без единой ошибки на
-- странице. Замер 02.11.2026: 32,6 МБ, рост 2,7 МБ в сутки, из них
-- news_source_health_v2 — 738 строк в сутки (около 2,5 МБ за 12 дней).
--
-- Что удаляется и почему это безопасно:
--   • news_source_health_v2 — журнал попыток чтения лент (ок / 503 / пауза).
--     Окно анализа стабильности — 7 дней (site_health_check_stats_7d,
--     scripts/stability-baseline.sql), диагностика инцидентов — часы.
--     Три месяца оставляем с большим запасом;
--   • news_ingest_runs_v2 и news_cluster_runs_v2 — журналы запусков
--     конвейера: сколько источников ответило, сколько материалов пришло.
--     Нужны для разбора последних суток.
--
-- Что НЕ удаляется и не будет: сами новости и всё, что из них выведено —
-- cached_news, news_articles_shadow, news_events_shadow,
-- news_event_articles_shadow, event_price_impacts_v2, архив прогнозов
-- (market_forecasts_v2, forecast_outcomes_v2), снимки дня, точки цен. Это и
-- есть история проекта; её нельзя терять ради места.
--
-- Запуск: ежедневно, 03:20 UTC — рядом с уже существующей задачей
-- site-health-prune (03:40 UTC, site_health > 60 дней).

create or replace function public.prune_operational_logs(
  keep_health_days integer default 90,
  keep_runs_days integer default 90
)
returns table (tbl text, deleted bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  removed bigint;
begin
  if keep_health_days < 30 or keep_runs_days < 30 then
    -- Защита от случайного вызова с нулём: без неё один неверный параметр
    -- снёс бы весь журнал, по которому разбираются инциденты.
    raise exception 'retention must be at least 30 days (got % and %)',
      keep_health_days, keep_runs_days;
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
end;
$$;

comment on function public.prune_operational_logs(integer, integer) is
  'Удаляет операционные журналы старше N дней (минимум 30). Новости, события и архив прогнозов не трогает.';

-- Расписание: раз в сутки, 03:20 UTC. Как и в остальных миграциях проекта,
-- задача сначала снимается, если уже стоит: повторное применение не создаёт
-- дубль и не оставляет две чистки, гоняющиеся друг за другом.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'prune-operational-logs') then
    perform cron.unschedule('prune-operational-logs');
  end if;
end $$;

select cron.schedule(
  'prune-operational-logs',
  '20 3 * * *',
  $$select public.prune_operational_logs(90, 90);$$
);
