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
    <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-300">
          <Calculator size={13} className="text-blue-300" aria-hidden="true" />
          Что следует из этих чисел
        </span>
        <span className="text-[11px] text-slate-500">арифметика, не прогноз</span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {spreads.map((spread) => (
          <div key={spread.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
              {spread.title}
            </div>
            <div className="mt-1 text-xl font-extrabold tabular-nums text-white">{spread.value}</div>
            <div className="mt-0.5 text-[11px] tabular-nums text-slate-400">{spread.formula}</div>
            <div className="mt-1 text-[11px] text-slate-500">{spread.basis}</div>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-300">{spread.meaning}</p>
          </div>
        ))}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
        Разность двух процентов подписана в процентных пунктах: процент от процента сайт не
        считает. Каждое слагаемое — опубликованное значение из плиток выше, со своей датой; ничего
        не досчитано и не сглажено.
      </p>
    </div>
  );
}
