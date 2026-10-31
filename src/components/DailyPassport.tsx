import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarCheck, Database, Info } from 'lucide-react';
import {
  fetchDailyPassports,
  moscowTime,
  passportDate,
  passportDateShort,
  type PassportDay,
} from '@/data/dailyPassports';
import { observationLabel } from '@/lib/asOf';
import { ErrorNotice } from './SectionFallback';

/**
 * «Паспорт дня» — неизменяемая запись о том, с чего начался день.
 *
 * Смысл блока в проверяемости: запись делается один раз утром и больше не
 * переписывается (в базе стоит `ignore-duplicates`, то есть побеждает первая
 * вставка дня), поэтому через неделю видно ровно то, что сайт показывал тогда,
 * а не то, что ему удобно показать сейчас.
 *
 * Ничего не досчитывается задним числом: если в снимке нет курса или
 * напряжённости, на их месте прочерк, а не оценка.
 */

function changeWord(change: number): string {
  const value = change.toFixed(2).replace('.', ',');
  return change > 0 ? `+${value} %` : `${value.replace('-', '−')} %`;
}

/**
 * «, цена за 30 окт.» — подпись из того же формата, что и на плитках.
 * Если даты в снимке нет, это сказано прямо: снимки до 31 октября её не
 * сохраняли, и молчание читалось бы как «цена сегодняшняя».
 */
function priceAsOf(asOf: string | null): string {
  const label = observationLabel(asOf);
  return label ? `, цена ${label}` : ', дата цены в снимке не сохранена';
}

/**
 * Хвост строки архива: «, цена за 30 окт.» только когда дата есть.
 * В таблице места мало, поэтому отсутствие даты здесь не расшифровывается —
 * расшифровка стоит один раз в подписи под таблицей.
 */
function archivePriceAsOf(asOf: string | null): string {
  const label = observationLabel(asOf);
  return label ? ` (цена ${label})` : '';
}

function movingWord(days: number): string {
  const mod10 = days % 10;
  const mod100 = days % 100;
  if (mod10 === 1 && mod100 !== 11) return 'день';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'дня';
  return 'дней';
}

