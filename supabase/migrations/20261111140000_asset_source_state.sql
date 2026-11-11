-- Память шлюза: сколько запросов сделано сегодня, сколько отказов подряд,
-- до какого момента источник на паузе.
--
-- Зачем таблица, а не переменная в функции. Edge-функция — не процесс:
-- каждый запуск это новый изолят, и помнить между вызовами ему нечем.
-- Без общей памяти пауза после отказов не наступала: источник, трижды
-- ответивший 429, спрашивался снова через 15 минут, а счётчик запросов
-- не существовал вовсе.
--
-- Почему не в vault и не в секрете: это не секрет, это телеметрия, и её
-- должен видеть selfcheck и любой человек в SQL-редакторе.

create table if not exists public.asset_source_state (
  source_id text primary key,
  last_attempt_at timestamptz,
  last_ok_at timestamptz,
  last_status integer,
  consecutive_failures integer not null default 0,
  paused_until timestamptz,
  requests_today integer not null default 0,
  day date,
  last_error text,
  updated_at timestamptz not null default now()
);

comment on table public.asset_source_state is
  'Состояние шлюза к внешним источникам цен: квота на сутки UTC, серия отказов, пауза. Пишется update-assets, читается selfcheck.';
comment on column public.asset_source_state.requests_today is
  'Запросов за календарный день `day` по UTC. Сбрасывается в полночь.';
comment on column public.asset_source_state.paused_until is
  'До этого момента источник не спрашивают. Ставится после трёх отказов подряд или по заголовку Retry-After.';

-- Таблица — служебная: анонимному ключу в ней делать нечего.
alter table public.asset_source_state enable row level security;
revoke all on public.asset_source_state from anon, authenticated;
