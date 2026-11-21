import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const workflow = readFileSync('.github/workflows/backup-history.yml', 'utf8');
test('missing database connection fails backup rather than certifying a skipped dump', () => {
  assert.match(workflow, /if \[ -z "\$SUPABASE_DB_URL" \]; then[\s\S]*?::error::Backup not created[\s\S]*?exit 1/);
});
test('raw internal backup is gated off in public repositories', () => {
  assert.match(workflow, /REPOSITORY_PRIVATE: \$\{\{ github.event.repository.private \}\}/);
  assert.match(workflow, /if \[ "\$REPOSITORY_PRIVATE" != "true" \]; then[\s\S]*?exit 1/);
  assert.ok(workflow.indexOf('Require private artifact storage') < workflow.indexOf('Dump history tables'));
});
