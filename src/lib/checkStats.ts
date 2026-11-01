/**
 * Статистика проверок за 7 дней — без сети и без React.
 *
 * Зачем это нужно: самопроверка идёт раз в час. Один красный квадрат на
 * странице состояния читается как «данные не идут», хотя на деле источник мог
 * не ответить в один час из семидесяти двух. Поэтому рядом со свежим прогоном
 * показывается окно: сколько раз проверка проходила и сколько раз падала.
 *
 * Окно считается для тех проверок, которые есть в текущем прогоне. Старые
 * записи в истории остаются и после удаления проверки из кода (в них лежит
 * `forecasts_fresh`), и подмешивать их в «за неделю пройдено N из M» нельзя:
 * это были бы числа от проверок, которых больше нет.
 */

export interface CheckStatRow {
  check_name: string;
  samples: number;
  ok_samples: number;
  last_seen_at: string | null;
  last_fail_at: string | null;
}

export interface CheckTrouble {
  name: string;
  samples: number;
  okSamples: number;
  fails: number;
  lastFailAt: string | null;
}

export interface CheckStats {
  samples: number;
  okSamples: number;
  /** Доля пройденных проверок в процентах, округлённая до целого. */
  okPercent: number | null;
  /** Проверки, у которых за окно были провалы, — от худшей к лучшей. */
  troubles: CheckTrouble[];
  /** Одна строка для страницы состояния. */
  headline: string;
}

const NBSP = '\u00A0';

/** Больше 10 % провалов — это уже не «единичный случай». */
const RARE_SHARE = 0.1;

/** Доля пройденных проверок: 100 только при нуле провалов, иначе — вниз до 0,1. */
function troublesFree(samples: number, okSamples: number): number {
  if (okSamples >= samples) return 100;
  const raw = (okSamples / samples) * 100;
  return Number((Math.floor(raw * 10) / 10).toFixed(1));
}

export function summariseCheckStats(rows: CheckStatRow[], active: string[]): CheckStats {
  const names = new Set(active);
  const scoped = rows.filter((row) => names.has(row.check_name));

  let samples = 0;
  let okSamples = 0;
  const troubles: CheckTrouble[] = [];

  for (const row of scoped) {
    const total = Math.max(0, Number(row.samples) || 0);
    // Отрицательное или большее, чем всего, число «успехов» — испорченная
    // строка. Считать по ней долю значит выдать мусор за статистику.
    const ok = Math.min(total, Math.max(0, Number(row.ok_samples) || 0));
    samples += total;
    okSamples += ok;
    if (total > ok) {
      troubles.push({
        name: row.check_name,
        samples: total,
        okSamples: ok,
        fails: total - ok,
        lastFailAt: row.last_fail_at,
      });
    }
  }

  troubles.sort((a, b) => b.fails - a.fails || a.name.localeCompare(b.name, 'ru'));

  // 1224 из 1228 — это 99,7 %, а не «100 %». Округление до целого скрывало бы
  // провалы: на странице стояло бы «100 %» рядом с четырьмя красными часами.
  // Поэтому 100 % бывает только при нуле провалов, иначе — один знак после
  // запятой и вниз, чтобы число не выглядело лучше реальности.
  const okPercent =
    samples > 0
      ? troublesFree(samples, okSamples)
      : null;

  if (samples === 0) {
    return {
      samples: 0,
      okSamples: 0,
      okPercent: null,
      troubles: [],
      headline: 'Статистики за неделю пока нет: проверки начали писаться меньше семи дней назад.',
    };
  }

  const percentLabel = okPercent === 100 ? '100' : String(okPercent).replace('.', ',');
  const base = `За 7 дней пройдено ${okSamples} из ${samples} проверок — ${percentLabel}${NBSP}%.`;
  if (troubles.length === 0) {
    return { samples, okSamples, okPercent, troubles, headline: `${base} Ни одна проверка не падала.` };
  }

  const worst = troubles[0]!;
  const rare = worst.fails / worst.samples <= RARE_SHARE;
  const tail = rare
    ? ' Предупреждения единичные: в остальные часы эти проверки проходили.'
    : ` У проверки «${worst.name}» провалов ${worst.fails} из ${worst.samples} — это не единичный случай.`;

  return { samples, okSamples, okPercent, troubles, headline: base + tail };
}

/** «104 из 105 за 7 дней» — короткая подпись под конкретной проверкой. */
export function checkWindowLabel(stat: CheckStatRow | undefined): string | null {
  if (!stat) return null;
  const total = Math.max(0, Number(stat.samples) || 0);
  if (total === 0) return null;
  const ok = Math.min(total, Math.max(0, Number(stat.ok_samples) || 0));
  if (ok === total) return `за 7 дней: ${total} из ${total}, без провалов`;
  return `за 7 дней: ${ok} из ${total}`;
}