export default function DailyPassport() {
  const [days, setDays] = useState<PassportDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const result = await fetchDailyPassports(14);
    setDays(result.days);
    setFailed(result.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const [today, archive] = useMemo(() => {
    if (days.length === 0) return [null, [] as PassportDay[]];
    return [days[0], days.slice(1)] as const;
  }, [days]);

  if (loading) {
    return (
      <section
        id="daily-passport"
        aria-busy="true"
        aria-label="Загрузка паспорта дня"
        className="mb-10 scroll-mt-24 rounded-xl2 border border-border-subtle bg-bg-card p-5 lg:mb-12 lg:p-6"
      >
        <div className="h-4 w-40 animate-pulse rounded-sm bg-white/10" />
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-white/[0.06]" />
          ))}
        </div>
      </section>
    );
  }

  if (failed) {
    return (
      <div className="mb-10 lg:mb-12">
        <ErrorNotice
          title="Паспорт дня недоступен"
          message="Не удалось прочитать архив дневных записей. Это не значит, что записей нет: показать их сейчас нечем, а придумывать значения вместо них мы не будем."
          onRetry={() => {
            setLoading(true);
            setFailed(false);
            void load();
          }}
        />
      </div>
    );
  }

  if (!today) {
    return (
      <section
        id="daily-passport"
        className="mb-10 scroll-mt-24 rounded-xl2 border border-border-subtle bg-bg-card p-5 lg:mb-12 lg:p-6"
      >
        <h2 className="flex items-center gap-2 text-lg font-extrabold text-text-primary">
          <CalendarCheck className="h-5 w-5 text-emerald-300" aria-hidden="true" />
          Паспорт дня
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-secondary">
          Утренняя запись ещё не сделана. Паспорт создаётся один раз в начале дня по
          московскому времени и больше не переписывается.
        </p>
      </section>
    );
  }

  return (
    <section
      id="daily-passport"
      aria-labelledby="daily-passport-title"
      className="mb-10 scroll-mt-24 rounded-xl2 border border-emerald-300/25 bg-emerald-400/[0.04] p-5 lg:mb-12 lg:p-6"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2
          id="daily-passport-title"
          className="flex items-center gap-2 text-lg font-extrabold text-text-primary lg:text-xl"
        >
          <CalendarCheck className="h-5 w-5 text-emerald-300" aria-hidden="true" />
          Паспорт дня
        </h2>
        <span className="text-sm font-bold text-text-secondary">{passportDate(today.date)}</span>
        <span className="text-xs text-text-secondary">
          зафиксировано в {moscowTime(today.capturedAt)} МСК и больше не меняется
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
            Напряжённость на утро
          </div>
          <div className="mt-1 text-2xl font-extrabold tabular-nums text-text-primary">
            {today.tensionValue === null ? '—' : today.tensionValue}
            {today.tensionLabel && (
              <span className="ml-2 text-sm font-bold text-text-secondary">
                {today.tensionLabel}
              </span>
            )}
          </div>
          <div className="mt-1 text-[11px] text-text-secondary">
            {today.tensionNewsCount === null
              ? 'число новостей в снимке не сохранено'
              : `по ${today.tensionNewsCount} новостям в выборке`}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
            Сильнейшее движение
          </div>
          <div className="mt-1 text-2xl font-extrabold tabular-nums text-text-primary">
            {today.topMover ? changeWord(today.topMover.change) : '—'}
          </div>
          <div className="mt-1 text-[11px] text-text-secondary">
            {today.topMover
              ? `${today.topMover.name} — среди пяти мировых индикаторов${priceAsOf(today.topMover.asOf)}`
              : 'в снимке нет движений за день'}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
            Официальный курс USD/RUB
          </div>
          <div className="mt-1 text-2xl font-extrabold tabular-nums text-text-primary">
            {today.usdRub === null
              ? '—'
              : // Через ru-RU: на той же странице курс уже напечатан как
                // «80,6761 ₽», и «80.6761» ниже читалось как другое число.
                `${new Intl.NumberFormat('ru-RU', {
                  minimumFractionDigits: 4,
                  maximumFractionDigits: 4,
                }).format(today.usdRub)} ₽`}
          </div>
          <div className="mt-1 text-[11px] text-text-secondary">
            {today.usdRub === null
              ? 'курс не попал в утренний снимок'
              : 'Банк России, курс дня'}
          </div>
        </div>
      </div>

      <p className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-text-secondary">
        <Database className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          Запись создаётся первой вставкой дня: повторный запуск её не перезаписывает.
          Поэтому сюда нельзя «подтянуть» более удачные цифры задним числом — можно
          только добавить новый день.
        </span>
      </p>

      {archive.length > 0 ? (
        <details className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
          <summary className="cursor-pointer text-[11px] font-extrabold uppercase tracking-[0.12em] text-text-secondary">
            Архив · {archive.length} {movingWord(archive.length)} до сегодня
          </summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-xs tabular-nums">
              <thead className="text-text-secondary">
                <tr>
                  <th scope="col" className="py-1 pr-3 font-bold">Дата</th>
                  <th scope="col" className="py-1 pr-3 font-bold">Фиксация</th>
                  <th scope="col" className="py-1 pr-3 font-bold">Напряжённость</th>
                  <th scope="col" className="py-1 font-bold">Сильнейшее движение</th>
                </tr>
              </thead>
              <tbody className="text-text-secondary">
                {archive.map((day) => (
                  <tr key={day.date} className="border-t border-white/[0.06]">
                    <td className="py-1 pr-3 font-bold text-text-primary">
                      {passportDateShort(day.date)}
                    </td>
                    <td className="py-1 pr-3">{moscowTime(day.capturedAt)} МСК</td>
                    <td className="py-1 pr-3">
                      {day.tensionValue === null ? '—' : day.tensionValue}
                    </td>
                    <td className="py-1">
                      {day.topMover
                        ? `${day.topMover.name} ${changeWord(day.topMover.change)}${archivePriceAsOf(day.topMover.asOf)}`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 flex items-start gap-2 text-[11px] leading-relaxed text-text-secondary">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              Архив начинается с {passportDate(days[days.length - 1]?.date ?? today.date)}:
              раньше снимки не сохранялись, и дорисовать пропущенные дни нельзя.
              Одно и то же движение несколько дней подряд — это не пересчёт, а
              отсутствие нового наблюдения у источника; дата цены, если снимок её
              сохранил, стоит в скобках.
            </span>
          </p>
        </details>
      ) : (
        <p className="mt-3 text-[11px] leading-relaxed text-text-secondary">
          Это первая запись в архиве. Предыдущих дней нет: снимки начали сохраняться
          только сейчас, и заполнить их задним числом невозможно.
        </p>
      )}
    </section>
  );
}
