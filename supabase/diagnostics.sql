-- Market Pulse: диагностические запросы для Supabase SQL Editor.
-- ТОЛЬКО ЧТЕНИЕ (SELECT). Данные не изменяет. Выполняйте по одному
-- блоку и сохраняйте результаты.

-- 1) Включён ли RLS на таблицах
select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;

-- 2) Все RLS-политики
select tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 3) Права ролей anon/authenticated на таблицы
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
order by table_name, grantee, privilege_type;

-- 4) Индексы (включая unique)
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
order by tablename, indexname;

-- 5) Колонки и типы всех таблиц проекта
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;

-- 6) Дубли истории напряжённости по датам
select date, count(*) as rows, min(value) as min_v, max(value) as max_v,
       max(created_at) as last_write
from tension_history
group by date
order by date desc
limit 14;

-- 7) Качество данных новостей
select count(*) as total,
       count(*) filter (where published_at is null) as no_published_at,
       count(*) filter (where confidence is null) as no_confidence,
       count(*) filter (where url is null or url = '') as no_url
from cached_news;

select url, count(*) as cnt
from cached_news
where url is not null and url <> ''
group by url
having count(*) > 1;

-- 8) Дубли фраз чёрного списка
select lower(trim(phrase)) as phrase_norm, count(*) as cnt
from news_blacklist
group by lower(trim(phrase))
having count(*) > 1;

-- 9) Расписания pg_cron (если схемы cron нет — запрос даст ошибку,
--    это нормально: значит расписание внешнее).
--    ВНИМАНИЕ: колонку command целиком никуда не отправляйте:
--    там может быть заголовок Authorization с ключом.
select jobid, jobname, schedule, active
from cron.job
order by jobid;
