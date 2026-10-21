# Supabase: карта бэкенда и пошаговый план

Этот документ объединяет анализ фронтенда (код в этом репозитории)
и карту бэкенда из Supabase Dashboard. Фронт читает только готовый
кэш; вся «кухня» — в Edge Functions, которых пока нет в Git.

## Инвентарь бэкенда (Supabase, тариф FREE, проект Market Pulse)

Edge Functions (код нужно выгрузить в `supabase/functions/`):

| Функция | Предполагаемая роль | Статус |
|---|---|---|
| `update-news` | Новости (RSS/GDELT + Groq) -> `cached_news` | работает |
| `update-assets` | Котировки -> `cached_assets` | работает, есть вопрос Brent/USO |
| `update-tension` | Индекс напряжённости -> `cached_tension` | работает, история строится неверно |
| `update-tension-index` | Дубль/легаси пары выше -> `tension_history` | пишет строку каждые ~15 мин вместо 1/день |
| `update-forecasts` | Прогнозы -> `cached_forecasts` | работает |
| `proxy` | Неизвестно; фронт её не вызывает | кандидат на отключение после аудита |

Таблицы (public): `cached_news`, `cached_assets`, `cached_tension`,
`cached_forecasts` (читает фронт), `tension_history`, `news_blacklist`
(служебные). Unique-констрейнтов, кроме PK по `id`, нет.

Подтверждённые факты о данных (21.10.2026):
- `tension_history`: 59 строк на 3 даты; 57 строк за один день.
- `cached_tension.history`: 7 одинаковых точек одного дня.
- `cached_news`: заголовки могут содержать HTML-сущности (`&apos;`).
- Актив `brent` приходит как «USO (Нефть)» с ценой ETF USO.
- Все 6 таблиц читаются публичным (publishable) ключом.

## Этап A — собрать факты (ничего не меняет в проде)

Если Supabase подключён к Arena как коннектор — часть шагов ниже
ассистент выполнит сам. Если нет — вручную:

1. Edge Functions: выгрузить код всех 6 функций (все файлы, включая
   `deno.json`/`_shared`), записать для каждой число вызовов/ошибок
   за 24 ч и состояние **Verify JWT**.
2. Secrets: переписать только ИМЕНА переменных. Значения не нужны.
3. Расписания: Integrations/Cron или
   `select jobid, jobname, schedule, active from cron.job;`
   (колонку `command` целиком никому не отправлять — там может быть ключ).
4. Выполнить `supabase/diagnostics.sql` в SQL Editor (только SELECT)
   и сохранить результаты.
5. Table Editor: экспорт CSV всех 6 таблиц себе на диск.

## Этап B — исправления (после этапа A, одним окном)

Сначала деплой переписанных функций, сразу затем SQL-миграция:

- Одна каноническая tension-функция: 1 строка `tension_history` на дату
  (upsert), `cached_tension.history` — последние 7 различных дат,
  последняя точка равна текущему значению. Вторая функция отключается.
- `update-news`: декодирование сущностей до записи, dedupe/upsert по
  каноническому `url`, clamp `sentiment/importance/confidence`.
- `update-assets`: честность Brent vs USO и единый масштаб цен
  (фронт цены не пересчитывает).
- `proxy`: отключить, если не используется, либо защитить авторизацией.
- SQL: dedupe -> `UNIQUE(tension_history.date)`, `UNIQUE(cached_news.url)`,
  unique фразы blacklist, `created_at` -> `timestamptz`, check-диапазоны,
  индекс `cached_news(published_at desc)`, триггер `updated_at`.
- RLS: включить везде; anon = только SELECT на 4 `cached_*` таблицы;
  `tension_history` и `news_blacklist` публичному ключу не отдавать.
  Edge Functions пишут через `service_role`, который RLS обходит.

## Чего нельзя делать до этапа B

- Включать RLS без политик (сайт мгновенно останется без данных).
- Добавлять unique-констрейнты (уронят INSERT-ы нынешних кронов).
- Править цены/имена в Table Editor (перезапишет следующий запуск).
- Удалять tension-функции до сравнения их кода.
- Отправлять в чаты значения секретов и ключей.
