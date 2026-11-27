import { useCallback, useEffect, useState } from 'react';
import { m as motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Radio,
  XCircle,
} from 'lucide-react';
import {
  CHECK_LABELS,
  fetchFeedHealth,
  fetchCheckStats,
  fetchHealthHistory,
  fetchLatestHealth,
  formatCheckedAt,
  groupIncidents,
  hoursSince,
  runCheckNow,
  type FeedRow,
  type HealthRow,
  type HealthRun,
} from '@/data/systemStatus';
import { checkWindowLabel, summariseCheckStats, type CheckStatRow } from '@/lib/checkStats';
import SourcesMonitor from '@/components/SourcesMonitor';
import { HIDDEN_PUBLIC_CHECKS } from '@/lib/checkLabels';

function feedAgeLabel(hours: number | null): string {
  if (hours === null) return 'нет данных';
  if (hours < 1) return `${Math.round(hours * 60)} мин назад`;
  if (hours < 48) return `${hours.toFixed(1)} ч назад`;
  return `${Math.round(hours / 24)} дн назад`;
}

/** Компактная московская метка: «29.10 08:45». */
function mskLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const msk = new Date(date.getTime() + 3 * 3600_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(msk.getUTCDate())}.${pad(msk.getUTCMonth() + 1)} ${pad(msk.getUTCHours())}:${pad(msk.getUTCMinutes())}`;
}

function durationLabel(minutes: number | null): string {
  if (minutes === null) return 'продолжается';
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} ч ${rest} мин` : `${hours} ч`;
}

