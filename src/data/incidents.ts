import type { HealthIncident, HealthRun } from './healthTypes';

/**
 * Склеивает подряд идущие красные прогоны в инциденты.
 *
 * Правила:
 *  - две красные проверки с разрывом меньше 90 минут — одна серия;
 *  - конец серии — первый зелёный прогон после неё, поэтому длительность
 *    считается по факту восстановления, а не по последней записанной точке;
 *  - незакрытая серия помечается `open`;
 *  - если серия начинается на самой старой записи окна, её реальное начало
 *    неизвестно, и это сказано явно, а не выдумано.
 *
 * Функция не знает про сеть и время «сейчас» — все выводы только из строк.
 */
/** Метка времени или NaN. Дата, которую не удалось прочитать, не должна
 *  превращаться в «NaN ч» на странице — она должна честно стать «неизвестно». */
function ts(iso: string): number {
  return Date.parse(iso);
}

export function groupIncidents(rowsDesc: HealthRun[]): HealthIncident[] {
  if (!rowsDesc.length) return [];

  // От старых к новым: так «первый зелёный после серии» ищется вперёд.
  const rows = [...rowsDesc].sort((a, b) => {
    const left = ts(a.checked_at);
    const right = ts(b.checked_at);
    if (Number.isNaN(left)) return 1;
    if (Number.isNaN(right)) return -1;
    return left - right;
  });

  const incidents: HealthIncident[] = [];
  let current: HealthIncident | null = null;
  let lastRedAt: number | null = null;

  rows.forEach((row, index) => {
    if (row.ok) {
      // Зелёный прогон закрывает открытую серию.
      if (current && current.open) {
        current.open = false;
        current.end = row.checked_at;
        const delta = ts(row.checked_at) - ts(current.start);
        current.minutes = Number.isFinite(delta) ? Math.round(delta / 60_000) : null;
        current = null;
      }
      return;
    }

    const at = ts(row.checked_at);
    const failing = Object.entries(row.checks ?? {})
      .filter(([, value]) => !value.ok)
      .map(([name]) => name);

    // Разрыв больше 90 минут — другая серия: между ними был зелёный прогон,
    // которого просто нет в окне истории.
    const newSeries = lastRedAt !== null && at - lastRedAt > 90 * 60_000;

    if (!current || newSeries) {
      current = {
        start: row.checked_at,
        end: null,
        minutes: null,
        open: true,
        startedBeforeWindow: index === 0,
        checks: failing,
        runs: 0,
      };
      incidents.push(current);
    }

    current.runs += 1;
    current.checks = Array.from(new Set([...current.checks, ...failing]));
    lastRedAt = at;
  });

  return incidents;
}
