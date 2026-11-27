import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
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
    assert.deepEqual(result, { ok: true, skipped: false, status: 200, requestedAt: '2026-11-27T08:15:00.000Z', respondedAt: '2026-11-27T08:15:01.000Z' });
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
  assert.deepEqual(result, { ok: false, skipped: true, status: null, requestedAt: null, respondedAt: null });
  assert.equal(called, false);
  assert.match(logs[0], /BETTERSTACK_HEARTBEAT_URL is not configured/);
});

test('Better Stack accepts both approved hosts and masks their heartbeat tokens', () => {
  for (const host of ['incidents.betterstack.com', 'uptime.betterstack.com']) {
    const safeUrl = redactBetterStackUrl(`https://${host}/api/v1/heartbeat/private-token`);
    assert.equal(safeUrl, `https://${host}/api/v1/heartbeat/[REDACTED]`);
    assert.doesNotMatch(safeUrl, /private-token/);
  }
});

test('Better Stack incidents endpoint sends a real GET after validation', async () => {
  const url = 'https://incidents.betterstack.com/api/v1/heartbeat/incidents-secret-token';
  const logs = [];
  let request;
  const result = await sendBetterStackHeartbeat({
    url,
    fetchImpl: async (...args) => { request = args; return { ok: true, status: 200 }; },
    now: () => new Date('2026-11-27T08:15:00.000Z'),
    logger: line => logs.push(line),
    outputFile: '',
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.equal(request[0], url);
  assert.equal(request[1].method, 'GET');
  assert.ok(logs.every(line => !line.includes('incidents-secret-token')));
  assert.ok(logs.some(line => line.includes('https://incidents.betterstack.com/api/v1/heartbeat/[REDACTED]')));
});

test('Better Stack rejects non-HTTPS, foreign hosts, or malformed heartbeat paths before sending', () => {
  const invalidUrls = [
    'http://uptime.betterstack.com/api/v1/heartbeat/token',
    'https://example.com/api/v1/heartbeat/token',
    'https://sub.uptime.betterstack.com/api/v1/heartbeat/token',
    'https://incidents.betterstack.com/api/v1/heartbeat',
    'https://uptime.betterstack.com/heartbeat/token',
    'https://uptime.betterstack.com/api/v1/heartbeat/',
    'https://incidents.betterstack.com/api/v1/heartbeat/token/extra',
    'https://incidents.betterstack.com/api/v1/heartbeat/token/',
    'https://uptime.betterstack.com/api/v1/heartbeat/token%2Fextra',
    'https://incidents.betterstack.com:8443/api/v1/heartbeat/token',
    'https://user:password@incidents.betterstack.com/api/v1/heartbeat/token',
  ];
  for (const url of invalidUrls) assert.throws(() => redactBetterStackUrl(url), url);
});

test('Better Stack CLI exits unsuccessfully and emits a safe annotation when its secret is absent', () => {
  const result = spawnSync(process.execPath, ['scripts/send-betterstack-heartbeat.mjs'], {
    env: { ...process.env, BETTERSTACK_HEARTBEAT_URL: '', GITHUB_OUTPUT: '' },
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /::error title=Better Stack heartbeat failed::GET \(not configured\); heartbeat configuration missing or invalid/);
  assert.doesNotMatch(result.stdout, /heartbeat\/[^\s)]+/);
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
  assert.deepEqual(statuses, { ok: false, skipped: false, status: 503, requestedAt: '2026-11-27T08:15:00.000Z', respondedAt: '2026-11-27T08:15:01.000Z' });
  assert.deepEqual(network, { ok: false, skipped: false, status: null, requestedAt: '2026-11-27T08:16:00.000Z', respondedAt: '2026-11-27T08:16:01.000Z' });
  assert.ok(logs.some(line => line.includes('HTTP 503')));
  assert.ok(logs.some(line => line.includes('GET failed') && line.includes('TypeError')));
  assert.ok(logs.every(line => !line.includes('example-secret-token')));
});
