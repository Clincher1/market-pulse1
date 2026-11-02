# Бэкап: единственное, что нельзя отложить

Дата: 02.11.2026.

На бесплатном тарифе Supabase **автоматических копий базы нет**. Ежедневные
бэкапы с хранением 7 дней появляются только на Pro. Логи на Free хранятся
сутки. Это значит: если миграция или ошибка в функции испортит таблицу, у нас
нет ни копии, ни истории изменений, чтобы её вернуть.

Второй довод — не технический. Ленты (RSS) отдают только последние дни. Всё,
что старше, из интернета заново не подтянуть: новостной архив невосстановим
по своей природе. Пока архив двухнедельный, потеря означает «накопим заново».
После месяца — означает «этих новостей больше нет никогда».

## Что выгружаем

Только историю, то есть то, что нельзя пересобрать. Не всю базу: полная
выгрузка на бесплатном тарифе считается исходящим трафиком (5 ГБ в месяц), и
чем больше база, тем дороже каждый дамп.

| Таблица | Зачем |
| --- | --- |
| `news_articles_shadow` | сами статьи: заголовок, описание, адрес, дата, источник |
| `news_events_shadow` | события, собранные из статей |
| `news_event_articles_shadow` | какие статьи подтверждают какое событие |
| `news_event_classifications_shadow` | к какой теме отнесено событие |
| `event_price_impacts_v2` | что событие сделало с ценой |
| `market_forecasts_v2` | архив прогнозов |
| `forecast_outcomes_v2` | исходы прогнозов |
| `daily_snapshots` | снимки дня |
| `asset_price_snapshots_v2` | точки цен |

Журналы (`news_source_health_v2`, `*_runs_v2`) в бэкап не входят: они
создаются заново каждые 5 минут и чистятся через 90 дней.

## Как включить (один раз, 5 минут)

1. В панели Supabase: Project Settings → Database → Connection string → URI.
   Скопируйте строку с паролем базы.
2. В GitHub: Settings → Secrets and variables → Actions → New repository
   secret. Имя — `SUPABASE_DB_URL`, значение — строка из шага 1.
3. Всё. Workflow `.github/workflows/backup-history.yml` запускается каждый
   понедельник в 03:30 UTC и складывает `history-YYYY-MM-DD.sql.gz`
   в артефакты запуска. Хранение — 90 дней, то есть копия всегда есть за
   последние три месяца. Размер: 30 МБ базы сжимаются примерно втрое.

Пока секрет не добавлен, workflow завершается успешно и пишет в лог, чего не
хватает, — красного креста каждую неделю не будет.

Запустить вручную: Actions → Weekly history backup → Run workflow.

## Как проверить, что бэкап настоящий

Архив, который ни разу не восстанавливали, — это не бэкап, а надежда. Проверка
занимает пару минут:

```bash
# 1. Скачать артефакт из последнего запуска и распаковать
gunzip -c history-2026-11-09.sql.gz > history.sql

# 2. Поднять пустой Postgres локально (Docker)
docker run --rm -e POSTGRES_PASSWORD=x -p 5433:5432 -d postgres:16 \
  -c 'postgres -c shared_buffers=64MB'

# 3. Восстановить схему из миграций этого репозитория, затем данные
psql "postgresql://postgres:x@localhost:5433/postgres" -f history.sql

# 4. Сверить числа с сайтом
#    select count(*) from news_articles_shadow;   -- должно совпасть с /status
```

Если восстановление падает — это и есть результат проверки, и его надо
починить сейчас, а не в день аварии.

## Что делать, если Supabase недоступен совсем

Данные остаются у Supabase (пауза за неактивность не удаляет данные, проект
можно разбудить в панели в течение года). Архив лежит в артефактах GitHub.
Поэтому сценарий «Supabase закрылся» решается переездом базы на свой сервер из
этих же файлов — порядок в `docs/LIMITS-AND-MOVING.md`.

## Без GitHub

Если проще без облака: та же команда вручную раз в неделю, с машины, где стоит
`postgresql-client`:

```bash
pg_dump "$SUPABASE_DB_URL" --no-owner --no-privileges --data-only \
  --table=public.news_articles_shadow \
  --table=public.news_events_shadow \
  --table=public.news_event_articles_shadow \
  --table=public.news_event_classifications_shadow \
  --table=public.event_price_impacts_v2 \
  --table=public.market_forecasts_v2 \
  --table=public.forecast_outcomes_v2 \
  --table=public.daily_snapshots \
  --table=public.asset_price_snapshots_v2 \
  | gzip -9 > "history-$(date -u +%F).sql.gz"
```

`SUPABASE_DB_URL` держите в переменной окружения или в менеджере паролей, не в
репозитории и не в чате.
