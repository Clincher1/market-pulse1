-- Аудит по окнам времени. Запускать целиком: каждая выборка отвечает на свой
-- вопрос, вместе они отделяют задержку источника от поломки.
--
-- Как читать: см. docs/TIME-WINDOW-AUDIT.md. Пороги и выводы — там же.
-- Повторный запуск через час должен дать те же числа с точностью до одного
-- прогона: если картина меняется скачком, значит смотрим не на тренд, а на шум.

-- 1. Сколько раз каждая проверка проходила и падала за 7 дней.
--    Считается в базе (view), потому что история — это jsonb с деталями.
select check_name,
       samples,
       ok_samples,
       samples - ok_samples as fails,
       last_fail_at
from public.site_health_check_stats_7d
order by (samples - ok_samples) desc, check_name;

-- 2. Возраст котировок и новостей в каждом часовом прогоне: среднее, максимум,
--    сколько раз приближались к порогу.
with h as (
  select checked_at, checks
  from public.site_health
  where checked_at > now() - interval '7 days'
),
assets as (
  select checked_at, (regexp_match(checks->'assets_fresh'->>'detail', '([0-9]+) мин'))[1]::int as minutes
  from h where checks ? 'assets_fresh'
),
news as (
  select checked_at, (regexp_match(checks->'news_fresh'->>'detail', '([0-9.]+) ч'))[1]::numeric as hours
  from h where checks ? 'news_fresh'
)
select
  (select count(*) from assets) as assets_samples,
  (select round(avg(minutes)::numeric, 1) from assets) as assets_avg_min,
  (select max(minutes) from assets) as assets_max_min,
  (select count(*) from assets where minutes > 30) as assets_over_30_min,
  (select round(avg(hours)::numeric, 2) from news) as news_avg_h,
  (select max(hours) from news) as news_max_h,
  (select count(*) from news where hours > 3) as news_over_3_h;

-- 3. Писатели: сколько запусков было и сколько упало.
--    ВАЖНО: status = 'succeeded' здесь означает «pg_cron выполнил SQL и отправил
--    HTTP-запрос», а не «функция вернула 200». Что данные реально дошли,
--    показывают проверки из запроса 1 и возраст из запроса 2.
select j.jobname,
       count(*) as runs,
       count(*) filter (where d.status <> 'succeeded') as failed_runs,
       max(d.start_time) as last_run
from cron.job_run_details d
join cron.job j on j.jobid = d.jobid
where d.start_time > now() - interval '48 hours'
group by j.jobname
order by runs desc;

-- 4. Провалы с временем и текстом: видно, был ли это один час или серия.
with flat as (
  select s.checked_at, e.key as check_name, (e.value->>'ok')::boolean as ok, e.value->>'detail' as detail
  from public.site_health s
  cross join jsonb_each(s.checks) e
  where s.checked_at > now() - interval '7 days'
)
select checked_at, check_name, left(detail, 160) as detail
from flat
where not ok
order by checked_at desc
limit 30;

-- 5. Доставка по источникам за сутки: у каждой включённой ленты — когда
--    последний успешный и последний новый материал.
select source_id,
       max(created_at) as last_ok,
       count(*) as probes
from public.news_source_health_v2
where created_at > now() - interval '24 hours'
  and ok
group by source_id
order by last_ok asc;
