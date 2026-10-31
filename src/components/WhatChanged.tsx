import { useEffect, useMemo, useState } from 'react';
import { Activity, ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

import { useLiveAssets } from '@/hooks/useLiveAssets';
import { fetchRussiaHistory, type RussiaHistory } from '@/data/russiaHistory';
import {
  buildChangeNotes,
  buildWeekComparisons,
  type ChangeInput,
  type ChangeNote,
  type WeekComparison,
} from '@/lib/changes';
import { ErrorNotice } from './SectionFallback';

/**
 * «Что меняется» — факты о движении рядов за прошедшие дни.
 *
 * Блок отвечает на вопрос «что произошло», а не «что будет»: серия дней в одну
 * сторону, выход на край окна, узкий диапазон. Все числа берутся из тех же
 * рядов, что и графики ниже, поэтому любую строку можно проверить глазами.
 *
 * Прогнозов здесь нет намеренно: вероятность без доказанной точности — это
 * обещание, которое сайт не может выполнить.
 */

/** Сколько знаков показывать: у курсов ЦБ их четыре, у остальных — два. */
const DIGITS_BY_SERIES: Record<string, number> = {
  'usd-rub': 4,
  'usd-eur': 4,
  reserves: 1,
};

/** Мировые котировки приходят как 30 значений без дат закрытия. */
const WORLD_DIGITS: Record<string, number> = {
  brent: 2,
  sp500: 2,
  gold: 2,
  btc: 2,
  'usd-eur': 4,
};

function shortDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return '';
  return `${match[3]}.${match[2]}.${match[1]}`;
}

