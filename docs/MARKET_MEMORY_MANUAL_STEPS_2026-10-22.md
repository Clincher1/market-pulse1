# «Память рынка»: что уже сделано и какие ручные шаги нужны

Дата: 22 октября 2026 года.

> **Статус-обновление 23 октября 2026 года:** ручные шаги выполнены. GitHub Actions run #2
> (`39924900379`) успешно задеплоил исправленный классификатор v10; публичный ключ получает 401 на всех
> shadow writers и диспетчере. Первая партия `event_classification_v3` из двух событий корректно отклонена
> как региональная без прямых asset-impacts, `aggregation_v2` создал 15 снимков `none`, а pg_cron jobs 12–18
> включены. Первый плановый `shadow-ingest-v2` в 08:35 UTC завершился HTTP 200 и увеличил архив до 1 522 статей.
> Исторические инструкции ниже сохранены как журнал внедрения; повторно выполнять их не нужно.

## Коротко

Assistant-side уже выполнена большая часть: база памяти освежена, публичные read-only views созданы, диспетчер shadow-пайплайна задеплоен,
фронтенд «Память рынка» подготовлен. Для финального автономного режима остался один безопасный барьер: обновлённые shadow-функции с
внутренней проверкой service-role нужно задеплоить штатным Supabase CLI из GitHub Actions. Для этого нужны GitHub Actions secrets,
которые владелец аккаунтов добавляет сам. Значения секретов нельзя присылать в чат.

---

## Уже выполнено ассистентом в live Supabase

1. Созданы public read-only views:
   - `market_memory_stats_v1`
   - `market_memory_events_v1`
   - `market_memory_event_outcomes_v1`
   - `market_memory_forecasts_v1`
   - `market_memory_analogues_v1`
2. Проверено публичным ключом сайта:
   - views читаются HTTP 200;
   - прямые shadow-таблицы недоступны HTTP 401.
3. Создана Edge Function `run-shadow-pipeline` v1:
   - без авторизации HTTP 401;
   - публичный ключ HTTP 401;
   - Vault `x-cron-secret` через pg_net — health HTTP 200 (request 2540).
4. Выполнено разовое освежение без Groq:
   - цены: request 2541, HTTP 200, 8/8 инструментов, 141 upsert;
   - ingest: request 2542, HTTP 200 partial, 19/20 источников, 232 candidate articles;
   - cluster: request 2543, HTTP 200, 385 articles seen, 372 events upserted;
   - evaluate events: request 2545, HTTP 200, 14 evaluated / 43 pending;
   - evaluate forecasts: request 2546, HTTP 200, все 15 снимков пока pending.

Классификатор Groq специально **не запускался**: текущая deployed-версия ещё не содержит новый in-code guard и prompt v3.

Состояние public stats после освежения: 1 314 статей, 521 событие, 6 classified / 6 rejected / 3 quarantine,
14 evaluated и 43 pending event outcomes, 15 forecast snapshots (все pending), 967 price snapshots.

## Подготовлено в коде

- Все 7 recurring shadow writers получили внутреннюю timing-safe проверку:
  точный service-role bearer или `x-cron-secret`; публичный ключ получит 401.
- Классификатор обновлён до `event_classification_v3`:
  максимум 3 impact, минимум strength 0.35, запрет generic spillover и детерминированная дисциплина каналов после ответа модели.
- Агрегатор обновлён до `aggregation_v2` и использует только classifications v3
  с relevance/confidence не ниже 0.50.
- Добавлены `run-shadow-pipeline`, `supabase/config.toml` и ручной workflow
  `.github/workflows/deploy-shadow.yml`.
- Подготовлен SQL расписания `supabase/sql/2026-10-22_shadow_memory_schedule.sql`.
  Его применит ассистент только после деплоя guard-ов и аудита маленькой партии v3.
- Во фронтенд добавлены раздел «Память рынка», пункт навигации «Память» и гид `#guide-memory`.
- События до v3 в UI явно помечаются «Архив до v3»; их исходы не входят в надёжные исторические аналоги.
  Сводка журнала считается только по `aggregation_v2`, чтобы старые версии не смешивались с новой методологией.

---

## Что нужно сделать вручную

### Шаг 1. Загрузить новый ZIP в GitHub

1. Откройте репозиторий `Clincher1/market-pulse1`.
2. Нажмите **Add file → Upload files**.
3. Перетащите содержимое распакованного нового ZIP **целиком**, включая папку `.github`.
4. Дождитесь, пока GitHub покажет все файлы.
5. Внизу нажмите **Commit changes**.
6. Подождите Vercel **Ready** для нового деплоя.

Важно: папка `.github` скрытая. Если после загрузки её не видно в репозитории, не создавайте workflow вручную — напишите
«папки .github нет», и ассистент даст отдельный безопасный способ.

### Шаг 2. Создать Personal Access Token в Supabase

1. Откройте Supabase Dashboard.
2. Нажмите аватар аккаунта → **Account settings**.
3. Откройте **Access Tokens**.
4. Нажмите **Generate new token**.
5. Имя: `market-pulse-github-actions`.
6. Если есть срок действия, выберите разумный срок, например 90 дней.
7. Скопируйте токен один раз.

**Никогда не присылайте этот токен в чат и не вставляйте его в файлы.**

### Шаг 3. Добавить два GitHub Actions secrets

1. В репозитории GitHub откройте **Settings → Secrets and variables → Actions**.
2. Нажмите **New repository secret**.
3. Создайте:
   - Name: `SUPABASE_ACCESS_TOKEN`
   - Secret: токен из шага 2
4. Создайте второй:
   - Name: `SUPABASE_PROJECT_REF`
   - Secret: `hekzplfftannlzwvgwwm`
5. Проверьте, что оба секрета появились в списке. Их значения GitHub повторно не покажет — это нормально.

### Шаг 4. Запустить workflow деплоя shadow-функций

1. Откройте вкладку **Actions** в репозитории.
2. Слева выберите **Deploy guarded shadow pipeline**.
3. Справа нажмите **Run workflow**.
4. Ветка: `main`.
5. Нажмите зелёную кнопку **Run workflow**.
6. Подождите завершения. Нужен зелёный статус.

Если workflow красный, не запускайте его многократно. Напишите только: **«workflow красный»**. Ассистент разберёт публичный лог этапа без секретов.

### Шаг 5. Сообщить ассистенту

Напишите:

> ZIP загрузил, Vercel Ready, workflow зелёный. Продолжай память рынка.

После этого ассистент сам:

1. проверит, что public publishable key получает 401 на shadow writers;
2. проверит авторизованный вызов через диспетчер;
3. запустит классификатор v3 максимум на 2 событиях;
4. вручную проверит качество impacts;
5. только при успешном аудите применит pg_cron-расписание;
6. проверит первые cron-ответы, новые классификации и исходы;
7. сообщит финальный статус и следующие этапы: паспорт события, машина времени, Russia event briefs и калибровка после достаточного N.

## Чего не делать

- Не присылать access token, service-role key, Groq key или Twelve key в чат.
- Не запускать `classify-events-v2-shadow` вручную из браузера/Supabase Invoke до зелёного workflow.
- Не выполнять SQL расписания самостоятельно.
- Не удалять `proxy`: он нужен как fallback для RSS.
- Не трактовать малый N в «Памяти рынка» как доказанную точность.
