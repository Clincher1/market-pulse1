const INTRADAY_ASSETS = new Set(['brent', 'gold']);
const MS_PER_HOUR = 60 * 60 * 1000;
// Postgres and Edge Runtime clocks can differ briefly; allow small future skew,
// but keep materially future-dated observations invalid.
const FUTURE_TIMESTAMP_TOLERANCE_MS = 10 * 60 * 1000;

function zonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map(({ type, value }) => [type, value]));
}

function dateKey(year, month, day) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function shiftDate(key, days) {
  const date = new Date(`${key}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function weekday(key) {
  return new Date(`${key}T12:00:00.000Z`).getUTCDay();
}

function nthWeekday(year, month, targetDay, n) {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const firstTarget = 1 + ((targetDay - first + 7) % 7);
  return dateKey(year, month, firstTarget + (n - 1) * 7);
}

function lastWeekday(year, month, targetDay) {
  const last = new Date(Date.UTC(year, month, 0));
  const day = last.getUTCDate() - ((last.getUTCDay() - targetDay + 7) % 7);
  return dateKey(year, month, day);
}

function observedFixedDate(year, month, day) {
  const actual = dateKey(year, month, day);
  const dayOfWeek = weekday(actual);
  if (dayOfWeek === 6) return shiftDate(actual, -1);
  if (dayOfWeek === 0) return shiftDate(actual, 1);
  return actual;
}

function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return dateKey(year, month, day);
}

function holidaysForYear(year) {
  const holidays = new Set([
    observedFixedDate(year, 1, 1),
    nthWeekday(year, 1, 1, 3),
    nthWeekday(year, 2, 1, 3),
    shiftDate(easterSunday(year), -2),
    lastWeekday(year, 5, 1),
    nthWeekday(year, 9, 1, 1),
    nthWeekday(year, 11, 4, 4),
    observedFixedDate(year, 12, 25),
  ]);
  if (year >= 2022) holidays.add(observedFixedDate(year, 6, 19));
  holidays.add(observedFixedDate(year, 7, 4));
  return holidays;
}

function isNyseHoliday(key) {
  const year = Number(key.slice(0, 4));
  return [year - 1, year, year + 1].some((candidateYear) => holidaysForYear(candidateYear).has(key));
}

function isTradingWeekday(key) {
  const day = weekday(key);
  return day !== 0 && day !== 6 && !isNyseHoliday(key);
}

function earlyCloseDaysAt1300(year) {
  const candidates = [
    dateKey(year, 7, 3),
    shiftDate(nthWeekday(year, 11, 4, 4), 1),
    dateKey(year, 12, 24),
  ];
  return new Set(candidates.filter(isTradingWeekday));
}

/** Convert a local wall-clock time to UTC using the zone offset on that date. */
function localTimeToUtcMs(key, hour, minute, timeZone) {
  const probe = new Date(`${key}T12:00:00.000Z`);
  const parts = zonedParts(probe, timeZone);
  const localAsUtcMs = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute),
  );
  const offsetMs = localAsUtcMs - probe.getTime();
  const [year, month, day] = key.split('-').map(Number);
  return Date.UTC(year, month - 1, day, hour, minute) - offsetMs;
}

/** Latest completed NYSE session date, accounting for NY-local regular and 13:00 early closes. */
export function latestCompletedNySessionDate(now = new Date()) {
  const parts = zonedParts(now, 'America/New_York');
  const today = dateKey(parts.year, parts.month, parts.day);
  const closeHour = earlyCloseDaysAt1300(Number(parts.year)).has(today) ? 13 : 16;
  let candidate = today;
  if (!isTradingWeekday(today) || Number(parts.hour) < closeHour) candidate = shiftDate(today, -1);
  while (!isTradingWeekday(candidate)) candidate = shiftDate(candidate, -1);
  return candidate;
}

// Schedule approximation for GLDRUB_TOM: this repo records ISS trades near
// 23:50 MSK but does not load official session segments. Assume Mon-Fri
// 09:00-23:50 MSK; Russian holidays below are deliberately simplified, not
// the exchange's full annual transfer calendar.
function russianHolidaysForYear(year) {
  const holidays = new Set();
  for (let day = 1; day <= 8; day++) {
    const key = dateKey(year, 1, day);
    holidays.add(key);
    holidays.add(observedFixedDate(year, 1, day));
  }
  for (const [month, day] of [[2, 23], [3, 8], [5, 1], [5, 9], [6, 12], [11, 4]]) {
    holidays.add(dateKey(year, month, day));
    holidays.add(observedFixedDate(year, month, day));
  }
  return holidays;
}

function isRussianHoliday(key) {
  const year = Number(key.slice(0, 4));
  return [year - 1, year, year + 1].some((candidateYear) => russianHolidaysForYear(candidateYear).has(key));
}

function isGoldSessionDay(key) {
  const day = weekday(key);
  return day !== 0 && day !== 6 && !isRussianHoliday(key);
}

function previousGoldSessionDate(key) {
  let candidate = shiftDate(key, -1);
  while (!isGoldSessionDay(candidate)) candidate = shiftDate(candidate, -1);
  return candidate;
}

function goldSessionAt(now) {
  const parts = zonedParts(now, 'Europe/Moscow');
  const today = dateKey(parts.year, parts.month, parts.day);
  const minuteOfDay = Number(parts.hour) * 60 + Number(parts.minute);
  if (isGoldSessionDay(today) && minuteOfDay >= 9 * 60 && minuteOfDay < 23 * 60 + 50) {
    return { open: true, latestOpenMs: null };
  }

  let latestSessionDate = today;
  if (isGoldSessionDay(today) && minuteOfDay < 9 * 60) {
    latestSessionDate = previousGoldSessionDate(today);
  } else {
    while (!isGoldSessionDay(latestSessionDate)) latestSessionDate = shiftDate(latestSessionDate, -1);
  }
  return {
    open: false,
    latestOpenMs: localTimeToUtcMs(latestSessionDate, 9, 0, 'Europe/Moscow'),
  };
}

// ICE Brent's continuous weekly session is assumed open Sun 20:00-Fri 18:00
// America/New_York (DST-aware). ICE holiday calendars are not encoded; a
// mid-week early close can therefore cause a rare false stale alert.
function brentSessionAt(now) {
  const parts = zonedParts(now, 'America/New_York');
  const today = dateKey(parts.year, parts.month, parts.day);
  const minuteOfDay = Number(parts.hour) * 60 + Number(parts.minute);
  const day = weekday(today);
  const open = (day === 0 && minuteOfDay >= 20 * 60)
    || (day >= 1 && day <= 4)
    || (day === 5 && minuteOfDay < 18 * 60);
  if (open) return { open: true, latestOpenMs: null };

  const daysSinceSunday = day;
  const sessionSunday = shiftDate(today, -(day === 0 ? 7 : daysSinceSunday));
  return {
    open: false,
    latestOpenMs: localTimeToUtcMs(sessionSunday, 20, 0, 'America/New_York'),
  };
}

export function isWeekendDateKey(key) {
  const day = weekday(key);
  return day === 0 || day === 6;
}

export function shouldWarnForStagnation(digestDate, brentChange, goldChange) {
  if (isWeekendDateKey(digestDate)) return false;
  return brentChange !== null && goldChange !== null
    && Math.abs(brentChange) < 0.01 && Math.abs(goldChange) < 0.01;
}

export function moscowDateKey(date = new Date()) {
  const parts = zonedParts(date, 'Europe/Moscow');
  return dateKey(parts.year, parts.month, parts.day);
}

export function moscowHourKey(date = new Date()) {
  return Number(zonedParts(date, 'Europe/Moscow').hour);
}

export function parsePrice(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/[,$\s]/g, '');
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const price = Number(normalized);
  return Number.isFinite(price) && price > 0 ? price : null;
}

export function percentChange(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || current <= 0 || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

function validatedTimestamp(value, label, nowMs) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error(`Invalid ${label} timestamp`);
  if (timestamp > nowMs + FUTURE_TIMESTAMP_TOLERANCE_MS) throw new Error(`Future ${label} timestamp`);
  return timestamp;
}

function observationDate(value, label, nowMs, allowFutureDateOnly = false) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match) throw new Error(`Invalid ${label} date`);
  const key = match[1];
  const parsedDate = Date.parse(`${key}T00:00:00.000Z`);
  const parsedValue = Date.parse(value);
  if (!Number.isFinite(parsedDate) || new Date(parsedDate).toISOString().slice(0, 10) !== key
    || !Number.isFinite(parsedValue)) {
    throw new Error(`Invalid ${label} date`);
  }
  const futureToleranceMs = value === key ? 0 : FUTURE_TIMESTAMP_TOLERANCE_MS;
  if (parsedValue > nowMs + futureToleranceMs && !(allowFutureDateOnly && value === key)) throw new Error(`Future ${label} date`);
  return key;
}

/** Returns a per-asset verdict; throws for malformed or future timestamps (caller maps these to 503). */
export function evaluateAsset(assetId, row, now = new Date()) {
  if (!row) return { status: 'no_data', reason: 'row_missing', price: null, asOf: null, updatedAt: null };
  const nowMs = now.getTime();
  const price = parsePrice(row.price);
  const updatedMs = row.updated_at == null || row.updated_at === ''
    ? null
    : validatedTimestamp(row.updated_at, `${assetId} updated_at`, nowMs);
  const asOfDate = row.as_of == null || row.as_of === ''
    ? null
    : observationDate(row.as_of, `${assetId} as_of`, nowMs, assetId === 'sp500');

  if (assetId === 'sp500') {
    if (price === null || asOfDate === null) {
      return { status: 'no_data', reason: 'price_or_as_of_missing', price, asOf: asOfDate, updatedAt: row.updated_at ?? null };
    }
    const nyParts = zonedParts(now, 'America/New_York');
    const currentNyDate = dateKey(nyParts.year, nyParts.month, nyParts.day);
    if (asOfDate > currentNyDate) throw new Error(`Invalid sp500 as_of: ${asOfDate} is later than the current NY date ${currentNyDate}`);
    const expected = latestCompletedNySessionDate(now);
    const currentSessionQuote = asOfDate === currentNyDate;
    return {
      status: currentSessionQuote || asOfDate === expected ? 'ok' : 'stale',
      reason: currentSessionQuote || asOfDate === expected ? null : `session_date_${asOfDate}_expected_${expected}`,
      price,
      asOf: asOfDate,
      updatedAt: row.updated_at ?? null,
      expectedSessionDate: expected,
    };
  }

  if (!INTRADAY_ASSETS.has(assetId)) throw new Error(`Unsupported monitor asset: ${assetId}`);
  if (price === null || updatedMs === null) {
    return { status: 'no_data', reason: 'price_or_updated_at_missing', price, asOf: asOfDate, updatedAt: row.updated_at ?? null };
  }
  const ageMs = nowMs - updatedMs;
  const session = assetId === 'gold' ? goldSessionAt(now) : brentSessionAt(now);
  const fresh = session.open
    ? ageMs <= 2 * MS_PER_HOUR
    : updatedMs >= session.latestOpenMs;
  return {
    status: fresh ? 'ok' : 'stale',
    reason: fresh
      ? null
      : session.open
      ? `cache_age_minutes_${Math.floor(ageMs / 60_000)}`
      : `not_updated_since_latest_session_open_${new Date(session.latestOpenMs).toISOString()}`,
    price,
    asOf: asOfDate,
    updatedAt: row.updated_at,
    ageMinutes: Math.floor(ageMs / 60_000),
  };
}

export function overallVerdict(verdicts) {
  if (Object.values(verdicts).some((verdict) => verdict.status === 'no_data')) return 'no_data';
  if (Object.values(verdicts).some((verdict) => verdict.status === 'stale')) return 'stale';
  return 'ok';
}
