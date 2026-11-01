-- Замер стабильности: один запрос, один и тот же набор чисел каждый раз.
--
-- Зачем: «сайт стабилен?» — вопрос про окно, а не про мгновение. Чтобы
-- сравнивать через неделю, нужны те же метрики, посчитанные так же. Поэтому
-- все числа здесь подписаны (metric / value) и собираются одним запросом:
-- результат можно скопировать целиком и сравнить построчно.
--
-- Как снимать: выполнить целиком, сохранить вывод с датой. Через неделю —
-- выполнить снова и сравнить с предыдущим выводом.
--
-- Чего здесь нет и почему:
--   • net._http_response (ответы edge-функций) хранится только несколько часов,
--     поэтому «сколько раз упал писатель цен» за неделю по нему не восстановить.
--     Вместо этого берётся журнал pg_cron: попытка запуска есть всегда;
--   • числа с живых страниц (сколько новостей на экране) — это не стабильность,
--     это контент; их смотрит самопроверка (site_health).

with
  health_24h as (
    select checked_at, checks
    from public.site_health
    where checked_at > now() - interval '24 hours'
  ),
  health_24h_counts as (
    select
      count(*) as runs,
      count(*) filter (
        where exists (
          select 1 from jsonb_each(checks) k where (k.value->>'ok') = 'false'
        )
      ) as runs_with_failure
    from health_24h
  ),
  -- Пять имён остались в окне от остановленного 31.10.2026 блока прогнозов.
  -- Их кода больше нет, на странице состояния они не показываются, а в истории
  -- лежат только старые записи. Считать по ним «долю успеха» — значит мерить
  -- мёртвое; поэтому живые проверки перечислены явно, а не «всё, кроме одного».
  live_checks as (
    select unnest(array[
      'tension_matches', 'news_fresh', 'sample_size', 'assets_fresh', 'assets_asof',
      'asset_dates', 'asset_change_truth', 'asset_names', 'asset_history_panel',
      'snapshot_taken', 'feeds_fresh', 'no_third_party', 'site_online', 'ru_insights',
      'ru_history_api', 'no_telemetry', 'market_memory', 'sentry', 'brief_image'
    ]) as check_name
  ),
  stats_7d as (
    select
      sum(s.samples) as samples,
      sum(s.ok_samples) as ok_samples
    from public.site_health_check_stats_7d s
    join live_checks l on l.check_name = s.check_name
  ),
  stats_7d_trouble as (
    select string_agg(
             s.check_name || ' ' || s.ok_samples || '/' || s.samples,
             ', ' order by (s.samples - s.ok_samples) desc, s.check_name
           ) as trouble
    from public.site_health_check_stats_7d s
    join live_checks l on l.check_name = s.check_name
    where s.ok_samples < s.samples
  ),
  cron_7d as (
    select
      count(*) as runs,
      count(*) filter (where d.status = 'failed') as failed
    from cron.job_run_details d
    join cron.job j on j.jobid = d.jobid
    where d.start_time > now() - interval '7 days'
  ),
  -- Строки запусков удалённых задач: они остались в журнале, но к нынешним
  -- задачам не относятся. Считаем отдельно, чтобы «запусков за неделю» не
  -- прыгало от одной только чистки расписания.
  cron_orphans_7d as (
    select count(*) as runs
    from cron.job_run_details d
    left join cron.job j on j.jobid = d.jobid
    where d.start_time > now() - interval '7 days'
      and j.jobid is null
  ),
  assets as (
    select
      round(max(extract(epoch from (now() - updated_at)) / 60)) as max_age_min,
      round(max(extract(epoch from (now() - as_of)) / 86400)::numeric, 1) as max_observation_days,
      count(*) as rows
    from public.cached_assets
  ),
  feeds_24h as (
    select
      s.name,
      count(h.*) as runs,
      count(h.*) filter (where h.ok) as ok_runs,
      round(100.0 * count(h.*) filter (where h.ok) / nullif(count(h.*), 0), 1) as ok_pct
    from public.news_sources_v2 s
    left join public.news_source_health_v2 h
      on h.source_id = s.id
     and h.created_at > now() - interval '24 hours'
     and h.paused = false
    where s.enabled
    group by s.name
  ),
  news_24h as (
    select
      count(*) as items,
      round(extract(epoch from (now() - max(published_at))) / 3600.0, 1) as newest_age_h
    from public.cached_news
    where published_at > now() - interval '24 hours'
  )
select 'checked_at_utc' as metric, to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as value
union all select 'health_runs_24h', (select runs::text from health_24h_counts)
union all select 'health_runs_with_failure_24h', (select runs_with_failure::text from health_24h_counts)
union all select 'checks_7d_total', (select samples::text from stats_7d)
union all select 'checks_7d_ok', (select ok_samples::text from stats_7d)
union all select 'checks_7d_ok_pct', (
  select round(100.0 * ok_samples / nullif(samples, 0), 1)::text from stats_7d
)
union all select 'checks_7d_trouble', coalesce((select trouble from stats_7d_trouble), 'нет')
union all select 'cron_runs_7d', (select runs::text from cron_7d)
union all select 'cron_failed_7d', (select failed::text from cron_7d)
union all select 'cron_orphan_runs_7d', (select runs::text from cron_orphans_7d)
union all select 'assets_rows', (select rows::text from assets)
union all select 'assets_max_cache_age_min', (select max_age_min::text from assets)
union all select 'assets_max_observation_days', (select max_observation_days::text from assets)
union all select 'feeds_worst_24h', coalesce((
  select name || ' ' || coalesce(ok_pct::text, 'нет запусков')
  from feeds_24h order by ok_pct asc nulls first, name limit 1
), 'нет лент')
union all select 'feeds_below_90pct_24h', coalesce((
  select string_agg(name || ' ' || coalesce(ok_pct::text, 'нет запусков'), ', ' order by name)
  from feeds_24h where ok_pct is null or ok_pct < 90
), 'нет')
union all select 'news_items_24h', (select items::text from news_24h)
union all select 'news_newest_age_h', (select newest_age_h::text from news_24h)
order by metric;
