# Market Pulse — аналитика новостей и рынков

Одностраничный дашборд: шкала напряжённости мира, ключевые активы,
AI-лента новостей (тональность / важность / уверенность) и прогнозы по активам.

Живой сайт: https://market-pulse1-eta.vercel.app/

## Стек

- Vite + React 18 + TypeScript
- TailwindCSS, Recharts (графики), Framer Motion (анимации), Lucide (иконки)
- Supabase — фронт читает готовый кэш из таблиц `cached_*`
  (заполняет таблицы внешний бэкенд/расписание, его нет в этом репозитории)

## Запуск

```bash
npm install
npm run dev
```

Другие команды:

```bash
npm run build      # typecheck + production-сборка в dist/
npm run typecheck  # только проверка типов TypeScript
npm run lint       # ESLint
npm run preview    # предпросмотр production-сборки
```

## Настройка Supabase

Клиент создаётся один раз в `src/lib/supabase.ts`. По умолчанию используются
URL и публичный (publishable/anon) ключ текущего проекта — сайт работает
без настройки. Чтобы подключить свой проект Supabase, скопируйте
`.env.example` в `.env` (или задайте переменные в StackBlitz / Vercel):

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_publishable_anon_key
```

> Publishable-ключ в клиентском коде допустим только при включённом RLS:
> анонимным пользователям должен быть разрешён только `SELECT` из таблиц ниже.

## Ожидаемые таблицы Supabase

| Таблица | Колонки, которые читает фронт |
|---|---|
| `cached_assets` | `id, name, price, change, sparkline` |
| `cached_news` | `id, source, time, title, summary, url, published_at, impacts, sentiment, importance, confidence, topic` |
| `cached_tension` | строка `id = 1`: `value, label, history, news_count` |
| `cached_forecasts` | `id, asset, direction, probability, time_window, confidence, reason, updated_at` |

Фронт обновляет данные каждые 5 минут.

## Структура

```
src/
  components/   Header, TensionScale, KeyAssets, NewsFeed, Forecasts, Footer
  data/         mockData.ts (типы + fallback), live*.ts (загрузка из Supabase)
  hooks/        useLiveAssets, useLiveNews
  lib/          supabase.ts — единый клиент Supabase
public/         favicon.svg, og-image.png
```

## Бэкенд (Supabase Edge Functions — кода в репозитории пока нет)

Таблицы заполняют 6 Edge Functions (`update-news`, `update-assets`,
`update-tension`, `update-tension-index`, `update-forecasts`, `proxy`),
которые существуют только в Supabase Dashboard. Полная карта бэкенда,
подтверждённые проблемы в данных и пошаговый план починки:
**`docs/SUPABASE_STEP_BY_STEP.md`**, диагностические SQL-запросы:
**`supabase/diagnostics.sql`**.

Кратко о главном: фронт от проблем бэкенда защищается (дубли дней
истории схлопываются в `liveTension.ts`, HTML-сущности декодируются
в `liveNews.ts`, цены показываются как есть без пересчёта), но чинить
их правильно — в функциях и миграциях, строго в порядке из плана.

## Деплой

Vercel, framework preset — Vite. Команда сборки `npm run build`
(включает проверку типов, поэтому сломанный TypeScript не уедет в прод).
