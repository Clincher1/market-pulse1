-- Пейсинг источников: минимальный интервал между попытками, минуты.
--
-- Зачем колонка, а не константа в коде. За 04–11.11.2026 у
-- reuters-google-business было 201 настоящая попытка: 63 ответа 200,
-- 138 ответов 503. Ещё 135 запусков съела пауза после четырёх отказов
-- подряд. То есть посредник отказывает не «иногда», а по расписанию своей
-- нагрузки, и единственный рычаг, который у нас есть, — частота запросов.
-- Частоту надо менять без выката функции и с объяснением рядом с источником,
-- поэтому она живёт в данных.
--
-- null — ограничения нет, спрашиваем на каждом запуске крона (раз в 30 минут).

alter table public.news_sources_v2
  add column if not exists poll_interval_minutes integer;

alter table public.news_sources_v2
  drop constraint if exists news_sources_v2_poll_interval_positive;

alter table public.news_sources_v2
  add constraint news_sources_v2_poll_interval_positive
  check (poll_interval_minutes is null or (poll_interval_minutes >= 5 and poll_interval_minutes <= 1440));

comment on column public.news_sources_v2.poll_interval_minutes is
  'Минимальный интервал между настоящими попытками, минуты. Пропуск по пейсингу пишется в news_source_health_v2 с paused = true и не считается отказом источника.';

-- Reuters через Google News: 138 отказов 503 из 201 попытки. Спрашиваем раз в
-- час вместо раза в полчаса — вдвое меньше запросов, материал при этом не
-- теряется мгновенно: сайт держит 19 других лент.
update public.news_sources_v2
set poll_interval_minutes = 60,
    updated_at = now()
where id = 'reuters-google-business';
