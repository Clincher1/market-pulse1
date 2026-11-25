import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BACKUP_RUNS_API,
  assessBackupAge,
  backupAlertMessage,
  backupTransitionNotification,
  getLatestBackupStatus,
} from '../supabase/functions/_shared/backup-age.mjs';

const nowMs = Date.parse('2026-11-25T19:00:00.000Z');

function fetchRuns(runs) {
  return async (url, init) => {
    assert.equal(String(url), BACKUP_RUNS_API);
    assert.equal(init.headers.authorization, 'Bearer fixture-github-token');
    assert.equal(init.method, undefined, 'the Actions API request must remain read-only');
    return Response.json({ workflow_runs: runs });
  };
}

test('fresh successful backup produces no watchdog alert', async () => {
  const status = await getLatestBackupStatus({
    fetchImpl: fetchRuns([{
      conclusion: 'success',
      updated_at: new Date(nowMs - 25 * 60 * 60 * 1000).toISOString(),
    }]),
    token: 'fixture-github-token',
    nowMs,
  });
  assert.equal(status.ok, true);
  assert.equal(backupAlertMessage(status), null);
});

test('stale successful backup produces a watchdog alert after 26 hours', async () => {
  const status = await getLatestBackupStatus({
    fetchImpl: fetchRuns([{
      conclusion: 'success',
      updated_at: new Date(nowMs - 27 * 60 * 60 * 1000).toISOString(),
    }]),
    token: 'fixture-github-token',
    nowMs,
  });
  assert.equal(status.ok, false);
  assert.match(backupAlertMessage(status), /History backup alert/);
  assert.match(backupAlertMessage(status), /26 hours/);
});

test('missing successful backup history produces a watchdog alert', async () => {
  const status = await getLatestBackupStatus({
    fetchImpl: fetchRuns([]),
    token: 'fixture-github-token',
    nowMs,
  });
  assert.equal(status.ok, false);
  assert.match(backupAlertMessage(status), /No successful production history backup/);
});

test('site_health records backup freshness as a named selfcheck result', () => {
  const selfcheck = readFileSync(new URL('../supabase/functions/selfcheck/index.ts', import.meta.url), 'utf8');
  const labels = readFileSync(new URL('../src/lib/checkLabels.ts', import.meta.url), 'utf8');
  assert.match(selfcheck, /check\('backup_history', async \(\) => \{[\s\S]*getLatestBackupStatus\(\)/);
  assert.match(selfcheck, /backupTransitionNotification\(previousChecks\.backup_history, results\.backup_history\)/);
  assert.match(selfcheck, /notifyTelegramFailure\(results, checkedAt, previousChecks\)/);
  assert.match(selfcheck, /checks: results/);
  assert.match(labels, /backup_history:/);
});

test('watchdog workflow grants only Actions read permission and passes its built-in token', () => {
  const workflow = readFileSync(new URL('../.github/workflows/selfcheck-watchdog.yml', import.meta.url), 'utf8');
  assert.match(workflow, /permissions:[\s\S]*?contents: read[\s\S]*?actions: read/);
  assert.match(workflow, /GITHUB_TOKEN: \$\{\{ github\.token \}\}/);
});

test('backup failure notifies on transition, not on repeated failures, and recovery notifies once', () => {
  const healthy = { ok: true, detail: 'backup fresh' };
  const failed = { ok: false, detail: 'backup older than 26 hours' };

  const firstFailure = backupTransitionNotification(healthy, failed);
  assert.match(firstFailure, /became unhealthy/);
  assert.equal(backupTransitionNotification(failed, failed), null, 'repeated failure does not resend');

  const recovery = backupTransitionNotification(failed, healthy);
  assert.match(recovery, /recovered/);
  assert.equal(backupTransitionNotification(healthy, healthy), null, 'stable healthy state is quiet');
});

test('Actions API uses the verified workflow file path, never a numeric workflow id', () => {
  const workflow = readFileSync(new URL('../.github/workflows/backup-history.yml', import.meta.url), 'utf8');
  assert.match(workflow, /name: Verified encrypted history backup/);
  assert.match(BACKUP_RUNS_API, /\/actions\/workflows\/backup-history\.yml\/runs\?status=success&per_page=1$/);
  assert.doesNotMatch(BACKUP_RUNS_API, /workflows\/\d+\/runs/);
});

test('future-dated completion cannot be treated as a fresh backup', () => {
  const status = assessBackupAge({
    conclusion: 'success',
    updated_at: new Date(nowMs + 60_000).toISOString(),
  }, nowMs);
  assert.equal(status.ok, false);
  assert.notEqual(backupAlertMessage(status), null);
});
