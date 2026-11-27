import { appendFile } from 'node:fs/promises';

const BETTERSTACK_HOST = 'uptime.betterstack.com';

export function redactBetterStackUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== BETTERSTACK_HOST) {
    throw new Error('Heartbeat URL must use the Better Stack HTTPS endpoint');
  }

  url.username = '';
  url.password = '';
  url.hash = '';
  const path = url.pathname.split('/');
  const heartbeatIndex = path.findIndex(segment => segment === 'heartbeat');
  if (heartbeatIndex >= 0 && path[heartbeatIndex + 1]) path[heartbeatIndex + 1] = '[REDACTED]';
  url.pathname = path.join('/');
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
    const result = { ok: false, skipped: true, status: null };
    logger(`Better Stack heartbeat skipped: BETTERSTACK_HEARTBEAT_URL is not configured (${now().toISOString()}).`);
    await writeActionOutput(outputFile, result);
    return result;
  }

  let safeUrl;
  try {
    safeUrl = redactBetterStackUrl(url.trim());
  } catch {
    const result = { ok: false, skipped: false, status: null };
    logger(`Better Stack heartbeat skipped: invalid HTTPS endpoint (${now().toISOString()}).`);
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
    result = { ok: response.ok, skipped: false, status: response.status };
  } catch (error) {
    const failedAt = now().toISOString();
    logger(`Better Stack heartbeat GET failed for ${safeUrl} at ${failedAt} (${error?.name ?? 'network error'}).`);
    result = { ok: false, skipped: false, status: null };
  }

  await writeActionOutput(outputFile, result);
  return result;
}
