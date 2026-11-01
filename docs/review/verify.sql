-- Проверки к чеклисту из пакета (docs/review/Market-Pulse-…-.md, §8).
--
-- Запускать в SQL-редакторе Supabase (проект hekzplfftannlzwvgwwm) или через psql.
-- Ничего не меняет: только SELECT. Каждый блок подписан тем же номером, что и
-- шаг чеклиста, чтобы результат можно было сверить с пакетом построчно.
--
-- Ожидаемые значения — из снимка 01.11.2026. Через неделю они, разумеется,
-- сдвинутся: тогда сверяется не «равно», а «сходится с тем, что на странице».

-- 1–2. Плитки: цена, изменение, дата наблюдения.
--      Ожидание: 5 строк; as_of 30.10 у brent/usd-eur/sp500, 31.10 у gold, 01.11 у btc.
select id, name, price, change, as_of, updated_at
from public.cached_assets
order by id;

-- 1–2 (продолжение). Разница между «когда записали» и «когда наблюдали».
--      Больше 4 суток по будням — повод разбираться, а не норма.
select id,
       as_of::date                                                as observation_date,
       (now() at time zone 'Europe/Moscow')::date - as_of::date   as observation_age_days,
       round(extract(epoch from (now() - updated_at)) / 60)       as cache_age_min
from public.cached_assets
order by id;

-- 5. Шкала напряжённости: значение, подпись, размер выборки, время расчёта.
--    Ожидание: value 15, label «Холодно», news_count 120, updated_at 19:00 МСК.
select value, label, news_count,
       to_char(updated_at at time zone 'Europe/Moscow', 'YYYY-MM-DD HH24:MI') as calculated_msk,
       to_char(sample_newest at time zone 'Europe/Moscow', 'YYYY-MM-DD HH24:MI') as newest_news_msk,
       history_stats
from public.cached_tension;

-- 6. Пересчёт индекса тем же правилом, что в §4.2: доля негатива,
--    взвешенная на важность и уверенность. Ожидание: 15 ± 1.
with sample as (
  select interest, greatest(0, -sentiment) as neg
  from (
    select coalesce(importance, 0)::numeric * coalesce(confidence, 0)::numeric as interest,
           coalesce(sentiment, 0)::numeric as sentiment
    from public.cached_news
    where published_at > now() - interval '24 hours'
      and coalesce(importance, 0) >= 3
      and coalesce(confidence, 0) >= 0.5
      and source not in ('GDELT', 'GDELT (Global)')
  ) s
)
select round(100 * sum(neg * interest) / nullif(sum(interest), 0)) as recalculated_index,
       count(*)                                                   as items_in_sample
from sample;

-- 6 (продолжение). Сколько материалов реально лежит за сутки — это не то же
-- число, что news_count: окно шкалы скользящее и фильтры другие. Ожидание: 150–170.
select source, count(*) as items_24h,
       round(avg(sentiment)::numeric, 3) as avg_sentiment,
       count(*) filter (where sentiment < -0.3) as negative
from public.cached_news
where published_at > now() - interval '24 hours'
group by source
order by items_24h desc;

-- 7. Паспорт дня: шесть записей, за 01.11 — 21 балл и 71 новость.
--    Записи не перезаписываются, поэтому captured_at у прошлых дней не меняется.
select date,
       to_char(captured_at at time zone 'Europe/Moscow', 'YYYY-MM-DD HH24:MI') as captured_msk,
       tension->>'value'      as tension,
       tension->>'label'      as tension_label,
       tension->>'news_count' as news_in_sample
from public.daily_snapshots
order by date desc;

-- 10. Последний прогон самопроверки: 19 проверок, все ok = true.
select to_char(checked_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as checked_utc,
       count(*)                                              as checks_total,
       count(*) filter (where (k.value->>'ok') = 'true')      as checks_ok,
       string_agg(k.key, ', ') filter (where (k.value->>'ok') <> 'true') as failed
from public.site_health, jsonb_each(checks) k
where checked_at = (select max(checked_at) from public.site_health)
group by checked_at;

-- 10 (подробности). Подпись каждой проверки в последнем прогоне.
select k.key as check_name,
       (k.value->>'ok')            as ok,
       left(k.value->>'detail', 160) as detail
from public.site_health, jsonb_each(checks) k
where checked_at = (select max(checked_at) from public.site_health)
order by k.key;

-- 11. Окно семи дней по 19 живым проверкам. Мёртвые имена остановленного
--     блока прогнозов отброшены явно, а не «как получится». Ожидание: 5 провалов.
with live as (
  select unnest(array[
    'tension_matches', 'news_fresh', 'sample_size', 'assets_fresh', 'assets_asof',
    'asset_dates', 'asset_change_truth', 'asset_names', 'asset_history_panel',
    'snapshot_taken', 'feeds_fresh', 'no_third_party', 'site_online', 'ru_insights',
    'ru_history_api', 'no_telemetry', 'market_memory', 'sentry', 'brief_image'
  ]) as check_name
)
select s.check_name, s.samples, s.ok_samples, s.samples - s.ok_samples as fails,
       to_char(s.last_fail_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as last_fail_utc
from public.site_health_check_stats_7d s
join live l on l.check_name = s.check_name
order by (s.samples - s.ok_samples) desc, s.check_name;

-- 12. «Память рынка»: сколько событий собрано и на какой стадии.
select * from public.market_memory_stats_v1;

-- 13. Реестр инструментов: чем подписан каждый ряд и откуда он берётся.
select asset_key, id, provider, provider_symbol, instrument_type, unit, is_primary, enabled
from public.asset_instruments_v2
order by asset_key, is_primary desc;

-- 14. Датированные закрытия пяти активов: точки только там, где их отдал источник.
select asset_key, count(*) as points,
       min(observation_date) as first_date,
       max(observation_date) as last_date
from public.asset_price_history_v1
group by asset_key
order by asset_key;
