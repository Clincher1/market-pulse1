import { useEffect, useState } from 'react';
import { AlertTriangle, Database, Radio } from 'lucide-react';
import { SOURCE_BUDGETS, fetchSlotSources, fetchSourceStates } from '@/data/sourceMonitor';
import {
  groupSlotRows,
  pauseLabel,
  slotsWithoutSource,
  usageLabel,
  verdictLabel,
  type SlotView,
} from '@/lib/slotsView';

/**
 * «Слоты и источники»: таблица того, откуда взято каждое число на сайте.
 *
 * Смысл раздела — не украшение. Владелец хотел видеть, какой источник кормит
 * каждую величину и не собираемся ли мы получить блокировку; значит, на экране
 * должны стоять номер слота, источник, расход за сутки и пауза. Всё это уже
 * пишется в базу, здесь только читается.
 *
 * Если данных нет, раздел говорит об этом словами и не рисует пустую таблицу с
 * придуманными нулями.
 */
function stateClass(verdict: string | null): string {
  if (verdict === 'ok') return 'text-emerald-800';
  if (verdict === 'paused') return 'text-amber-900';
  if (verdict === 'failing') return 'text-rose-800';
  return 'text-text-secondary';
}

export default function SourcesMonitor() {
  const [slots, setSlots] = useState<SlotView[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([fetchSlotSources(), fetchSourceStates()]).then(([rows, states]) => {
      if (cancelled) return;
      setSlots(groupSlotRows(rows, states));
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded) {
    return <div className="mb-5 min-h-[120px] animate-pulse rounded-xl2 border border-border-subtle bg-bg-card p-5" />;
  }

  if (!slots.length) {
    return (
      <div className="mb-5 flex items-start gap-3 rounded-xl2 border border-amber-200 bg-amber-50 p-5 text-amber-900">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-800" />
        <div>
          <div className="font-bold">Реестр слотов пока пуст</div>
          <p className="mt-1 text-sm text-amber-900">
            Реестр заполняется писателем цен при каждом запуске. Пустая таблица означает, что
            синхронизация ещё не проходила — это же проверяет самопроверка, проверка
            «Слоты и источники совпадают с реестром».
          </p>
        </div>
      </div>
    );
  }

  const now = new Date();
  const withoutSource = slotsWithoutSource(slots);
  const paused = slots.filter((slot) =>
    slot.sources.some((source) => source.chosen && source.state?.verdict === 'paused'),
  );

  return (
    <div className="mb-5 rounded-xl2 border border-border-subtle bg-bg-card p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Database className="h-4 w-4 text-cyan-800" />
        <span className="text-xs font-bold uppercase tracking-widest text-text-secondary">
          Слоты и источники
        </span>
        <span className="rounded-full border border-border-subtle px-2 py-0.5 text-[11px] font-bold text-text-secondary">
          {slots.length} слотов
        </span>
      </div>
      <p className="mb-4 max-w-3xl text-sm leading-relaxed text-text-secondary">
        Каждая величина на сайте пронумерована. У слота один основной источник и, где замена
        настоящая, запасные. Расход — сколько раз мы пришли к источнику за сутки UTC: он
        показывается с бюджетом, потому что «12 запросов» само по себе ничего не говорит о том,
        далеко ли мы от блокировки.
      </p>

      {withoutSource.length > 0 && (
        <p className="mb-3 text-sm text-amber-900">
          Без источника сейчас: слоты {withoutSource.join(', ')} — они не будут обновляться, пока
          владелец не включит источник.
        </p>
      )}

      <div
        className="overflow-x-auto focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-200"
        tabIndex={0}
        role="group"
        aria-label="Слоты и источники: таблица прокручивается по горизонтали стрелками."
      >
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-text-secondary">
            <tr>
              <th className="pb-2 pr-3 font-bold">№</th>
              <th className="pb-2 pr-3 font-bold">Слот</th>
              <th className="pb-2 pr-3 font-bold">Источник</th>
              <th className="pb-2 pr-3 font-bold">Расход за сутки</th>
              <th className="pb-2 pr-3 font-bold">Состояние</th>
              <th className="pb-2 font-bold">Последний ответ</th>
            </tr>
          </thead>
          <tbody>
            {slots.map((slot) => {
              const primary = slot.sources.find((source) => source.chosen) ?? slot.sources[0];
              const backup = slot.sources.filter((source) => source !== primary);
              const pause = pauseLabel(now, primary?.state ?? null);
              return (
                <tr key={slot.number} className="border-t border-border-subtle/60 align-top">
                  <td className="py-2 pr-3 font-mono text-xs text-text-secondary">{slot.number}</td>
                  <td className="py-2 pr-3">
                    <div className="font-semibold text-text-primary">{slot.title}</div>
                    <div className="text-[11px] text-text-secondary">{slot.section}</div>
                  </td>
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-1.5">
                      <Radio className="h-3.5 w-3.5 shrink-0 text-cyan-800" />
                      <span className="font-semibold">{primary?.id ?? '—'}</span>
                    </div>
                    <div className="text-[11px] text-text-secondary">{primary?.why ?? 'источник не задан'}</div>
                    {backup.length > 0 && (
                      <div className="mt-0.5 text-[11px] text-text-secondary">
                        запасные: {backup.map((source) => source.id).join(', ')}
                      </div>
                    )}
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs">
                    {usageLabel(primary?.state ?? null, primary ? SOURCE_BUDGETS[primary.id] ?? null : null)}
                  </td>
                  <td className={`py-2 pr-3 text-xs font-semibold ${stateClass(primary?.state?.verdict ?? null)}`}>
                    {verdictLabel(primary?.state?.verdict ?? null)}
                    {pause ? ` · ещё ${pause}` : ''}
                    {primary?.state && primary.state.consecutive_failures
                      ? ` · отказов подряд: ${primary.state.consecutive_failures}`
                      : ''}
                  </td>
                  <td className="py-2 text-[11px] text-text-secondary">
                    {primary?.state?.last_ok_at
                      ? new Date(primary.state.last_ok_at).toLocaleString('ru-RU', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                          timeZone: 'Europe/Moscow',
                        })
                      : 'нет записи'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 space-y-2 text-[12px] leading-relaxed text-text-secondary">
        <p>
          Сменить источник можно без выката: выбор лежит в таблице <code className="font-mono">source_preferences</code>.
          Одна строка SQL — и писатель цен возьмёт новый источник на следующем запуске (не позже пяти
          минут):
        </p>
        <pre className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-[11px] text-slate-700">
{`insert into public.source_preferences (slot_id, source_id, priority, enabled)
values ('price.btc', 'coinbase', 1, true)
on conflict (slot_id, source_id)
do update set enabled = excluded.enabled, priority = excluded.priority, chosen_at = now();`}
        </pre>
        <p>
          Выключить источник совсем: <code className="font-mono">update public.source_preferences set enabled = false …</code>.
          Он не уедет в конец списка, а именно выключится — иначе пауза и отказ вернули бы его наверх.
        </p>
        {paused.length > 0 && (
          <p>
            Сейчас на паузе: слоты {paused.map((slot) => slot.number).join(', ')}. Пауза — это работающий
            механизм после трёх отказов, а не поломка: она снимается сама, как только источник ответит.
          </p>
        )}
      </div>
    </div>
  );
}
