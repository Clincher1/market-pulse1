-- Выдача прогнозов остановлена 31.10.2026.
--
-- Почему: на 26 оценённых исходах доля попаданий — 46,2 %, счёт Брайера —
-- 0,3996 против 0,25 у подбрасывания монетки. Прогноз хуже случайного нельзя
-- показывать как ожидание, поэтому расписания, которые его производили,
-- снимаются.
--
-- Данные прошлых прогнозов НЕ удаляются: market_forecasts_v2 и
-- forecast_outcomes_v2 остаются архивом, который нельзя переписать задним
-- числом, а «Память рынка» продолжает показывать историю вместе с промахами.
--
-- Снимаются три задачи:
--   update-forecasts-every-15-min — писатель публичных ожиданий;
--   shadow-write-forecasts-v2    — теневой писатель тех же ожиданий;
--   shadow-evaluate-forecasts-v2 — их проверка (проверять больше нечего).
-- Остальные этапы теневого конвейера (новости, кластеризация, классификация,
-- цены, оценка событий) продолжают работать: они питают «Память рынка».

do $$
declare
  job_name text;
begin
  foreach job_name in array array[
    'update-forecasts-every-15-min',
    'shadow-write-forecasts-v2',
    'shadow-evaluate-forecasts-v2'
  ]
  loop
    if exists (select 1 from cron.job where jobname = job_name) then
      perform cron.unschedule(job_name);
      raise notice 'снято расписание %', job_name;
    else
      raise notice 'расписания % уже нет', job_name;
    end if;
  end loop;
end $$;
