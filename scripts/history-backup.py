#!/usr/bin/env python3
"""Read-only public-schema snapshot + independently verified table-data recovery.

No source writes. Full public pg_dump is retained; verification deliberately loads
only table data into a bare, isolated local PostgreSQL, never application jobs,
triggers, functions, cron or credentials. It is not a whole-Supabase restore.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import time
from urllib.parse import urlparse

import psycopg
from psycopg import sql

ROOT = Path(__file__).resolve().parent.parent
REQUIRED = {'news_articles_shadow', 'news_events_shadow', 'news_event_articles_shadow',
            'news_event_classifications_shadow', 'market_forecasts_v2', 'forecast_outcomes_v2',
            'event_price_impacts_v2', 'daily_snapshots', 'asset_price_snapshots_v2',
            'asset_instruments_v2', 'legacy_gold_cache_20261121'}


def run(args, **kwargs):
    # No DSNs or raw subprocess errors in public workflow logs.
    if args[0] in ('pg_dump', 'pg_restore') and os.environ.get('BACKUP_PG_IMAGE'):
        directory = os.environ['BACKUP_PRIVATE_TEMP']
        env = kwargs.get('env', os.environ)
        forwarded = [part for key in env if key.startswith('PG') for part in ('--env', key)]
        args = ['docker', 'run', '--rm', '--network', 'host', '--user', f'{os.getuid()}:{os.getgid()}',
                '--volume', f'{directory}:{directory}', *forwarded, os.environ['BACKUP_PG_IMAGE'], *args]
    result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=600, **kwargs)
    if result.returncode:
        raise RuntimeError(f'{Path(args[0]).name} failed (details withheld; may contain private database data)')
    return result.stdout


def pg_environment(dsn):
    values = psycopg.conninfo.conninfo_to_dict(dsn)
    allowed = {'host', 'port', 'dbname', 'user', 'password', 'sslmode', 'connect_timeout', 'sslrootcert', 'channel_binding', 'application_name'}
    if set(values) - allowed:
        raise RuntimeError('Unsupported connection options')
    env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
    for key, value in values.items():
        env['PGDATABASE' if key == 'dbname' else 'PG' + key.upper()] = value
    return env


def connection_settings(conn):
    conn.execute("SET client_encoding = 'UTF8'")
    conn.execute("SET TIME ZONE 'UTC'")
    conn.execute("SET extra_float_digits = 3")
    conn.execute("SET statement_timeout = '120s'")
    conn.execute("SET lock_timeout = '5s'")


def table_fingerprint(conn, name):
    query = sql.SQL('COPY (SELECT row_to_json(t)::text FROM public.{} t ORDER BY (row_to_json(t)::text) COLLATE "C") TO STDOUT').format(sql.Identifier(name))
    digest, count = hashlib.sha256(), 0
    with conn.cursor().copy(query) as stream:
        for block in stream:
            raw = bytes(block)
            digest.update(raw)
            count += raw.count(b'\n')
    return {'rows': count, 'sha256_ordered_copy_json': digest.hexdigest()}


def main():
    source = os.environ.get('SUPABASE_DB_URL', '')
    target = os.environ.get('BACKUP_RESTORE_URL', '')
    parsed = urlparse(target)
    # Refuse cloud hosts, non-dedicated names, source==target. The workflow also
    # provisions only a disposable local database for this connection.
    if parsed.hostname not in ('127.0.0.1', 'localhost', '::1') or parsed.path != '/market_pulse_restore' or target == source:
        raise RuntimeError('Restore target must be the dedicated LOCAL market_pulse_restore database')
    if not source:
        raise RuntimeError('SUPABASE_DB_URL is not configured; no backup was created')
    expected_host = 'db.hekzplfftannlzwvgwwm.supabase.co'
    source_host = urlparse(source).hostname or ''
    fixture = os.environ.get('BACKUP_FIXTURE') == '1'
    pooler_ok = source_host.endswith('.pooler.supabase.com') and urlparse(source).username == 'postgres.hekzplfftannlzwvgwwm'
    if fixture and (source_host not in ('127.0.0.1', 'localhost', '::1') or urlparse(source).path != '/market_pulse_source'):
        raise RuntimeError('Fixture source must be the dedicated local source database')
    if not fixture and source_host != expected_host and not pooler_ok:
        raise RuntimeError('Source is not the authorized Supabase project/pooler')
    recipient = Path(os.environ.get('BACKUP_RECIPIENT', ROOT / 'config/backup-recipient.pem'))
    if not recipient.is_file():
        raise RuntimeError('Public recovery recipient is missing')
    output = Path(os.environ.get('BACKUP_OUTPUT', ROOT / '.local/encrypted-backups'))
    output.mkdir(parents=True, exist_ok=True)
    started = time.time()
    # All plaintext stays in an ephemeral private temporary directory, never in
    # the artifact directory, Git or command output.
    with tempfile.TemporaryDirectory(prefix='mp-backup-') as temporary:
        temp = Path(temporary)
        os.environ['BACKUP_PRIVATE_TEMP'] = str(temp)
        dump = temp / 'public.dump'
        manifest = {'format': 1, 'scope': 'all public base tables plus full public schema dump',
                    'verification_scope': 'table data restored into isolated local PostgreSQL, not complete Supabase service recovery',
                    'fixture': fixture, 'started_at_unix': started,
                    'git_commit': os.environ.get('GITHUB_SHA', 'local'), 'tables': {}}
        with psycopg.connect(source, autocommit=True, connect_timeout=20) as conn:
            connection_settings(conn)
            conn.execute('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
            # Guard against an accidentally configured DSN for a different project.
            if not fixture:
                required = conn.execute("SELECT count(*) FROM public.data_slot_registry").fetchone()[0]
                if required < 1:
                    raise RuntimeError('Source identity preflight failed')
            snapshot = conn.execute('SELECT pg_export_snapshot()').fetchone()[0]
            manifest['source_version'] = conn.execute('SHOW server_version').fetchone()[0]
            tables = [r[0] for r in conn.execute("SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname")]
            if not REQUIRED.issubset(tables):
                raise RuntimeError('Required historical tables are missing')
            if conn.execute("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('p','f')").fetchone()[0]:
                raise RuntimeError('Partitioned/foreign tables require an explicit backup extension')
            columns = {}
            for name in tables:
                columns[name] = conn.execute("SELECT a.attname, format_type(a.atttypid,a.atttypmod) FROM pg_attribute a WHERE a.attrelid=%s::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum", ('public.' + '"' + name.replace('"', '""') + '"',)).fetchall()
                manifest['tables'][name] = table_fingerprint(conn, name)
            # Password/DSN is passed only via subprocess environment, never argv.
            env = pg_environment(source)
            env['PGOPTIONS'] = '-c default_transaction_read_only=on -c statement_timeout=120000 -c lock_timeout=5000'
            run(['pg_dump', '--format=custom', '--schema=public', '--no-owner', '--no-privileges', '--lock-wait-timeout=5s', f'--snapshot={snapshot}', f'--file={dump}'], env=env)
            conn.execute('COMMIT')
        with dump.open('rb') as archive_bytes:
            manifest['dump_sha256'] = hashlib.file_digest(archive_bytes, 'sha256').hexdigest()
        restore_start = time.time()
        with psycopg.connect(target, autocommit=True, connect_timeout=10) as recovered:
            connection_settings(recovered)
            if recovered.execute("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S')").fetchone()[0]:
                raise RuntimeError('Restore database is not empty; nothing was overwritten')
            for name, cols in columns.items():
                recovered.execute(sql.SQL('CREATE TABLE public.{} ({})').format(sql.Identifier(name), sql.SQL(',').join(sql.SQL('{} {}').format(sql.Identifier(col), sql.SQL(kind)) for col, kind in cols)))
            listing = run(['pg_restore', '--list', str(dump)]).decode()
            # Load only TABLE DATA records. Do not activate captured triggers,
            # functions, policies, sequences or cron during the restore drill.
            entries = [line for line in listing.splitlines() if ' TABLE DATA public ' in line and not line.startswith(';')]
            if len(entries) != len(tables):
                raise RuntimeError('Archive table-data inventory differs from snapshot')
            toc = temp / 'data.list'
            toc.write_text('\n'.join(entries) + '\n')
            run(['pg_restore', '--exit-on-error', '--no-owner', '--no-privileges',
                 f'--use-list={toc}', '--dbname', 'market_pulse_restore', str(dump)], env=pg_environment(target))
            for name, fingerprint in manifest['tables'].items():
                if table_fingerprint(recovered, name) != fingerprint:
                    raise RuntimeError('Restored content differs from the exported snapshot')
        manifest['restore_verified'] = True
        manifest['restore_seconds'] = round(time.time() - restore_start, 3)
        manifest['finished_at_unix'] = time.time()
        (temp / 'manifest.json').write_text(json.dumps(manifest, indent=2))
        archive = temp / 'recovery.tar'
        with tarfile.open(archive, 'w') as tar:
            tar.add(dump, arcname='public.dump')
            tar.add(temp / 'manifest.json', arcname='manifest.json')
        filename = f"{'fixture-' if fixture else ''}market-pulse-{time.time_ns()}.mpbackup"
        run(['node', str(ROOT / 'scripts/backup-envelope.mjs'), 'encrypt', str(archive), str(output / filename), str(recipient)])
        print(json.dumps({'encrypted_file': filename, 'fixture': fixture, 'verified_table_count': len(tables),
                          'restore_verified': True, 'scope': manifest['verification_scope']}))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        # Exceptions from DB drivers may contain row data or a DSN. Never publish.
        print('::error::Backup/restore verification failed. No successful production backup is certified. Check secure runtime configuration; raw errors are intentionally withheld.', file=sys.stderr)
        sys.exit(1)
