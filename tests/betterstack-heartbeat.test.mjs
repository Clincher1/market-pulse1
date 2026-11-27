import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { redactBetterStackUrl, sendBetterStackHeartbeat } from '../scripts/betterstack-heartbeat.mjs';

const privateUrl = 'https://uptime.betterstack.com/api/v1/heartbeat/example-secret-token?auth=another-secret';

test('Better Stack GET logs a redacted URL, HTTP status and request/response timestamps', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'betterstack-heartbeat-'));
  const outputFile = join(directory, 'github-output');
  const logs = [];
  const times = [new Date('2026-11-27T08:15:00.000Z'), new Date('2026-11-27T08:15:01.000Z')];
  let request;
  try {
    const result = await sendBetterStackHeartbeat({
      url: privateUrl,
      fetchImpl: async (...args) => { request = args; return { ok: true, status: 200 }; },
      now: () => times.shift(),
      logger: line => logs.push(line),
      outputFile,
    });
    assert.deepEqual(result, { ok: true, skipped: false, status: 200 });
    assert.equal(request[0], privateUrl, 'the original private endpoint is used only for the request');
    assert.equal(request[1].method, 'GET');
    assert.equal(request[1].redirect, 'error');
    assert.match(logs[0], /^Better Stack heartbeat GET https:\/\/uptime\.betterstack\.com\/api\/v1\/heartbeat\//);
    assert.match(logs[0], /2026-11-27T08:15:00\.000Z$/);
    assert.match(logs[1], /HTTP 200/);
    assert.match(logs[1], /2026-11-27T08:15:01\.000Z$/);
    assert.ok(logs.every(line => !line.includes('example-secret-token') && !line.includes('another-secret')));
    assert.equal(await readFile(outputFile, 'utf8'), 'result=sent\n');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('Better Stack heartbeat reports missing configuration without making a request', async () => {
  const logs = [];
  let called = false;
  const result = await sendBetterStackHeartbeat({
    url: '',
    fetchImpl: async () => { called = true; },
    now: () => new Date('2026-11-27T08:15:00.000Z'),
    logger: line => logs.push(line),
  });
  assert.deepEqual(result, { ok: false, skipped: true, status: null });
  assert.equal(called, false);
  assert.match(logs[0], /BETTERSTACK_HEARTBEAT_URL is not configured/);
});

test('Better Stack rejects non-HTTPS or foreign endpoints before sending', async () => {
  assert.throws(() => redactBetterStackUrl('http://uptime.betterstack.com/api/v1/heartbeat/token'));
  assert.throws(() => redactBetterStackUrl('https://example.com/api/v1/heartbeat/token'));
});

test('Better Stack non-2xx responses and transport errors are logged as failed pings', async () => {
  const logs = [];
  const times = [
    new Date('2026-11-27T08:15:00.000Z'), new Date('2026-11-27T08:15:01.000Z'),
    new Date('2026-11-27T08:16:00.000Z'), new Date('2026-11-27T08:16:01.000Z'),
  ];
  const statuses = await sendBetterStackHeartbeat({
    url: privateUrl,
    fetchImpl: async () => ({ ok: false, status: 503 }),
    now: () => times.shift(),
    logger: line => logs.push(line),
  });
  const network = await sendBetterStackHeartbeat({
    url: privateUrl,
    fetchImpl: async () => { throw new TypeError('network error'); },
    now: () => times.shift(),
    logger: line => logs.push(line),
  });
  assert.deepEqual(statuses, { ok: false, skipped: false, status: 503 });
  assert.deepEqual(network, { ok: false, skipped: false, status: null });
  assert.ok(logs.some(line => line.includes('HTTP 503')));
  assert.ok(logs.some(line => line.includes('GET failed') && line.includes('TypeError')));
  assert.ok(logs.every(line => !line.includes('example-secret-token')));
});
