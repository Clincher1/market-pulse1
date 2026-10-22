# Обязательные ручные действия после отчёта — 2026-10-22

Этот список заменяет предыдущий `MANUAL_STEPS_2026-10-22.md` там, где статус
изменился: Vault-секрет и cron уже настроены, а ключ Twelve был сброшен ещё раз.

## 1. Срочно: вписать новый ключ Twelve в Supabase

Reset в Twelve Data аннулирует предыдущее значение ключа. Новое значение никуда,
кроме Supabase, вписывать не надо.

1. В Twelve Data открой **API Keys** и скопируй новое значение кнопкой Copy/Show.
   Если значение уже нельзя посмотреть, нажми Reset ещё раз и сразу скопируй
   свежее значение. Вкладку до копирования не закрывай.
2. Открой **Supabase Dashboard → проект Market Pulse → Edge Functions → Secrets**.
3. Найди секрет с именем ровно **`TWELVE_KEY`** → Edit → вставь новое значение → Save.
   Если такого секрета нет, создай новый с именем `TWELVE_KEY`.
4. **Не вставляй этот ключ** в GitHub, Vercel, код сайта или чат. Это не
   `CRON_SECRET`; `CRON_SECRET` не трогай.
5. Redeploy функции после смены секрета не нужен. Подожди 5–20 минут
   (cron + 15-минутный cooldown писателя) и напиши мне «TWELVE_KEY обновлён» —
   я проверю, что `cached_assets.updated_at` снова двигается у всех пяти активов.

## 2. Переподключить Supabase-коннектор в Arena

Коннектор включён, но Supabase вернул **Authentication failed (401)**. Из-за этого
я не смог сам задеплоить функции и выполнить SQL из чата.

1. В Arena открой подключённые приложения/коннекторы этого чата.
2. Для **Supabase** нажми Reconnect / Reauthenticate (название кнопки может чуть
   отличаться) и заверши вход.
3. Напиши «Supabase переподключён». После этого я сам:
   - задеплою `update-assets`, `update-tension`, `update-forecasts`;
   - аккуратно пропатчу задеплоенный `update-news`, не переписывая его логику;
   - отключу/заменю `proxy`;
   - проверю cron, RLS/grants и отсутствие GDELT уже серверными запросами.

Если переподключить не получится, деплой вручную — по `docs/BACKEND_HARDENING_DEPLOY.md`:
три функции заменить кодом из `supabase/functions/...`, `proxy` удалить,
`update-news` пропатчить по `supabase/functions/update-news/CRON_AUTH_PATCH.md`.

## 3. Загрузить новый полный пакет в GitHub

Сейчас на GitHub загружен только первый маленький vibe-audit пакет. Новый полный
пакет заменяет оба предыдущих ZIP и включает Tailwind 4/Vite 8, дедупликацию,
исходники Supabase и актуальные документы.

1. Распакуй новый ZIP.
2. GitHub → корень репозитория → **Add file → Upload files**.
3. Перетащи содержимое папки пакета с сохранением путей и заменой файлов.
4. Commit message: `Function auth prep, news dedupe, Tailwind 4/Vite 8`.
5. Дождись Vercel **Ready**.

Важно: загрузка `supabase/functions/...` в GitHub **не деплоит** функции в
Supabase. Это только хранение исходников. Деплой — шаг 2.

## 4. Вернуть репозиторий в Private

После загрузки пакета: GitHub → Settings → General → Danger Zone →
Change repository visibility → **Make private**.

## 5. Что уже не нужно делать

- SQL-удаление GDELT сейчас не требуется: проверка 2026-10-22 показала **0 строк**.
  Файл `supabase/sql/2026-10-22_check_and_cleanup_legacy_gdelt.sql` — только
  идемпотентная страховка, если такие строки когда-нибудь появятся снова.
- Старый ключ Twelve отдельно «отзывать» после Reset не нужно: Reset уже сделал
  прежнее значение недействительным. Главное — шаг 1.

## 6. Желательно в ближайший заход

- Vercel → Settings → Environment Variables: явно задать публичные
  `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY`. Я проверил через коннектор:
  сейчас там остались legacy-имена `VITE_TWELVE_KEY`, `VITE_PROXY_BASE` и
  `GROQ_API_KEY`; текущий код сайта и `api/russia-insights.js` их не использует.
  После загрузки нового пакета и успешного деплоя эти три legacy-переменные
  можно удалить. Значения секретов мне не присылать — только имена, если
  возникнет вопрос.
- Проверить 2FA: GitHub, Vercel, Supabase, Twelve, Groq.
- Проверить лимиты/алерты Groq и автоматические бэкапы Supabase.
- Свой домен: покупка и DNS — позже, код к этому готов.

## Superseding update (2026-10-22 evening)

Already done by the assistant after Supabase reconnect: Twelve recovery
verified; `update-tension`, `update-forecasts`, and `update-assets` deployed
with cron guards and tested; `proxy` hardened to GET-only; old `update-news`
deleted and replaced by `update-news-v2` (cron job 2 retargeted). Ignore any
earlier instruction in this file to patch `update-news` by hand or to delete
`proxy`. Manual remainder: upload the current priority ZIP to GitHub if not
done, wait for Vercel Ready, make the repo private again, and only later do
the optional Vercel legacy-env cleanup listed above.
