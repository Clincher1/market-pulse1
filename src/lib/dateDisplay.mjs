const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;

function isValidCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
});
const timestampFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'UTC',
});

/** Format a date or full ISO timestamp for display, without changing its source value. */
export function formatObservationTimestamp(value) {
  if (typeof value !== 'string') return '';
  const iso = value.trim();
  if (dateOnlyPattern.test(iso)) {
    if (!isValidCalendarDate(iso)) return '';
    return dateFormatter.format(new Date(`${iso}T00:00:00Z`));
  }
  if (!timestampPattern.test(iso) || !isValidCalendarDate(iso.slice(0, 10))) return '';
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = Object.fromEntries(timestampFormatter.formatToParts(date).map(({ type, value: part }) => [type, part]));
  return `${parts.day}.${parts.month}.${parts.year} ${parts.hour}:${parts.minute} UTC`;
}
