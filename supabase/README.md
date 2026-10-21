# supabase/

Здесь должна жить серверная часть проекта, чтобы версионироваться
вместе с фронтом:

- `functions/` — код Edge Functions (`update-news`, `update-assets`,
  `update-tension`, `update-tension-index`, `update-forecasts`, `proxy`).
  **Пока пусто**: функции существуют только в Supabase Dashboard.
  Первый шаг починки бэкенда — выгрузить их сюда как есть,
  и только потом переписывать.
- `diagnostics.sql` — безопасные (только SELECT) запросы аудита базы:
  RLS, политики, права, индексы, дубли, расписания.
- Миграции сюда не класть, пока не выгружен код функций: порядок работ
  и причины — в `../docs/SUPABASE_STEP_BY_STEP.md`.