function DirectionBadge({ direction }: { direction: ChangeNote['direction'] }) {
  if (direction === 'flat') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.04] px-2 py-1 text-[11px] font-semibold text-slate-300">
        <Minus size={12} /> без направления
      </span>
    );
  }
  const up = direction === 'up';
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold ${
        up
          ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-200'
          : 'border-rose-300/30 bg-rose-400/10 text-rose-200'
      }`}
    >
      <Icon size={12} /> {up ? 'вверх' : 'вниз'}
    </span>
  );
}

function NoteCard({ note }: { note: ChangeNote }) {
  return (
    <article className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-secondary">
            {note.name}
          </div>
          <h3 className="mt-1 text-base font-extrabold leading-snug text-white">{note.headline}</h3>
        </div>
        <DirectionBadge direction={note.direction} />
      </div>
      <p className="mt-2 text-sm leading-relaxed text-text-secondary">{note.detail}</p>
      <p className="mt-2 text-[11px] text-slate-400">
        {note.provider}
        {note.lastDate ? ` · данные на ${shortDate(note.lastDate)}` : ' · даты закрытий источник не передаёт'}
      </p>
    </article>
  );
}

function formatPp(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '\u2212' : '';
  return `${sign}${Math.abs(value).toFixed(2).replace('.', ',')}\u00A0п.п.`;
}

function WeekRow({ row }: { row: WeekComparison }) {
  const tone =
    row.deltaPct > 0 ? 'text-emerald-300' : row.deltaPct < 0 ? 'text-rose-300' : 'text-slate-300';
  return (
    <tr className="border-t border-white/[0.07]">
      <td className="px-3 py-2 text-left font-semibold text-text-primary">{row.name}</td>
      <td className="px-3 py-2 text-right tabular-nums text-text-primary">{row.recentLabel}</td>
      <td className="px-3 py-2 text-right tabular-nums text-text-secondary">{row.previousLabel}</td>
      <td className={`px-3 py-2 text-right font-bold tabular-nums ${tone}`}>{formatPp(row.deltaPct)}</td>
    </tr>
  );
}

export default function WhatChanged() {
  const [history, setHistory] = useState<RussiaHistory | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const { assets, loading: assetsLoading } = useLiveAssets();

  useEffect(() => {
    let alive = true;
    fetchRussiaHistory().then((payload) => {
      if (!alive) return;
      setHistory(payload);
      setHistoryError(payload.errors.length > 0 ? payload.errors[0] ?? null : null);
    });
    return () => {
      alive = false;
    };
  }, []);

  const { notes, weeks } = useMemo(() => {
    const inputs: ChangeInput[] = [];

    for (const series of history?.series ?? []) {
      inputs.push({
        id: series.id,
        name: series.name,
        unit: series.unit,
        provider: series.provider,
        dateKind: 'day',
        digits: DIGITS_BY_SERIES[series.id] ?? 2,
        points: series.points.map((point) => ({ date: point.date, value: point.value })),
      });
    }

    for (const asset of assets) {
      if (!asset.sparkline || asset.sparkline.length < 2) continue;
      if (asset.price === '—') continue;
      inputs.push({
        id: `world-${asset.id}`,
        name: asset.name,
        unit: '',
        provider: 'кэш мировых котировок',
        dateKind: 'sample',
        digits: WORLD_DIGITS[asset.id] ?? 2,
        points: asset.sparkline.map((value) => ({ date: '', value })),
      });
    }

    return {
      notes: buildChangeNotes(inputs),
      weeks: buildWeekComparisons(inputs).slice(0, 8),
    };
  }, [history, assets]);

  const loading = history === null || (assetsLoading && assets.length === 0);

  return (
    <section
      aria-labelledby="what-changed-title"
      className="mb-10 scroll-mt-24 rounded-xl2 border border-sky-300/20 bg-sky-400/[0.03] p-5 lg:mb-12 lg:p-6"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-2 rounded-full border border-sky-300/30 bg-sky-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-200">
          <Activity size={13} /> динамика
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
          факты, не прогноз
        </span>
      </div>

      <h2 id="what-changed-title" className="mt-3 text-2xl font-extrabold tracking-tight text-white">
        Что меняется
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-secondary">
        Здесь только то, что уже произошло: сколько дней подряд ряд движется в одну сторону, где
        последнее значение относительно всего окна, насколько узок диапазон последних дней. Считается
        по закрытиям торговых дней за три месяца и по 30 последним значениям мировых котировок.
        Вероятностей и обещаний на будущее в этом блоке нет — по правилам проекта их место занимает
        счёт уже проверенных фактов.
      </p>

      {loading ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-28 animate-pulse rounded-xl bg-white/[0.05]" />
          ))}
        </div>
      ) : notes.length > 0 ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {notes.map((note) => (
            <NoteCard key={note.id} note={note} />
          ))}
        </div>
      ) : (
        <p className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-relaxed text-text-secondary">
          За последние дни ни один ряд не дал серии из трёх дней подряд, не вышел на край окна и не
          сжался в узкий диапазон. Это тоже факт: рынок движется в своих обычных пределах, и
          выдумывать «сигнал» из этого не нужно.
        </p>
      )}

      {historyError && (
        <div className="mt-4">
          <ErrorNotice title="История рядов не загрузилась" message={historyError} />
        </div>
      )}

      {weeks.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-extrabold uppercase tracking-[0.12em] text-text-secondary">
            Неделя к неделе
          </h3>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-400">
            Одно и то же сравнение для всех рядов: насколько значение сдвинулось за последние
            семь точек и насколько — за семь точек до них. Никаких выводов «хорошо/плохо»:
            только два факта и их разница в процентных пунктах.
          </p>
          <div className="mt-3 overflow-x-auto rounded-xl border border-white/10 bg-white/[0.03]">
            <table className="w-full min-w-[520px] border-collapse text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-[0.1em] text-slate-400">
                  <th className="px-3 py-2 text-left font-semibold">Показатель</th>
                  <th className="px-3 py-2 text-right font-semibold">Последние 7</th>
                  <th className="px-3 py-2 text-right font-semibold">7 до них</th>
                  <th className="px-3 py-2 text-right font-semibold">Разница</th>
                </tr>
              </thead>
              <tbody>
                {weeks.map((row) => (
                  <WeekRow key={row.id} row={row} />
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
            «Последние 7» — торговые дни с датами у российских рядов и семь последних значений у
            мировых котировок: даты закрытий источник для них не передаёт.
          </p>
        </div>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-slate-400">
        У мировых котировок источник не передаёт даты закрытий — поэтому для них считается позиция в
        окне, а не число дней. У российских рядов даты есть, и они подписаны в каждой строке.
      </p>
    </section>
  );
}
