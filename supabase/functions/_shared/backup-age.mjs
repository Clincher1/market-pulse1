export const BACKUP_MAX_AGE_MS = 26 * 60 * 60 * 1000;
export const BACKUP_RUNS_API = 'https://api.github.com/repos/Clincher1/market-pulse1/actions/workflows/backup-history.yml/runs?status=success&per_page=1';

export function assessBackupAge(run, nowMs = Date.now()) {
  if (!run || run.conclusion !== 'success') {
    return {
      ok: false,
      completedAt: null,
      ageMs: null,
      detail: 'No successful production history backup was found.',
    };
  }

  const completedMs = Date.parse(run.updated_at ?? run.created_at ?? '');
  if (!Number.isFinite(completedMs) || completedMs > nowMs) {
    return {
      ok: false,
      completedAt: null,
      ageMs: null,
      detail: 'The latest successful backup has an invalid completion time.',
    };
  }

  const ageMs = nowMs - completedMs;
  const completedAt = new Date(completedMs).toISOString();
  const ageHours = (ageMs / (60 * 60 * 1000)).toFixed(1);
  return {
    ok: ageMs <= BACKUP_MAX_AGE_MS,
    completedAt,
    ageMs,
    detail: `Latest successful history backup completed ${completedAt} (${ageHours} hours ago; limit 26 hours).`,
  };
}

export async function getLatestBackupStatus({
  fetchImpl = globalThis.fetch,
  token,
  nowMs = Date.now(),
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('Fetch is unavailable for the GitHub Actions API.');

  const headers = {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
  };
  if (token) headers.authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetchImpl(BACKUP_RUNS_API, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error('Could not query the GitHub backup workflow history.');
  }
  if (!response.ok) throw new Error(`GitHub backup workflow query failed with HTTP ${response.status}.`);

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('GitHub backup workflow response was not valid JSON.');
  }
  if (!Array.isArray(payload?.workflow_runs)) {
    throw new Error('GitHub backup workflow response had an unexpected format.');
  }

  return assessBackupAge(payload.workflow_runs[0] ?? null, nowMs);
}

export function backupAlertMessage(status) {
  if (status.ok) return null;
  const completed = status.completedAt ? ` Last success: ${status.completedAt}.` : '';
  const detail = status.completedAt ? '' : ` ${status.detail}`;
  return `⚠️ History backup alert: no successful production backup within 26 hours.${completed}${detail}`;
}

export function backupTransitionNotification(previous, current) {
  if (!current) return null;
  if (!current.ok && previous?.ok !== false) {
    return `backup_history became unhealthy: ${current.detail}`;
  }
  if (previous?.ok === false && current.ok) {
    return `backup_history recovered: ${current.detail}`;
  }
  return null;
}
