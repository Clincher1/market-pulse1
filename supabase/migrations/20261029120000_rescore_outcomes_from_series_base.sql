-- Пересчёт оценок прогнозов по правильной базовой цене.
--
-- Что было не так. Оценщик берёт base_price из строки прогноза, которую пишет
-- write-forecasts-v2-shadow в момент выпуска. Теневые снимки цен обновляются
-- дважды в сутки, а история — каждые пять минут; когда снимки отставали,
-- писатель молча записывал базу нескольких дней давности. Так прогнозы от
-- 26, 27 и 28 октября получили базу от 20-го числа, и три разных прогноза
-- показали одну и ту же доходность +11.20 %, которой на рынке не было.
--
-- Что делает миграция. Для строк, где сохранённая база расходится с рядом,
-- пересчитывает доходность, попадание и Бриер от последнего наблюдения
-- строго до даты выпуска — из того же ряда, по которому считается исход.
-- Прежние значения не теряются: они записаны в raw (previous_*).
--
-- Прогнозы не удаляются и не подгоняются: меняется только арифметика,
-- причём в сторону, которая делает результат хуже, а не лучше
-- (Brent: было «5 из 5», стало 2 из 5).

with affected as (
  select f.id as forecast_id,
         f.instrument_id,
         f.direction,
         f.score_up::numeric as score_up,
         f.base_observation_date as stored_base_date,
         o.id as outcome_id,
         o.outcome_price::numeric as outcome_price,
         o.outcome_observation_date,
         o.return_pct::numeric as old_return,
         o.direction_hit as old_hit,
         o.brier_score::numeric as old_brier,
         o.baseline_mean_daily_pct::numeric as bl_mean,
         o.baseline_volatility_daily_pct::numeric as bl_sd,
         b.observation_date as base_date,
         b.close::numeric as base_price
  from public.market_forecasts_v2 f
  join public.forecast_outcomes_v2 o on o.forecast_id = f.id and o.status = 'evaluated'
  join lateral (
    select s.observation_date, s.close
    from public.asset_price_snapshots_v2 s
    where s.instrument_id = f.instrument_id
      and s.observation_date < f.issue_date
      and s.close is not null
    order by s.observation_date desc
    limit 1
  ) b on true
  where f.base_observation_date is distinct from b.observation_date
),
calc as (
  select a.*,
         (a.outcome_price / a.base_price - 1) * 100 as new_return,
         (select count(*) from public.asset_price_snapshots_v2 s2
           where s2.instrument_id = a.instrument_id
             and s2.observation_date > a.base_date
             and s2.observation_date <= a.outcome_observation_date) as steps
  from affected a
  where a.base_price > 0 and a.outcome_price is not null
)
update public.forecast_outcomes_v2 o
set return_pct = c.new_return,
    direction_hit = case c.direction
                      when 'up' then c.new_return > 0
                      when 'down' then c.new_return < 0
                      else null
                    end,
    brier_score = case
                    when c.direction <> 'none' and c.score_up is not null and c.new_return <> 0
                    then power(c.score_up - (case when c.new_return > 0 then 1 else 0 end), 2)
                    else null
                  end,
    abnormal_return_pct = case
                            when c.bl_mean is not null and c.steps > 0
                            then c.new_return - c.bl_mean * c.steps
                            else null
                          end,
    abnormal_z = case
                   when c.bl_mean is not null and c.bl_sd is not null and c.bl_sd > 0 and c.steps > 0
                   then (c.new_return - c.bl_mean * c.steps) / (c.bl_sd * sqrt(c.steps))
                   else null
                 end,
    raw = coalesce(o.raw, '{}'::jsonb) || jsonb_build_object(
            'rescored_at', now(),
            'rescored_reason', 'stored base came from a stale price snapshot; recomputed from the same series the outcome uses',
            'previous_base_observation_date', c.stored_base_date,
            'base_observation_date', c.base_date,
            'base_price', c.base_price,
            'previous_return_pct', c.old_return,
            'previous_direction_hit', c.old_hit,
            'previous_brier_score', c.old_brier
          ),
    updated_at = now()
from calc c
where c.outcome_id = o.id;

comment on table public.forecast_outcomes_v2 is
  'Outcome rows are scored against a base taken from the same price series as the outcome. '
  'Before 2026-10-29 the base came from a writer-supplied field that could be days stale; '
  'affected rows were rescored and their previous values are kept in raw (previous_*).';
