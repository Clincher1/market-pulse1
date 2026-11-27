import { redactBetterStackUrl, sendBetterStackHeartbeat } from './betterstack-heartbeat.mjs';

const configuredUrl = process.env.BETTERSTACK_HEARTBEAT_URL?.trim();
let safeUrl = '(not configured)';
if (configuredUrl) {
  try {
    safeUrl = redactBetterStackUrl(configuredUrl);
  } catch {
    safeUrl = '(invalid endpoint; URL withheld)';
  }
}

const result = await sendBetterStackHeartbeat();
if (result.ok) {
  console.log(`::notice title=Better Stack heartbeat confirmed::GET ${safeUrl} at ${result.requestedAt}; HTTP ${result.status} at ${result.respondedAt}.`);
} else {
  const reason = result.skipped
    ? 'heartbeat configuration missing or invalid'
    : `HTTP ${result.status ?? 'no response'}`;
  const timing = result.requestedAt ? ` at ${result.requestedAt}` : '';
  console.log(`::error title=Better Stack heartbeat failed::GET ${safeUrl}${timing}; ${reason}.`);
  process.exitCode = 1;
}
