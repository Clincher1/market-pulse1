import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const workflow = readFileSync('.github/workflows/backup-history.yml', 'utf8');
const backup = readFileSync('scripts/history-backup.py', 'utf8');

test('missing database connection fails backup rather than certifying a skipped dump', () => {
  assert.match(workflow, /if \[ -z "\$SUPABASE_DB_URL" \]; then[\s\S]*?::error::Backup not created[\s\S]*?exit 1/);
});
test('public artifact upload can contain only encrypted envelopes and missing files fail', () => {
  assert.match(workflow, /path: \$\{\{ runner.temp \}\}\/sealed-history\/\*\.mpbackup/);
  assert.doesNotMatch(workflow, /path:.*(?:\.sql|\.dump|\.tar|\.gz|\.pem)/);
  assert.match(workflow, /if-no-files-found: error/);
  assert.doesNotMatch(workflow, /continue-on-error:/);
});
test('snapshot uses a single read-only exported transaction for dump and fingerprints', () => {
  assert.match(backup, /BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY/);
  assert.match(backup, /pg_export_snapshot\(\)/);
  assert.match(backup, /--snapshot=\{snapshot\}/);
  assert.match(backup, /default_transaction_read_only=on/);
  assert.ok(backup.indexOf('table_fingerprint(conn, name)') < backup.indexOf("conn.execute('COMMIT')"));
});
test('restore refuses nonlocal targets, non-dedicated databases and nonempty targets', () => {
  assert.match(backup, /parsed.hostname not in \('127.0.0.1', 'localhost', '::1'\)/);
  assert.match(backup, /parsed.path != '\/market_pulse_restore'/);
  assert.match(backup, /target == source/);
  assert.match(backup, /Restore database is not empty/);
});
test('recovery includes registry and preserved gold originals and compares exact restored content', () => {
  assert.match(backup, /asset_instruments_v2/);
  assert.match(backup, /legacy_gold_cache_20261121/);
  assert.match(backup, /table_fingerprint\(recovered, name\) != fingerprint/);
  assert.ok(backup.indexOf("manifest['restore_verified'] = True") < backup.indexOf("'scripts/backup-envelope.mjs'"));
});
test('private keys and plaintext are never committed or passed into backup workflow', () => {
  assert.doesNotMatch(workflow, /private\.pem|PRIVATE_KEY|decrypt/);
  const ignore = readFileSync('.gitignore', 'utf8');
  assert.ok(ignore.includes('/.local/'));
  assert.ok(ignore.includes('/.venv/'));
  const recipient = readFileSync('config/backup-recipient.pem', 'utf8');
  assert.match(recipient, /^-----BEGIN PUBLIC KEY-----/);
  assert.doesNotMatch(recipient, /PRIVATE KEY/);
});
