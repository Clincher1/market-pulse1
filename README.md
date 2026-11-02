# Market Pulse — аналитика новостей и рынков

Одностраничный аналитический терминал: шкала напряжённости мира,
российский контур для бизнеса, мировая тепловая карта, AI-лента новостей,
осторожные сигналы по активам и «Память рынка», которая фиксирует события
и позже проверяет гипотезы реальным движением цен.

Живой сайт: https://market-pulse1-eta.vercel.app/

## Стек

- Vite + React 18 + TypeScript
- TailwindCSS, Framer Motion (анимации), Lucide (иконки)
- Лёгкие собственные SVG-графики вместо отдельной chart-библиотеки
- Supabase Postgres + Edge Functions + pg_cron; фронт читает публичный кэш
  `cached_*` и read-only views исследовательского контура V2
- Vercel для фронтенда, GitHub Actions для ручного деплоя guarded
  shadow-функций

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

«Память рынка» дополнительно читает только санитизированные read-only views
`market_memory_*_v1`; базовые shadow-таблицы публичному ключу недоступны.
Фронт обновляет данные каждые 5 минут и различает живые, устаревшие и
недоступные состояния вместо молчаливой подстановки демонстрационных чисел.

## Структура

```
src/
  components/   Header, BrandMark, TensionScale, RussiaBusiness,
                KeyAssets/MarketHeatmap, NewsFeed, Forecasts,
                MarketMemory, AboutProject, AnalyticsGuide, Footer
  data/         mockData.ts (типы + fallback), live*.ts (Supabase)
  hooks/        useLiveAssets, useLiveNews
  lib/          supabase.ts, safeUrl.ts, newsDedupe.ts
public/         favicon.svg, logo.svg, og-image.svg/png,
                icon-192.png, icon-512.png, apple-touch-icon.png,
                site.webmanifest
supabase/       Edge Functions, миграции и SQL расписаний
api/            Vercel-функция российского контура
```

Тяжёлые разделы ниже первого экрана (`NewsFeed`, `Forecasts`,
`MarketMemory`, `AboutProject`, `AnalyticsGuide`) загружаются отдельными
чанками по мере приближения или при прямом переходе по якорю.

## Бэкенд и автономная работа

Исходники публичных и shadow Edge Functions находятся в
`supabase/functions/`. Пишущие функции защищены серверной проверкой;
публичный publishable-ключ не должен иметь права записи. Плановые задачи
Supabase `pg_cron` обновляют новости, цены, индекс, события, классификации,
снимки прогнозов и их исходы без ежедневного ручного обслуживания.

Guarded shadow-функции деплоятся вручную workflow
`.github/workflows/deploy-shadow.yml` только при изменениях бэкенда.
Обычная загрузка фронтенда в GitHub не требует запуска этого workflow.
Подробный статус и журнал внедрения: **`docs/MARKET_MEMORY_MANUAL_STEPS_2026-10-22.md`**
и **`docs/BRANDING_UX_UPDATE_2026-10-23.md`**.

## Хостинг и доступность в России

`docs/HOSTING.md` — сравнение провайдеров и баз, пять условий «открывается
везде» и порядок переезда. Код для этого уже в репозитории:
`server/origin.mjs` (статика + `api/*` + прокси `/sb` в Supabase за одним
доменом), режим `VITE_SUPABASE_PROXY=/sb` в `src/lib/supabase.ts` и
`SITE_URL` в `selfcheck`. Запуск: `npm run serve:origin`.

`docs/LIMITS-AND-MOVING.md` — лимиты бесплатных тарифов числами: где реально
крутится сбор (Supabase `pg_cron`, а не Vercel), сколько база занимает и когда
упрётся в 500 МБ, что дешевле платного тарифа. `docs/BACKUP.md` — единственное,
что нельзя отложить: на Free автоматических копий базы нет, поэтому история
выгружается еженедельно workflow `backup-history.yml`.

## Контраст и внешний вид

Палитра проверяется тестом `tests/palette-contrast.test.mjs`: он считает
контраст по WCAG 2.1 из значений `src/index.css` и классов в `src/`, без
браузера и сети. Токены `--color-accent-strong` и `--color-accent-strong-hover`
существуют именно потому, что прежний `#2563eb` в роли фона давал 3,68:1 под
белым текстом. Разбор инструмента, из которого взялся этот аудит, —
`docs/DESIGN-REVIEW-2026-11-02.md`.

## Документы для внешней проверки

`docs/review/` — пакет для независимой проверки сайта человеком, у которого нет
возможности открывать ссылки: снимок страницы числами, источники каждой
величины, формулы, чеклист и SQL-проверки. Собирается скриптом
`python3 docs/review/build_package.py` из одного файла содержания
`docs/review/package_content.py`, поэтому DOCX/PDF/Markdown/JSON не расходятся
между собой.

`docs/review/REVIEW-RESPONSE-2026-11-01.md` — разбор внешней проверки: что
подтвердилось первоисточниками, что осталось недоказанным и какие три вопроса
отличают настоящую проверку от пересказа пакета.

`docs/STABILITY-BASELINE-2026-11-01.md` — ориентир стабильности: 16 метрик с
порогами «норма/поломка», снятых запросом `scripts/stability-baseline.sql`.

## Деплой

Vercel, framework preset — Vite. Команда сборки `npm run build`
(включает проверку типов, поэтому сломанный TypeScript не уедет в прод).
