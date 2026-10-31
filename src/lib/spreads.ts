/**
 * Производные факты по ставкам и инфляции.
 *
 * Здесь нет ни прогноза, ни оценки «дорого/дёшево»: только арифметика на уже
 * опубликованных числах, у каждого из которых есть дата и первоисточник.
 * Реальная ставка, премия за срок и наклон кривой — это разности двух
 * процентов, поэтому они подписаны в процентных пунктах, а не в «процентах от
 * процента».
 *
 * Если хотя бы одного слагаемого нет, строка не считается. Ноль вместо
 * отсутствующего значения выглядел бы как настоящий результат.
 */

import { formatSeriesDelta } from './changes.ts';

export interface SpreadValue {
  /** Значение в процентах годовых, как его отдал источник. */
  value: number;
  /** Дата наблюдения в ISO или подпись периода («сентябрь 2026»). */
  asOf: string;
}

export interface SpreadInput {
  keyRate?: SpreadValue | null;
  inflation?: SpreadValue | null;
  ofz10y?: SpreadValue | null;
  /** Точки кривой: срок в годах (0,25 — три месяца) и доходность в процентах. */
  curve?: Array<{ period: number; value: number }> | null;
  curveAsOf?: string | null;
}

export type SpreadId = 'real-rate' | 'ofz-premium' | 'curve-slope';

export interface MoneySpread {
  id: SpreadId;
  title: string;
  /** Итог в процентных пунктах: «+7,65 п.п.». */
  value: string;
  /** Из чего он получен: «14,00 % − 6,35 %». */
  formula: string;
  /** Что именно сравнивается, вместе с датами. */
  basis: string;
  /** Простыми словами, что эта разница означает. Без прогноза. */
  meaning: string;
}

const NBSP = '\u00A0';

function pct(value: number): string {
  return `${value.toFixed(2).replace('.', ',')}${NBSP}%`;
}

/** Доходность ближайшего срока не дальше допуска: 0,25 года — три месяца. */
function curvePoint(curve: Array<{ period: number; value: number }>, period: number): number | null {
  const sorted = curve
    .filter((point) => Number.isFinite(point?.period) && Number.isFinite(point?.value))
    .slice()
    .sort((a, b) => a.period - b.period);
  const exact = sorted.find((point) => Math.abs(point.period - period) < 1e-6);
  return exact ? exact.value : null;
}

/**
 * Собирает производные факты из того, что уже опубликовано.
 *
 * Порядок фиксирован: сначала «ставка против инфляции» (это про деньги в
 * кармане), потом «премия за срок», потом «наклон кривой».
 */
export function buildMoneySpreads(input: SpreadInput): MoneySpread[] {
  const spreads: MoneySpread[] = [];

  const keyRate = input.keyRate;
  const inflation = input.inflation;
  if (keyRate && inflation && Number.isFinite(keyRate.value) && Number.isFinite(inflation.value)) {
    spreads.push({
      id: 'real-rate',
      title: 'Реальная ставка',
      value: formatSeriesDelta(inflation.value, keyRate.value, '%'),
      formula: `${pct(keyRate.value)} − ${pct(inflation.value)}`,
      basis: `ключевая ${keyRate.asOf}, инфляция ${inflation.asOf}`,
      meaning:
        'Насколько ключевая ставка выше годового роста цен. Числа взяты из разных месяцев: инфляция — за последний опубликованный, ставка — действующая. Сайт их не пересчитывает и не подгоняет под один месяц.',
    });
  }

  if (keyRate && input.ofz10y && Number.isFinite(keyRate.value) && Number.isFinite(input.ofz10y.value)) {
    spreads.push({
      id: 'ofz-premium',
      title: 'Премия за срок',
      value: formatSeriesDelta(keyRate.value, input.ofz10y.value, '%'),
      formula: `${pct(input.ofz10y.value)} − ${pct(keyRate.value)}`,
      basis: `ОФЗ 10 лет ${input.ofz10y.asOf}, ключевая ${keyRate.asOf}`,
      meaning:
        'Насколько доходность десятилетних ОФЗ выше ключевой ставки. Это то, что рынок просит сверх коротких денег за то, чтобы отдать их на десять лет вперёд.',
    });
  }

  const curve = input.curve ?? [];
  const short = curvePoint(curve, 0.25);
  const long = curvePoint(curve, 10);
  if (short !== null && long !== null) {
    spreads.push({
      id: 'curve-slope',
      title: 'Наклон кривой',
      value: formatSeriesDelta(short, long, '%'),
      formula: `${pct(long)} − ${pct(short)}`,
      basis: `10 лет и 3 месяца, кривая ${input.curveAsOf ?? 'без даты'}`,
      meaning:
        'Разница между доходностью на десять лет и на три месяца. Положительная разница означает, что длинные деньги стоят дороже коротких — так выглядит обычная кривая, а не перевёрнутая.',
    });
  }

  return spreads;
}