export default function SystemStatus() {
  const [row, setRow] = useState<HealthRow | null>(null);
  const [history, setHistory] = useState<HealthRun[]>([]);
  const [feeds, setFeeds] = useState<FeedRow[]>([]);
  const [checkStats, setCheckStats] = useState<CheckStatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const [latest, points, feedRows, stats] = await Promise.all([
      fetchLatestHealth(),
      fetchHealthHistory(24),
      fetchFeedHealth(),
      fetchCheckStats(),
    ]);
    setRow(latest);
    setHistory(points);
    setFeeds(feedRows);
    setCheckStats(stats);
    setFailed(!latest);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runNow = async () => {
    setRunning(true);
    setNote(null);
    const result = await runCheckNow();
    if (!result) {
      setNote('Не удалось запустить проверку. Попробуйте ещё раз через минуту.');
    } else if (result.skipped) {
      // При слишком частом нажатии проверка не повторяется, но состояние Linear
      // всё равно обновляется — показываем обе части.
      setNote([result.detail ?? 'Проверка уже запускалась только что.', result.linear].filter(Boolean).join(' · '));
    } else {
      setNote(
        [
          'Проверка выполнена',
          result.linear,
          result.healing,
          result.decisions,
          result.digest,
        ]
          .filter(Boolean)
          .join(' · '),
      );
    }
    await load();
    setRunning(false);
  };

  const checks = Object.fromEntries(
    Object.entries(row?.checks ?? {}).filter(([name]) => !HIDDEN_PUBLIC_CHECKS.has(name)),
  );
  // Старые внутренние проверки остаются в site_health для аудита, но не входят
  // в публичные показатели и список инцидентов дашборда.
  const visibleHistory = history.map((run) => {
    const visibleChecks = Object.fromEntries(
      Object.entries(run.checks ?? {}).filter(([name]) => !HIDDEN_PUBLIC_CHECKS.has(name)),
    );
    const values = Object.values(visibleChecks);
    return { ...run, checks: visibleChecks, ok: values.length > 0 && values.every((check) => check.ok) };
  });
  // Окно за 7 дней: свежий прогон отвечает «что сейчас», окно — «насколько это
  // часто». Один красный час из ста четырёх не означает, что данные не идут.
  const statsByName = new Map(checkStats.map((item) => [item.check_name, item]));
  const weekStats = summariseCheckStats(checkStats, Object.keys(checks));
  const failing = Object.entries(checks).filter(([, value]) => !value.ok);
  const allOk = Object.keys(checks).length > 0 && failing.length === 0;
  // Свежие сбои сверху: последнее, что сломалось, важнее того, что было вчера.
  const incidents = groupIncidents(visibleHistory).slice().reverse();

  return (
    <section id="status" aria-labelledby="status-report-title" className="mx-auto max-w-5xl scroll-mt-[var(--space-6)] px-[var(--space-1)] pt-[var(--space-1)]">
      <div className="mb-[var(--space-3)]">
        <div className="inline-flex items-center gap-[var(--space-1)] rounded-full border border-emerald-200 bg-emerald-50 px-[var(--space-2)] py-[var(--space-1)] text-[11px] font-extrabold uppercase tracking-widest text-emerald-800">
          <Activity className="h-3.5 w-3.5" />
          ТЕКУЩИЙ ОТЧЁТ · ПУБЛИЧНЫЕ ДАННЫЕ
        </div>
        <h2 id="status-report-title" className="mt-[var(--space-2)] text-2xl font-extrabold tracking-tight sm:text-3xl">
          Сайт проверяет сам себя — вот отчёт
        </h2>
        <p className="mt-[var(--space-1)] max-w-3xl text-sm leading-relaxed text-text-secondary sm:text-base">
          Раз в час система проверяет свежесть публикаций и котировок, даты наблюдений,
          доступность истории и архива, сборку PNG-карточки, подключённые ленты и ответ
          сайта. На этой странице показаны проверки текущих публичных данных; старые
          внутренние проверки не участвуют в этой сводке. Результаты сохраняются в базе
          для аудита.
        </p>
      </div>

      {loading ? (
        <div className="min-h-[320px] animate-pulse rounded-[var(--radius)] border border-border-subtle bg-bg-card p-[var(--space-3)]" />
      ) : failed || !row ? (
        <div className="flex items-start gap-[var(--space-2)] rounded-[var(--radius)] border border-amber-200 bg-amber-50 p-[var(--space-3)] text-amber-900">
          <AlertTriangle className="mt-[var(--space-1)] h-5 w-5 shrink-0 text-amber-800" />
          <div>
            <div className="font-bold">Отчёт пока недоступен</div>
            <p className="mt-[var(--space-1)] text-sm text-amber-900">
              Не удалось прочитать таблицу самопроверки. Первая запись
              появляется через несколько минут после очередного часового запуска.
            </p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-[var(--space-2)] inline-flex min-h-11 items-center gap-[var(--space-1)] rounded-full border border-amber-300 bg-white px-[var(--space-2)] py-[var(--space-1)] text-xs font-extrabold text-amber-900 transition-colors hover:bg-amber-100"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Обновить
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Итог и кнопка */}
          <motion.div
            initial={false}
            animate={{ y: 0 }}
            transition={{ duration: 0.4 }}
            className={`mb-[var(--space-3)] rounded-[var(--radius)] border p-[var(--space-3)] sm:p-[var(--space-3)] ${
              allOk
                ? 'border-emerald-200 bg-emerald-50'
                : 'border-rose-200 bg-rose-50'
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-[var(--space-2)]">
              <div className="min-w-0">
                <div className="flex items-center gap-[var(--space-1)]">
                  {allOk ? (
                    <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-700" />
                  ) : (
                    <XCircle className="h-6 w-6 shrink-0 text-rose-700" />
                  )}
                  <span
                    className={`text-lg font-extrabold sm:text-xl ${
                      allOk ? 'text-emerald-800' : 'text-rose-800'
                    }`}
                  >
                    {allOk ? 'Все публичные проверки пройдены' : `Публичных проблемных проверок: ${failing.length}`}
                  </span>
                </div>
                <div className="mt-[var(--space-1)] text-sm text-text-secondary">
                  Последняя проверка: {formatCheckedAt(row.checked_at)}
                  <span className="ml-[var(--space-1)] rounded-full bg-slate-100 px-[var(--space-1)] py-[var(--space-1)] text-[11px] font-bold uppercase tracking-wide">
                    {row.trigger === 'manual' ? 'вручную' : 'по расписанию'}
                  </span>
                </div>
                {!allOk && (
                  <div className="mt-[var(--space-2)] space-y-[var(--space-1)]">
                    {failing.map(([name, value]) => (
                      <div key={name} className="text-sm text-rose-900">
                        <span className="font-bold">
                          {CHECK_LABELS[name]?.title ?? name}:
                        </span>{' '}
                        {value.detail}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => void runNow()}
                disabled={running}
                className="inline-flex min-h-11 shrink-0 items-center gap-[var(--space-1)] rounded-full border border-emerald-200 bg-white px-[var(--space-3)] py-[var(--space-1)] text-sm font-extrabold text-emerald-800 transition-colors hover:bg-emerald-50 disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${running ? 'animate-spin' : ''}`} />
                {running ? 'Проверяем…' : 'Проверить сейчас'}
              </button>
            </div>

            {note && (
              <div className="mt-[var(--space-2)] border-t border-slate-200 pt-[var(--space-2)] text-xs text-text-secondary">
                {note}
              </div>
            )}
          </motion.div>

          {/* История за сутки — как список сбоев, а не как россыпь красных точек */}
          {history.length > 1 && (
            <div className="mb-[var(--space-3)] rounded-[var(--radius)] border border-border-subtle bg-bg-card p-[var(--space-3)]">
              <div className="mb-[var(--space-1)] text-xs font-bold uppercase tracking-widest text-text-secondary">
                Сбои за последние {history.length} проверок
              </div>
              <p className="mb-[var(--space-2)] text-xs leading-relaxed text-text-secondary">
                Подряд идущие красные проверки считаются одним сбоем: восемь часов
                простоя — это одна строка, а не восемь.
              </p>
              {incidents.length === 0 ? (
                <div className="flex items-center gap-[var(--space-1)] text-sm text-emerald-800">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  Ни одной красной проверки в этом окне.
                </div>
              ) : (
                <ul className="space-y-[var(--space-1)]">
                  {incidents.map((incident) => (
                    <li
                      key={incident.start}
                      className={`rounded-xl border p-[var(--space-2)] ${
                        incident.open
                          ? 'border-rose-200 bg-rose-50'
                          : 'border-border-subtle bg-slate-50'
                      }`}
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-x-[var(--space-2)] gap-y-[var(--space-1)]">
                        <span className="text-sm font-bold text-text-primary">
                          {incident.checks
                            .map((name) => CHECK_LABELS[name]?.title ?? name)
                            .join(', ')}
                        </span>
                        <span
                          className={`text-xs font-bold tabular-nums ${
                            incident.open ? 'text-rose-800' : 'text-text-secondary'
                          }`}
                        >
                          {incident.open ? 'идёт сейчас' : durationLabel(incident.minutes)}
                        </span>
                      </div>
                      <div className="mt-[var(--space-1)] text-[11px] text-text-secondary">
                        {incident.startedBeforeWindow
                          ? 'начался раньше окна истории'
                          : `${mskLabel(incident.start)} МСК`}
                        {incident.end ? ` → ${mskLabel(incident.end)} МСК` : ''}
                        {` · проверок внутри: ${incident.runs}`}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Все проверки */}
          <p className="mb-[var(--space-2)] flex items-start gap-[var(--space-1)] rounded-xl border border-border-subtle bg-slate-50 px-[var(--space-2)] py-[var(--space-1)] text-xs leading-relaxed text-text-secondary">
            <Clock className="mt-[var(--space-1)] h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              Зелёный — данные пришли в пределах своего расписания, оно подписано у каждой
              проверки. Красный — источник молчит дольше, чем ему положено: это поломка, а не
              задержка. Недельные резервы ЦБ, RUONIA с публикацией на следующий день и закрытие
              Мосбиржи — расписание, а не простой.
            </span>
          </p>
          {weekStats.samples > 0 && (
            <p className="mb-[var(--space-2)] rounded-xl border border-border-subtle bg-slate-50 px-[var(--space-2)] py-[var(--space-1)] text-xs leading-relaxed text-text-secondary">
              <span className="font-bold text-text-primary">{weekStats.headline}</span>{' '}
              Свежий прогон отвечает, что происходит сейчас; окно за неделю показывает, насколько
              это часто. Источник, не ответивший в один час, — задержка, а не поломка: следующий
              запрос уходит по расписанию, и окно это видно.
            </p>
          )}
          <div className="mb-[var(--space-3)] grid grid-cols-1 gap-[var(--space-2)] sm:grid-cols-2">
            {Object.entries(checks)
              .sort((a, b) => Number(a[1].ok) - Number(b[1].ok))
              .map(([name, value]) => (
                <div
                  key={name}
                  className={`rounded-[var(--radius)] border p-[var(--space-2)] ${
                    value.ok
                      ? 'border-border-subtle bg-bg-card'
                      : 'border-rose-200 bg-rose-50'
                  }`}
                >
                  <div className="flex items-start gap-[var(--space-1)]">
                    {value.ok ? (
                      <CheckCircle2 className="mt-[var(--space-1)] h-4 w-4 shrink-0 text-emerald-700" />
                    ) : (
                      <XCircle className="mt-[var(--space-1)] h-4 w-4 shrink-0 text-rose-700" />
                    )}
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-text-primary">
                        {CHECK_LABELS[name]?.title ?? name}
                      </div>
                      <div className="mt-[var(--space-1)] text-xs text-text-secondary">
                        {CHECK_LABELS[name]?.hint ?? ''}
                      </div>
                      {CHECK_LABELS[name]?.cadence && (
                        <div className="mt-[var(--space-1)] flex items-start gap-[var(--space-1)] text-[11px] text-text-secondary">
                          <Clock className="mt-[var(--space-1)] h-3 w-3 shrink-0" aria-hidden="true" />
                          <span>{CHECK_LABELS[name]?.cadence}</span>
                        </div>
                      )}
                      <div
                        className={`mt-[var(--space-1)] text-xs ${
                          value.ok ? 'text-text-secondary' : 'text-rose-900'
                        }`}
                      >
                        {value.detail}
                      </div>
                      {/* Окно показываем только там, где были провалы: у остальных
                          «105 из 105» на семнадцати карточках — шум. */}
                      {(() => {
                        const stat = statsByName.get(name);
                        if (!stat || stat.ok_samples >= stat.samples) return null;
                        const label = checkWindowLabel(stat);
                        const last = stat.last_fail_at ? mskLabel(stat.last_fail_at) : null;
                        return (
                          <div className="mt-[var(--space-1)] text-[11px] leading-relaxed text-text-secondary">
                            {label}
                            {last ? ` · последнее предупреждение ${last} МСК` : ''}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              ))}
          </div>

          {/* Слоты и источники: откуда взято каждое число */}
          <SourcesMonitor />

          {/* Ленты */}
          {feeds.length > 0 && (
            <div className="mb-[var(--space-3)] rounded-[var(--radius)] border border-border-subtle bg-bg-card p-[var(--space-3)]">
              <div className="mb-[var(--space-2)] flex items-center gap-[var(--space-1)]">
                <Radio className="h-4 w-4 text-emerald-700" />
                <span className="text-xs font-bold uppercase tracking-widest text-text-secondary">
                  Новостные ленты
                </span>
              </div>
              <div
                className="overflow-x-auto focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-200"
                tabIndex={0}
                role="group"
                aria-label="Новостные ленты: таблица прокручивается по горизонтали стрелками."
              >
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-text-secondary">
                    <tr>
                      <th className="pb-[var(--space-1)] pr-[var(--space-2)] font-bold">Лента</th>
                      <th className="pb-[var(--space-1)] pr-[var(--space-2)] font-bold">Последний материал</th>
                      <th className="pb-[var(--space-1)] pr-[var(--space-2)] font-bold">В ленте</th>
                      <th className="pb-[var(--space-1)] font-bold">Новых в проходе</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feeds.map((feed) => {
                      const hours = hoursSince(feed.last_new_at);
                      const stale = hours === null || hours > 24;
                      return (
                        <tr key={feed.source} className="border-t border-slate-200">
                          <td className="py-[var(--space-1)] pr-[var(--space-2)] font-semibold text-text-primary">
                            {feed.source}
                          </td>
                          <td
                            className={`py-[var(--space-1)] pr-[var(--space-2)] ${stale ? 'text-rose-800' : 'text-text-secondary'}`}
                          >
                            {feedAgeLabel(hours)}
                          </td>
                          <td className="py-[var(--space-1)] pr-[var(--space-2)] text-text-secondary">{feed.items}</td>
                          <td className="py-[var(--space-1)] text-text-secondary">{feed.fresh}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-[var(--space-2)] text-xs leading-relaxed text-text-secondary">
                Лента, молчащая больше суток, — кандидат на замену. Именно так
                два года незаметно молчала лента WSJ: материалы из неё читались,
                но база их отбрасывала, и никто об этом не знал.
              </p>
            </div>
          )}

          <p className="text-xs leading-relaxed text-text-secondary">
            Проверка запускается сама каждый час в 25-ю минуту. Кнопка запускает
            её вне очереди, но не чаще одного раза в пять минут — чтобы базу
            нельзя было завалить повторами. Если подключён Linear, при провале
            проверки задача заводится сама и сама закрывается, когда проверка
            снова зелёная.
          </p>

          <p className="mt-[var(--space-1)] text-xs leading-relaxed text-text-secondary">
            Почему состояние меряется свежестью данных, а не отчётом планировщика.
            Задание в расписании отправляет запрос и сразу считается выполненным —
            оно не ждёт ответа функции. Поэтому «задание выполнено» означает лишь
            «запрос отправлен»: пайплайн может восемь часов подряд отвечать
            успехом и не записать ни одной строки. Свежесть самих данных такого
            не пропускает.
          </p>
        </>
      )}
    </section>
  );
}
