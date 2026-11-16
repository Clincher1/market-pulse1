import { useEffect, useMemo, useState } from 'react';
import { Activity, ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

import { useLiveAssets } from '@/hooks/useLiveAssets';
import { fetchRussiaHistory, type RussiaHistory } from '@/data/russiaHistory';
import {
  buildChangeNotes,
  buildWeekComparisons,
  datedPoints,
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

/** Мировые котировки: 30 последних закрытий с датами наблюдения. */
const WORLD_DIGITS: Record<string, number> = {
  brent: 2,
  sp500: 2,
  gold: 2,
  btc: 0,
  'usd-eur': 4,
};

/**
 * Единица мирового ряда словами. Без неё два разных золота — 10 149,50 ₽/г на
 * Мосбирже и 3 875,34 $/унц. в мировом блоке — выглядят как ошибка сайта.
 */
const WORLD_UNITS: Record<string, string> = {
  brent: '$ за баррель',
  sp500: 'пункты индекса',
  gold: '$ за тройскую унцию',
  btc: '$ за BTC',
  'usd-eur': 'USD за 1 EUR',
};

function shortDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return '';
  return `${match[3]}.${match[2]}.${match[1]}`;
}

function DirectionBadge({ direction }: { direction: ChangeNote['direction'] }) {
  if (direction === 'flat') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700">
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
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : 'border-rose-200 bg-rose-50 text-rose-800'
      }`}
    >
      <Icon size={12} /> {up ? 'вверх' : 'вниз'}
    </span>
  );
}

function NoteCard({ note }: { note: ChangeNote }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-secondary">
            {note.name}
            {note.unitLabel ? <span className="normal-case tracking-normal text-text-secondary"> · {note.unitLabel}</span> : null}
          </div>
          <h3 className="mt-1 text-base font-extrabold leading-snug text-text-primary">{note.headline}</h3>
        </div>
        <DirectionBadge direction={note.direction} />
      </div>
      <p className="mt-2 text-sm leading-relaxed text-text-secondary">{note.detail}</p>
      <p className="mt-2 text-[11px] text-text-secondary">
        {note.provider}
        {note.lastDate ? ` · данные на ${shortDate(note.lastDate)}` : ' · даты наблюдений источник не передаёт'}
      </p>
    </article>
  );
}

const NBSP = '\u00A0';

function formatPp(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '\u2212' : '';
  return `${sign}${Math.abs(value).toFixed(2).replace('.', ',')}\u00A0п.п.`;
}

function WeekRow({ row }: { row: WeekComparison }) {
  const tone =
    row.deltaPct > 0 ? 'text-emerald-800' : row.deltaPct < 0 ? 'text-rose-800' : 'text-text-secondary';
  // «Выше 88 % окна» — доля значений, которые строго ниже последнего, поэтому
  // подпись не приписывает числу лишнего. Края окна названы словами.
  const place = row.isWindowMax
    ? 'максимум окна'
    : row.isWindowMin
      ? 'минимум окна'
      : `выше ${row.percentile}${NBSP}% окна`;
  return (
    <tr className="border-t border-slate-200">
      <td className="px-3 py-2 text-left font-semibold text-text-primary">
        {row.name}
        {row.unitLabel ? <span className="block text-[11px] font-normal text-text-secondary">{row.unitLabel}</span> : null}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-text-primary">{row.recentLabel}</td>
      <td className="px-3 py-2 text-right tabular-nums text-text-secondary">{row.previousLabel}</td>
      <td className={`px-3 py-2 text-right font-bold tabular-nums ${tone}`}>{formatPp(row.deltaPct)}</td>
      <td className="px-3 py-2 text-right text-[11px] leading-tight text-text-secondary">{place}</td>
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
      // Даты закрытий приходят из кэша вместе со значениями. Если их нет или
      // они не совпадают по длине, ряд остаётся бездатым — подставлять чужие
      // даты нельзя, поэтому datedPoints либо берёт все пары, либо ни одной.
      const dated = datedPoints(asset.sparkline, asset.sparkDates ?? null);
      inputs.push({
        id: `world-${asset.id}`,
        name: asset.name,
        unit: '',
        unitLabel: WORLD_UNITS[asset.id],
        provider: 'кэш мировых котировок',
        dateKind: dated.dateKind,
        digits: WORLD_DIGITS[asset.id] ?? 2,
        points: dated.points,
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
      className="mb-10 scroll-mt-24 rounded-xl2 border border-sky-200 bg-linear-to-br from-sky-50/60 via-white to-white p-5 shadow-sm lg:mb-12 lg:p-6"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-800">
          <Activity size={13} /> динамика
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-secondary">
          факты, не прогноз
        </span>
      </div>

      <h2 id="what-changed-title" className="mt-3 text-2xl font-extrabold tracking-tight text-text-primary">
        Что меняется
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-secondary">
        Здесь только то, что уже произошло: сколько дней подряд ряд движется в одну сторону, где
        последнее значение относительно всего окна, насколько узок диапазон последних дней. Считается
        по закрытиям торговых дней за три месяца у российских рядов и по 30 последним закрытиям
        мировых котировок. Вероятностей и обещаний на будущее в этом блоке нет — по правилам проекта
        их место занимает счёт уже проверенных фактов.
      </p>

      {loading ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-28 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      ) : notes.length > 0 ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {notes.map((note) => (
            <NoteCard key={note.id} note={note} />
          ))}
        </div>
      ) : (
        <p className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-text-secondary">
          Ни одно из правил показа не сработало.
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
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-text-secondary">
            Одно и то же сравнение для всех рядов: насколько значение сдвинулось за последние
            семь точек и насколько — за семь точек до них. Никаких выводов «хорошо/плохо»:
            только два факта и их разница в процентных пунктах.
          </p>
          {/* Таблица шире экрана на телефоне: без tabIndex прокрутить её
              клавиатурой нечем, а мышь для этого недоступна. */}
          <div
            className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-200"
            tabIndex={0}
            role="group"
            aria-label="Сравнение неделя к неделе: таблица прокручивается по горизонтали стрелками."
          >
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-[0.1em] text-text-secondary">
                  <th className="px-3 py-2 text-left font-semibold">Показатель</th>
                  <th className="px-3 py-2 text-right font-semibold">Последние 7</th>
                  <th className="px-3 py-2 text-right font-semibold">7 до них</th>
                  <th className="px-3 py-2 text-right font-semibold">Разница</th>
                  <th className="px-3 py-2 text-right font-semibold">Где в окне</th>
                </tr>
              </thead>
              <tbody>
                {weeks.map((row) => (
                  <WeekRow key={row.id} row={row} />
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-text-secondary">
            «Последние 7» — семь последних наблюдений с датой у каждого: торговые дни у российских
            рядов, дни закрытия у мировых котировок. У ставок и доходностей изменения подписаны в
            процентных пунктах: процент от процента сайт не считает. «Где в окне» — доля значений
            всего окна (три месяца торговых дней или 30 закрытий), которые не выше последнего:
            так видно не только направление, но и место значения среди прошлых.
          </p>
        </div>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-text-secondary">
        У каждого ряда подписана дата последнего наблюдения. Если источник не отдал дату, ряд
        остаётся без неё целиком: строки говорят о позиции значения в окне, а не о числе дней.
        Пропущенные дни не достраиваются — на графиках видно только то, что отдал источник.
      </p>
    </section>
  );
}
