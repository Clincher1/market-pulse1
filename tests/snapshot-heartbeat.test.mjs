import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { isCatchUpRun, runSnapshotWithHeartbeat, sendSnapshotHeartbeat } from '../scripts/snapshot-heartbeat.mjs';

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

test('stale heartbeat adds only the catch-up line; fresh heartbeat keeps the normal message', async () => {
  const startedAt = new Date('2026-10-28T12:10:00.000Z');
  const staleHeartbeat = '2026-10-28T06:09:59.999Z';
  const freshHeartbeat = '2026-10-28T07:10:00.000Z';
  const catchUpLine = 'Догоняющий прогон: предыдущий слот пропущен шедулером';
  const expectedNormal = '✅ Snapshot OK — 15:10 MSK. Instruments: 3/3. Took 12s.';

  assert.equal(isCatchUpRun(staleHeartbeat, startedAt), true);
  assert.equal(isCatchUpRun(freshHeartbeat, startedAt), false);
  assert.equal(isCatchUpRun('2026-10-28T06:10:00.000Z', startedAt), false);
  assert.equal(isCatchUpRun(null, startedAt), true);

  async function messageFor(lastHeartbeat) {
    const moments = [startedAt, new Date(startedAt.getTime() + 12000)];
    let message;
    await runSnapshotWithHeartbeat({
      refresh: async () => snapshot,
      notify: async ({ message: value }) => { message = value; return { ok: true }; },
      now: () => moments.shift(),
      catchUp: isCatchUpRun(lastHeartbeat, startedAt),
    });
    return message;
  }

  assert.equal(await messageFor(staleHeartbeat), `${expectedNormal}\n${catchUpLine}`);
  assert.equal(await messageFor(freshHeartbeat), expectedNormal);
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
