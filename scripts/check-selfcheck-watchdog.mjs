const supabaseUrl = process.env.SUPABASE_URL;
const readKey = process.env.SNAPSHOT_SUPABASE_READ_KEY;
const outputPath = process.env.GITHUB_OUTPUT;
const staleAfterMs = 26 * 60 * 60 * 1000;

if (!supabaseUrl || !readKey || !outputPath) {
  throw new Error('Watchdog requires its Supabase connection and GitHub output environment.');
}

const url = new URL('/rest/v1/site_health?select=checked_at&ok=eq.true&order=checked_at.desc&limit=1', supabaseUrl);
let response;
try {
  response = await fetch(url, {
    headers: {
      apikey: readKey,
      authorization: `Bearer ${readKey}`,
      accept: 'application/json',
    },
    signal: AbortSignal.timeout(15_000),
  });
} catch {
  throw new Error('Could not read the latest green site_health row from Supabase.');
}

if (!response.ok) {
  throw new Error(`Supabase site_health query failed with HTTP ${response.status}.`);
}

let rows;
try {
  rows = await response.json();
} catch {
  throw new Error('Supabase site_health response was not valid JSON.');
}
if (!Array.isArray(rows)) throw new Error('Supabase site_health response had an unexpected format.');

let message = '';
if (rows.length === 0) {
  message = 'selfcheck молчит: последняя зелёная запись отсутствует';
} else {
  const checkedAt = Date.parse(rows[0]?.checked_at);
  if (!Number.isFinite(checkedAt)) throw new Error('Latest green site_health row has an invalid checked_at value.');
  if (Date.now() - checkedAt > staleAfterMs) {
    const dateUtc = new Date(checkedAt).toISOString();
    message = `selfcheck молчит: последняя зелёная запись ${dateUtc} (старше 26 часов)`;
  }
}

const delimiter = `WATCHDOG_ALERT_${Date.now()}`;
const lines = [
  `notify=${message ? 'true' : 'false'}`,
  `message<<${delimiter}`,
  message,
  delimiter,
  '',
].join('\n');
const { appendFile } = await import('node:fs/promises');
await appendFile(outputPath, lines, 'utf8');

if (message) console.log('Selfcheck watchdog found a stale or missing green record.');
else console.log('Selfcheck watchdog found a fresh green record; no Telegram message is needed.');
