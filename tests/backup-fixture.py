"""LOCAL disposable database fixture only. Never accepts a production host."""
import os
import psycopg
from psycopg import sql
from urllib.parse import urlparse

url = os.environ['BACKUP_FIXTURE_ADMIN_URL']
assert urlparse(url).hostname in ('127.0.0.1', 'localhost', '::1')
with psycopg.connect(url, autocommit=True) as admin:
    for name in ('market_pulse_source', 'market_pulse_restore'):
        assert not admin.execute('SELECT 1 FROM pg_database WHERE datname=%s', (name,)).fetchone(), 'Fixture databases already exist; refuse to overwrite'
        admin.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(name)))
source = url.rsplit('/', 1)[0] + '/market_pulse_source'
with psycopg.connect(source, autocommit=True) as conn:
    for name in ('news_articles_shadow', 'news_events_shadow', 'news_event_articles_shadow',
                 'news_event_classifications_shadow', 'market_forecasts_v2', 'forecast_outcomes_v2',
                 'event_price_impacts_v2', 'daily_snapshots', 'asset_price_snapshots_v2',
                 'asset_instruments_v2', 'legacy_gold_cache_20261121', 'cached_assets'):
        conn.execute(sql.SQL('CREATE TABLE public.{} (id bigint, content text, value numeric(24,8), payload jsonb, dates date[], at timestamptz, optional text)').format(sql.Identifier(name)))
        for i in range(8):
            conn.execute(sql.SQL('INSERT INTO public.{} VALUES (%s,%s,%s,%s::jsonb,ARRAY[DATE \'2026-10-28\'],TIMESTAMPTZ \'2026-10-28 01:00:00+03\',NULL)').format(sql.Identifier(name)),
                         (i % 4, 'История: кавычки " и \\ и\nновая строка\t' + str(i), '12345.67890123', '{"nested":{"a":1},"values":[1,null,"строка"]}'))
    conn.execute("CREATE FUNCTION public.must_not_run() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'restore must not execute application triggers'; END $$")
    conn.execute('CREATE TRIGGER no_replay BEFORE INSERT ON public.cached_assets FOR EACH ROW EXECUTE FUNCTION public.must_not_run()')
print('Created LOCAL synthetic fixture: 12 tables, 96 rows, Unicode/JSON/arrays/NULL/duplicates and a no-replay trigger.')
