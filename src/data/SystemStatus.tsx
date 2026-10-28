import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Radio,
  XCircle,
} from 'lucide-react';
import {
  CHECK_LABELS,
  fetchFeedHealth,
  fetchHealthHistory,
  fetchLatestHealth,
  formatCheckedAt,
  hoursSince,
  runCheckNow,
  type FeedRow,
  type HealthRow,
} from '@/data/systemStatus';

type HistoryPoint = { checked_at: string; ok: boolean; trigger: string };

function feedAgeLabel(hours: number | null): string {
  if (hours === null) return 'нет данных';
  if (hours < 1) return `${Math.round(hours * 60)} мин назад`;
  if (hours < 48) return `${hours.toFixed(1)} ч назад`;
  return `${Math.round(hours / 24)} дн назад`;
}

export default function SystemStatus() {
  const [row, setRow] = useState<HealthRow | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [feeds, setFeeds] = useState<FeedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const [latest, points, feedRows] = await Promise.all([
      fetchLatestHealth(),
      fetchHealthHistory(24),
      fetchFeedHealth(),
    ]);
    setRow(latest);
    setHistory(points);
    setFeeds(feedRows);
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

  const checks = row?.checks ?? {};
  const failing = Object.entries(checks).filter(([, value]) => !value.ok);
  const allOk = Boolean(row?.ok);

  return (
    <section id="status" className="mx-auto max-w-5xl scroll-mt-24 px-1 pt-2">
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1 text-[11px] font-extrabold uppercase tracking-widest text-emerald-200">
          <Activity className="h-3.5 w-3.5" />
          Состояние системы
        </div>
        <h1 className="mt-3 text-2xl font-extrabold tracking-tight sm:text-3xl">
          Сайт проверяет сам себя — вот отчёт
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-secondary sm:text-base">
          Раз в час система заново пересчитывает индекс напряжённости, проверяет
          свежесть новостей, котировок и прогнозов, опрашивает каждую ленту и
          смотрит, отвечает ли сайт. Результат каждой проверки остаётся в базе —
          это не «всё хорошо на словах», а запись, которую можно прочитать.
        </p>
      </div>

      {loading ? (
        <div className="min-h-[320px] animate-pulse rounded-xl2 border border-border-subtle bg-bg-card p-6" />
      ) : failed || !row ? (
        <div className="flex items-start gap-3 rounded-xl2 border border-amber-300/25 bg-amber-400/10 p-5 text-amber-100">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
          <div>
            <div className="font-bold">Отчёт пока недоступен</div>
            <p className="mt-1 text-sm text-amber-100/80">
              Не удалось прочитать таблицу самопроверки. Первая запись
              появляется через несколько минут после очередного часового запуска.
            </p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-full bg-amber-300/15 px-3 py-1.5 text-xs font-extrabold text-amber-50 transition-colors hover:bg-amber-300/25"
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
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className={`mb-5 rounded-xl2 border p-5 sm:p-6 ${
              allOk
                ? 'border-emerald-300/25 bg-emerald-400/[0.06]'
                : 'border-rose-300/30 bg-rose-400/[0.07]'
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2.5">
                  {allOk ? (
                    <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-300" />
                  ) : (
                    <XCircle className="h-6 w-6 shrink-0 text-rose-300" />
                  )}
                  <span
                    className={`text-lg font-extrabold sm:text-xl ${
                      allOk ? 'text-emerald-200' : 'text-rose-200'
                    }`}
                  >
                    {allOk ? 'Все проверки пройдены' : `Проблемных проверок: ${failing.length}`}
                  </span>
                </div>
                <div className="mt-2 text-sm text-text-secondary">
                  Последняя проверка: {formatCheckedAt(row.checked_at)}
                  <span className="ml-2 rounded-full bg-white/5 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide">
                    {row.trigger === 'manual' ? 'вручную' : 'по расписанию'}
                  </span>
                </div>
                {!allOk && (
                  <div className="mt-3 space-y-1">
                    {failing.map(([name, value]) => (
                      <div key={name} className="text-sm text-rose-100">
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
                className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-emerald-300/15 px-5 py-2.5 text-sm font-extrabold text-emerald-50 transition-colors hover:bg-emerald-300/25 disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${running ? 'animate-spin' : ''}`} />
                {running ? 'Проверяем…' : 'Проверить сейчас'}
              </button>
            </div>

            {note && (
              <div className="mt-4 border-t border-white/10 pt-3 text-xs text-text-secondary">
                {note}
              </div>
            )}
          </motion.div>

          {/* История за сутки */}
          {history.length > 1 && (
            <div className="mb-5 rounded-xl2 border border-border-subtle bg-bg-card p-5">
              <div className="mb-3 text-xs font-bold uppercase tracking-widest text-text-secondary">
                Последние {history.length} проверок
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[...history].reverse().map((point) => (
                  <span
                    key={point.checked_at}
                    title={`${formatCheckedAt(point.checked_at)} · ${
                      point.ok ? 'ок' : 'есть проблемы'
                    } · ${point.trigger === 'manual' ? 'вручную' : 'по расписанию'}`}
                    className={`h-3 w-3 rounded-sm ${
                      point.ok
                        ? point.trigger === 'manual'
                          ? 'bg-emerald-200'
                          : 'bg-emerald-400/70'
                        : 'bg-rose-400'
                    }`}
                  />
                ))}
              </div>
              <div className="mt-2 text-[11px] text-text-secondary">
                Светлые квадраты — запуски кнопкой, насыщенные — по расписанию.
              </div>
            </div>
          )}

          {/* Все проверки */}
          <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {Object.entries(checks)
              .sort((a, b) => Number(a[1].ok) - Number(b[1].ok))
              .map(([name, value]) => (
                <div
                  key={name}
                  className={`rounded-xl2 border p-4 ${
                    value.ok
                      ? 'border-border-subtle bg-bg-card'
                      : 'border-rose-300/30 bg-rose-400/[0.06]'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    {value.ok ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                    ) : (
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
                    )}
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-text-primary">
                        {CHECK_LABELS[name]?.title ?? name}
                      </div>
                      <div className="mt-0.5 text-xs text-text-secondary">
                        {CHECK_LABELS[name]?.hint ?? ''}
                      </div>
                      <div
                        className={`mt-1.5 text-xs ${
                          value.ok ? 'text-slate-300' : 'text-rose-100'
                        }`}
                      >
                        {value.detail}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
          </div>

          {/* Ленты */}
          {feeds.length > 0 && (
            <div className="mb-5 rounded-xl2 border border-border-subtle bg-bg-card p-5">
              <div className="mb-3 flex items-center gap-2">
                <Radio className="h-4 w-4 text-emerald-300" />
                <span className="text-xs font-bold uppercase tracking-widest text-text-secondary">
                  Новостные ленты
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-text-secondary">
                    <tr>
                      <th className="pb-2 pr-4 font-bold">Лента</th>
                      <th className="pb-2 pr-4 font-bold">Последний материал</th>
                      <th className="pb-2 pr-4 font-bold">В ленте</th>
                      <th className="pb-2 font-bold">Новых в проходе</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feeds.map((feed) => {
                      const hours = hoursSince(feed.last_new_at);
                      const stale = hours === null || hours > 24;
                      return (
                        <tr key={feed.source} className="border-t border-white/5">
                          <td className="py-2 pr-4 font-semibold text-text-primary">
                            {feed.source}
                          </td>
                          <td
                            className={`py-2 pr-4 ${stale ? 'text-rose-200' : 'text-text-secondary'}`}
                          >
                            {feedAgeLabel(hours)}
                          </td>
                          <td className="py-2 pr-4 text-text-secondary">{feed.items}</td>
                          <td className="py-2 text-text-secondary">{feed.fresh}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-text-secondary">
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
        </>
      )}
    </section>
  );
}
