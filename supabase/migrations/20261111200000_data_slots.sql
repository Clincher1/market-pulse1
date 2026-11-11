-- Реестр слотов и выбор источника владельцем.
--
-- Слот — величина на сайте, которая приходит из внешнего источника, вместе со
-- всеми колонками, которые от неё зависят. Номер слота постоянный: по нему
-- говорят «слот 4 — золото». Реестр в коде лежит в
-- `supabase/functions/_shared/slots.ts`, здесь его копия — чтобы страница
-- состояния могла показать номера и выбор без выката.
--
-- Копия заполняется не руками и не этим файлом: писатель цен синхронизирует
-- её из кода при каждом запуске (`syncSlotRegistry` в update-assets). Проверка
-- `slots_registry` в selfcheck сверяет базу с кодом и краснеет, если копия
-- отстала, — то есть если синхронизация перестала работать. Именно
-- расхождение делает мониторинг ложным: на экране один источник, в работе
-- другой.

create table if not exists public.data_slot_registry (
  slot_id text primary key,
  number integer not null unique,
  section text not null,
  title text not null,
  kind text not null check (kind in ('price', 'indicator', 'feeds', 'derived')),
  columns jsonb not null,
  can_choose boolean not null,
  sources jsonb not null,
  note text not null,
  updated_at timestamptz not null default now()
);

comment on table public.data_slot_registry is
  'Нумерованный реестр величин сайта и их источников. Копия supabase/functions/_shared/slots.ts; расхождение ловит проверка slots_registry.';
comment on column public.data_slot_registry.number is
  'Постоянный номер слота. Не переиспользуется: выбывший слот остаётся выбывшим.';
comment on column public.data_slot_registry.can_choose is
  'Может ли владелец выбрать источник сам. false означает, что замена была бы подменой инструмента.';
comment on column public.data_slot_registry.columns is
  'Колонки сайта, которые зависят от этого источника: цена, изменение, линия, дата наблюдения.';

alter table public.data_slot_registry enable row level security;

-- Читать реестр может кто угодно: в нём нет ни секретов, ни данных, только
-- описание «что откуда берётся». Писать — только сервисный ключ.
drop policy if exists data_slot_registry_read on public.data_slot_registry;
create policy data_slot_registry_read on public.data_slot_registry
  for select to anon, authenticated using (true);
revoke insert, update, delete on public.data_slot_registry from anon, authenticated;
grant select on public.data_slot_registry to anon, authenticated;

-- Выбор владельца: какой источник слот спрашивает первым.
--
-- Почему не в коде и не в секрете. Источник меняется по живой причине — нас
-- стали медленно пускать, биржа сменила адрес, — и это решение владельца, а не
-- выкат. Таблица даёт менять его одной строкой и сразу видеть на странице
-- состояния.
create table if not exists public.source_preferences (
  slot_id text not null references public.data_slot_registry(slot_id) on delete cascade,
  source_id text not null,
  priority integer not null default 1,
  enabled boolean not null default true,
  chosen_by text not null default 'owner',
  chosen_at timestamptz not null default now(),
  primary key (slot_id, source_id)
);

comment on table public.source_preferences is
  'Выбор владельца: какой источник слот спрашивает первым. Пусто — действует порядок по умолчанию из реестра.';
comment on column public.source_preferences.enabled is
  'false убирает источник из списка совсем, а не в конец: иначе пауза и отказ вернули бы его наверх.';
comment on column public.source_preferences.priority is
  'Меньше — раньше. Выбранный источник спрашивается первым, остальные остаются запасными.';

alter table public.source_preferences enable row level security;

drop policy if exists source_preferences_read on public.source_preferences;
create policy source_preferences_read on public.source_preferences
  for select to anon, authenticated using (true);
revoke insert, update, delete on public.source_preferences from anon, authenticated;
grant select on public.source_preferences to anon, authenticated;

-- Мониторинг: расход и паузы в человеческом виде.
--
-- Сама `asset_source_state` закрыта от анонимного ключа: там текст последней
-- ошибки, и показывать его всему интернету незачем. А вот расход и пауза —
-- это то, что владелец должен видеть на странице состояния, поэтому наружу
-- отдаются только пять полей.
create or replace view public.source_politeness_view as
select
  state.source_id,
  state.requests_today,
  state.day,
  state.last_status,
  state.last_ok_at,
  state.last_attempt_at,
  state.consecutive_failures,
  state.paused_until,
  case
    when state.paused_until is not null and state.paused_until > now() then 'paused'
    when state.last_status = 200 then 'ok'
    when state.last_status is null then 'idle'
    else 'failing'
  end as verdict
from public.asset_source_state state;

comment on view public.source_politeness_view is
  'Расход и паузы по источникам без текста ошибок — то, что видно на странице состояния.';

revoke all on public.source_politeness_view from anon, authenticated;
grant select on public.source_politeness_view to anon, authenticated;

-- Кто именно кормит каждый слот: соединение реестра и предпочтений в одном
-- месте, чтобы страница не склеивала это сама.
create or replace view public.slot_sources_view as
select
  registry.number,
  registry.slot_id,
  registry.section,
  registry.title,
  registry.can_choose,
  source.value->>'id' as source_id,
  coalesce(preference.enabled, true) as chosen,
  preference.priority,
  case
    when not registry.can_choose then 'источник задан: замена была бы подменой инструмента'
    when preference.slot_id is null then 'по умолчанию'
    when preference.enabled then 'выбран вручную'
    else 'выключен вручную'
  end as why
from public.data_slot_registry registry
cross join lateral jsonb_array_elements(registry.sources) as source(value)
left join public.source_preferences preference
  on preference.slot_id = registry.slot_id
 and preference.source_id = source.value->>'id';

comment on view public.slot_sources_view is
  'Слот → допустимые источники → выбор владельца. На этом строится страница «Слоты и источники».';

revoke all on public.slot_sources_view from anon, authenticated;
grant select on public.slot_sources_view to anon, authenticated;

