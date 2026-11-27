import { appendFile } from 'node:fs/promises';

const BETTERSTACK_HOSTS = new Set([
  'incidents.betterstack.com',
  'uptime.betterstack.com',
]);
const HEARTBEAT_PATH = /^\/api\/v1\/heartbeat\/([^/]+)$/;

export function redactBetterStackUrl(value) {
  const url = new URL(value);
  const pathMatch = url.pathname.match(HEARTBEAT_PATH);
  if (
    url.protocol !== 'https:'
    || !BETTERSTACK_HOSTS.has(url.hostname)
    || url.port
    || url.username
    || url.password
    || !pathMatch
    || pathMatch[1] === '.'
    || pathMatch[1] === '..'
    || /%2f/i.test(pathMatch[1])
  ) {
    throw new Error('Heartbeat URL must use an approved Better Stack HTTPS host and /api/v1/heartbeat/<token> path');
  }

  url.username = '';
  url.password = '';
  url.hash = '';
  url.pathname = '/api/v1/heartbeat/[REDACTED]';
  for (const key of url.searchParams.keys()) url.searchParams.set(key, '[REDACTED]');
  return url.toString();
}

function resultName(result) {
  return result.ok ? 'sent' : result.skipped ? 'skipped' : 'failed';
}

async function writeActionOutput(outputFile, result) {
  if (outputFile) await appendFile(outputFile, `result=${resultName(result)}\n`, 'utf8');
}

export async function sendBetterStackHeartbeat({
  url = process.env.BETTERSTACK_HEARTBEAT_URL,
  fetchImpl = fetch,
  now = () => new Date(),
  logger = text => console.log(text),
  outputFile = process.env.GITHUB_OUTPUT,
} = {}) {
  if (!url?.trim()) {
    const skippedAt = now().toISOString();
    const result = { ok: false, skipped: true, status: null, requestedAt: null, respondedAt: null };
    logger(`Better Stack heartbeat skipped: BETTERSTACK_HEARTBEAT_URL is not configured (${skippedAt}).`);
    await writeActionOutput(outputFile, result);
    return result;
  }

  let safeUrl;
  try {
    safeUrl = redactBetterStackUrl(url.trim());
  } catch {
    const skippedAt = now().toISOString();
    const result = { ok: false, skipped: false, status: null, requestedAt: null, respondedAt: null };
    logger(`Better Stack heartbeat skipped: invalid HTTPS endpoint (${skippedAt}).`);
    await writeActionOutput(outputFile, result);
    return result;
  }

  const requestedAt = now().toISOString();
  logger(`Better Stack heartbeat GET ${safeUrl} at ${requestedAt}`);
  let result;
  try {
    const response = await fetchImpl(url.trim(), {
      method: 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    const respondedAt = now().toISOString();
    logger(`Better Stack heartbeat HTTP ${response.status} for ${safeUrl} at ${respondedAt}`);
    result = { ok: response.ok, skipped: false, status: response.status, requestedAt, respondedAt };
  } catch (error) {
    const failedAt = now().toISOString();
    logger(`Better Stack heartbeat GET failed for ${safeUrl} at ${failedAt} (${error?.name ?? 'network error'}).`);
    result = { ok: false, skipped: false, status: null, requestedAt, respondedAt: failedAt };
  }

  await writeActionOutput(outputFile, result);
  return result;
}
