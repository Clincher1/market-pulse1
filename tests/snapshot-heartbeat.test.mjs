import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runSnapshotWithHeartbeat, sendSnapshotHeartbeat } from '../scripts/snapshot-heartbeat.mjs';

const snapshot = { exportedAt: '2026-10-28T06:10:12.000Z', items: [{}, {}, {}] };

test('full success uses exact template, actual MSK run time, count, and elapsed duration', async () => {
  const moments = [new Date('2026-10-28T06:10:00.000Z'), new Date('2026-10-28T06:10:12.000Z')];
  let sent;
  const result = await runSnapshotWithHeartbeat({
    refresh: async () => snapshot,
    notify: async ({ message }) => { sent = message; return { ok: true }; },
    now: () => moments.shift(),
  });
  assert.equal(sent, '✅ Snapshot OK — 09:10 MSK. Instruments: 3/3. Took 12s.');
  assert.equal(result.report.outcome, 'ok');
});

test('Brent partial failure identifies the instrument by human name', async () => {
  const moments = [new Date('2026-10-28T06:10:00.000Z'), new Date('2026-10-28T06:10:14.000Z')];
  let sent;
  const result = await runSnapshotWithHeartbeat({
    refresh: async () => { throw new Error('BZ=F: source unavailable; original file unchanged'); },
    notify: async ({ message }) => { sent = message; return { ok: true }; },
    now: () => moments.shift(),
  });
  assert.equal(sent, '⚠️ Snapshot partial — 09:10 MSK. Brent failed (source error). Other instruments OK. Took 14s.');
  assert.equal(result.report.instrument, 'Brent');
});

test('Telegram failure logs and retries once after 60 seconds without blocking snapshot generation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'snapshot-heartbeat-'));
  const output = join(directory, 'snapshot.json');
  const moments = [new Date('2026-10-28T06:10:00.000Z'), new Date('2026-10-28T06:10:02.000Z')];
  const logs = [];
  const waits = [];
  let attempts = 0;
  try {
    const result = await runSnapshotWithHeartbeat({
      refresh: async () => {
        await writeFile(output, JSON.stringify(snapshot));
        return snapshot;
      },
      notify: options => sendSnapshotHeartbeat({
        ...options,
        token: 'bot-token',
        chatId: 'private-owner-id',
        fetchImpl: async () => { attempts++; throw new Error('network unavailable'); },
        sleepImpl: async ms => { waits.push(ms); },
        logger: line => logs.push(line),
      }),
      now: () => moments.shift(),
      logger: () => {},
    });
    assert.equal(JSON.parse(await readFile(output, 'utf8')).items.length, 3);
    assert.equal(result.notification.ok, false);
    assert.equal(attempts, 2);
    assert.deepEqual(waits, [60000]);
    assert.equal(logs.length, 2);
    assert.match(logs[0], /attempt 1\/2/);
    assert.match(logs[1], /attempt 2\/2/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
