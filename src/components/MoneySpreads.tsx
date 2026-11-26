import { Calculator } from 'lucide-react';

import type { MoneySpread } from '@/lib/spreads';

/**
 * Производные факты по ставкам: реальная ставка, премия за срок, наклон кривой.
 *
 * Каждая строка — разность двух опубликованных процентов, подписанная в
 * процентных пунктах. Формула напечатана рядом с результатом, поэтому любое
 * число можно пересчитать на бумаге и сверить с плитками выше.
 *
 * Прогноза здесь нет и быть не может: это арифметика, а не мнение о будущем.
 */
export default function MoneySpreads({ spreads }: { spreads: MoneySpread[] }) {
  if (spreads.length === 0) return null;

  return (
    <div className="mt-[var(--space-3)] rounded-2xl border border-slate-200 bg-white/90 p-[var(--space-2)] shadow-sm">
      <div className="flex flex-wrap items-center gap-[var(--space-1)]">
        <span className="inline-flex items-center gap-[var(--space-1)] text-xs font-extrabold uppercase tracking-[0.12em] text-slate-700">
          <Calculator size={13} className="text-blue-700" aria-hidden="true" />
          Что следует из этих чисел
        </span>
        <span className="text-xs text-slate-600">арифметика, не прогноз</span>
      </div>

      <div className="mt-[var(--space-2)] grid gap-[var(--space-2)] sm:grid-cols-2 lg:grid-cols-3">
        {spreads.map((spread) => (
          <div key={spread.id} className="rounded-xl border border-slate-200 bg-slate-50/80 p-[var(--space-2)]">
            <div className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-700">
              {spread.title}
            </div>
            <div className="mt-[var(--space-1)] text-xl font-extrabold tabular-nums text-text-primary">{spread.value}</div>
            <div className="mt-[var(--space-1)] text-xs tabular-nums text-text-secondary">{spread.formula}</div>
            <div className="mt-[var(--space-1)] text-xs text-text-secondary">{spread.basis}</div>
            <p className="mt-[var(--space-1)] text-xs leading-relaxed text-text-secondary">{spread.meaning}</p>
          </div>
        ))}
      </div>

      <p className="mt-[var(--space-2)] text-xs leading-relaxed text-text-secondary">
        Разность двух процентов подписана в процентных пунктах: процент от процента сайт не
        считает. Каждое слагаемое — опубликованное значение из плиток выше, со своей датой; ничего
        не досчитано и не сглажено.
      </p>
    </div>
  );
}
