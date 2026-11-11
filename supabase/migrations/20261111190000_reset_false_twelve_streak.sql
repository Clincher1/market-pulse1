-- Разовая правка данных, а не схемы: писатель цен записывал «отказ» источнику
-- истории Twelve Data каждый раз, когда историю не спрашивали по расписанию
-- (раз в час). К 18:40 UTC 11.11.2026 у него накопилось 2 ложных отказа при
-- last_status = null, то есть при полном отсутствии ответа источника. Через
-- третий такой запуск шлюз поставил бы паузу 120 минут источнику, который ни
-- разу не отказывал.
--
-- Код исправлен: не спросили — состояние не трогаем. Здесь убирается след,
-- который уже успел записаться. Счётчик запросов (requests_today) не
-- трогаем: запросы действительно были.

update public.asset_source_state
set consecutive_failures = 0,
    last_status = null,
    last_error = null,
    updated_at = now()
where source_id = 'twelve'
  and consecutive_failures > 0
  and last_status is null;

comment on table public.asset_source_state is
  'Состояние шлюза к внешним источникам цен: квота на сутки UTC, серия отказов, пауза. Пишется update-assets, читается selfcheck.';
