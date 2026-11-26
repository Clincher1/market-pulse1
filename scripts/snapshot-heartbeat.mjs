const TELEGRAM_API = 'https://api.telegram.org';
export const SNAPSHOT_HEARTBEAT_STALE_AFTER_MS = 6 * 60 * 60 * 1000;
const INSTRUMENTS = [
  { name: 'Brent', identifiers: ['BZ=F', 'brent_yahoo_bzf', 'Brent'] },
  { name: 'S&P 500', identifiers: ['^GSPC', 'sp500_yahoo_gspc', 'S&P 500'] },
  { name: 'Gold', identifiers: ['XAU/USD', 'gold_api_xau_observed_daily', 'XAU', 'Gold'] },
];

function clean(value, limit = 240) {
  return String(value ?? '').replace(/[\r\n\t\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
}

export function isCatchUpRun(lastSuccessfulHeartbeatAt, now = new Date()) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const lastSuccessMs = Date.parse(lastSuccessfulHeartbeatAt ?? '');
  return !Number.isFinite(nowMs) || !Number.isFinite(lastSuccessMs)
    || lastSuccessMs > nowMs
    || nowMs - lastSuccessMs > SNAPSHOT_HEARTBEAT_STALE_AFTER_MS;
}

function identifyFailures(error) {
  const message = String(error?.message ?? error ?? '');
  return INSTRUMENTS.filter(instrument => instrument.identifiers.some(identifier => message.includes(identifier)));
}

function sourceError(error) {
  const detail = clean(error?.message ?? error, 500);
  if (/timeout|timed out/i.test(detail)) return 'timeout';
  if (/HTTP\s+\d{3}/i.test(detail)) return detail.match(/HTTP\s+\d{3}/i)[0].toUpperCase();
  return 'source error';
}

export function createSnapshotHeartbeatReport({ snapshot, error, durationSeconds = 0 } = {}) {
  const duration = Math.max(0, Math.round(Number(durationSeconds) || 0));
  if (!error && Array.isArray(snapshot?.items) && snapshot.items.length === INSTRUMENTS.length) {
    return { outcome: 'ok', okCount: 3, totalCount: 3, durationSeconds: duration, exportedAt: snapshot.exportedAt };
  }

  const failed = identifyFailures(error);
  if (failed.length === 1) {
    return {
      outcome: 'partial',
      instrument: failed[0].name,
      error: sourceError(error),
      durationSeconds: duration,
    };
  }
  return {
    outcome: 'failed',
    error: clean(error?.message ?? error ?? 'Snapshot refresh did not complete'),
    durationSeconds: duration,
  };
}

export function formatSnapshotHeartbeat(report, { timestamp, catchUp = false } = {}) {
  const date = new Date(timestamp || report.exportedAt);
  if (!Number.isFinite(date.getTime())) throw new Error('A valid actual run timestamp is required for the heartbeat');
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(date);
  const seconds = Math.max(0, Math.round(Number(report.durationSeconds) || 0));
  let message;
  if (report.outcome === 'ok') {
    message = `✅ Snapshot OK — ${time} MSK. Instruments: ${report.okCount}/${report.totalCount}. Took ${seconds}s.`;
  } else if (report.outcome === 'partial') {
    message = `⚠️ Snapshot partial — ${time} MSK. ${report.instrument} failed (${report.error}). Other instruments OK. Took ${seconds}s.`;
  } else {
    message = `❌ Snapshot failed — ${time} MSK. All instruments failed. Error: ${report.error}. Took ${seconds}s.`;
  }
  return catchUp ? `${message}\nДогоняющий прогон: предыдущий слот пропущен шедулером` : message;
}

export async function sendSnapshotHeartbeat({
  message,
  token = process.env.TELEGRAM_BOT_TOKEN,
  chatId = process.env.TG_OWNER_CHAT_ID,
  fetchImpl = fetch,
  sleepImpl = ms => new Promise(resolve => setTimeout(resolve, ms)),
  logger = text => console.error(text),
} = {}) {
  if (!chatId?.trim()) {
    logger('Snapshot heartbeat skipped: TG_OWNER_CHAT_ID is not configured.');
    return { ok: false, skipped: true, attempts: 0 };
  }
  if (!token?.trim()) {
    logger('Snapshot heartbeat skipped: TELEGRAM_BOT_TOKEN is not configured.');
    return { ok: false, skipped: true, attempts: 0 };
  }
  const endpoint = `${TELEGRAM_API}/bot${token}/sendMessage`;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: message }),
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error(`Telegram HTTP ${response.status}`);
      let result;
      try { result = await response.json(); } catch { throw new Error('Telegram returned invalid JSON'); }
      if (result?.ok !== true) throw new Error('Telegram rejected the message');
      return { ok: true, attempts: attempt };
    } catch (error) {
      logger(`Snapshot heartbeat delivery failed (attempt ${attempt}/2): ${clean(error?.message ?? 'Telegram request failed', 100)}`);
      if (attempt === 2) return { ok: false, attempts: 2 };
      await sleepImpl(60000);
    }
  }
  return { ok: false, attempts: 2 };
}

export async function runSnapshotWithHeartbeat({
  refresh,
  notify = sendSnapshotHeartbeat,
  now = () => new Date(),
  catchUp = false,
  logger = text => console.log(text),
} = {}) {
  const startedAt = now();
  const startMs = startedAt.getTime();
  let snapshot;
  let error;
  try {
    snapshot = await refresh();
  } catch (caught) {
    error = caught;
  }
  const endedAt = now();
  const durationSeconds = Math.max(0, Math.round((endedAt.getTime() - startMs) / 1000));
  const report = createSnapshotHeartbeatReport({ snapshot, error, durationSeconds });
  const message = formatSnapshotHeartbeat(report, { timestamp: startedAt, catchUp });
  let notification;
  try {
    notification = await notify({ message });
  } catch {
    logger('Snapshot heartbeat failed unexpectedly; snapshot workflow will continue.');
    notification = { ok: false, attempts: 0 };
  }
  if (!notification?.ok && !notification?.skipped) logger('Snapshot heartbeat was not delivered; snapshot workflow will continue.');
  return { snapshot, error, report, message, notification };
}
