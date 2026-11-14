import { useEffect, useState } from 'react';
import { Cookie, Fingerprint, ListChecks, Timer } from 'lucide-react';
import { PUBLIC_CHECK_NAMES } from '@/lib/checkLabels';
import { summariseCheckStats, type CheckStatRow } from '@/lib/checkStats';
import { fetchCheckStats } from '@/data/systemStatus';

/**
 * Полоса якорей доверия — четыре факта вместо обещаний.
 *
 * Приём с лендингов: короткие плашки с числами в первом экране («10 лет
 * истории», «<1 с доставка»). Здесь в те же плашки положено только то, что
 * можно проверить на самом сайте: число проверок берётся из реестра подписей,
 * доля пройденных — из окна самопроверки за 7 дней, две последние плашки —
 * свойства страницы, которые видно в инструментах разработчика (ни одной
 * cookie, ни одного внешнего хоста, источник и время у каждого числа).
 *
 * Числа не подставляются, если не загрузились: в плашке появляется «—» и
 * подпись, что статистика недоступна. Пустое место честнее выдуманных 99 %.
 */
const ACTIVE_CHECKS = PUBLIC_CHECK_NAMES;
const NBSP = '\u00A0';

/** 1443 → «1 443»: разряды через узкий неразрывный пробел, как в цене. */
function groupDigits(value: number): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

export default function TrustStrip() {
  const [stats, setStats] = useState<CheckStatRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchCheckStats()
      .then((rows) => {
        if (cancelled) return;
        if (rows.length === 0) setFailed(true);
        else setStats(rows);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const summary = stats ? summariseCheckStats(stats, ACTIVE_CHECKS) : null;
  // Разряды и знаки после запятой — вручную (NBSP + запятая): Intl в узкой
  // плашке дал бы «99.6 %» через locale-фолбэк, а lib-функции сайта печатают
  // проценты иначе, чем проценты прогонов.
  const passRate =
    summary && summary.okPercent !== null
      ? `${String(summary.okPercent).replace('.', ',')}${NBSP}%`
      : '—';
  const passNote = summary
    ? summary.okPercent !== null
      ? `${groupDigits(summary.okSamples)} из ${groupDigits(summary.samples)} прогонов за 7 дней`
      : 'окно пока пустое'
    : failed
      ? 'статистика недоступна'
      : 'считаем окно…';

  const cells = [
    {
      icon: ListChecks,
      value: String(ACTIVE_CHECKS.length),
      title: 'проверок каждый час',
      note: 'свежесть, сходимость чисел с рядами, даты наблюдений',
    },
    {
      icon: Timer,
      value: passRate,
      title: 'прогонов прошли',
      note: passNote,
    },
    {
      icon: Cookie,
      value: '0',
      title: 'cookies и трекеров',
      note: 'без аналитики и внешних счётчиков — проверяется в инструментах браузера',
    },
    {
      icon: Fingerprint,
      value: 'у каждого',
      title: 'числа — источник и время',
      note: 'если данных нет, стоит прочерк, а не ноль',
    },
  ];

  return (
    <section aria-label="Что можно проверить на этом сайте" className="mb-8 lg:mb-10">
      <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {cells.map((cell) => (
          <div
            key={cell.title}
            className="rounded-xl border border-white/10 bg-bg-card px-3.5 py-3"
          >
            <dt className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-text-secondary">
              <cell.icon className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
              {cell.title}
            </dt>
            <dd
              className={`mt-1 text-2xl font-extrabold leading-none text-text-primary ${
                /^[\d—]/.test(cell.value) ? 'tabular-nums' : ''
              }`}
            >
              {cell.value}
            </dd>
            <dd className="mt-1.5 text-[11px] leading-snug text-text-secondary">{cell.note}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
