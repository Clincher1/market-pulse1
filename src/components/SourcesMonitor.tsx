import { Fragment, useEffect, useState } from 'react';
import { AlertTriangle, Database, Radio } from 'lucide-react';
import { SOURCE_BUDGETS, fetchSlotSources, fetchSourceStates } from '@/data/sourceMonitor';
import { fetchLiveAssets } from '@/data/liveAssets';
import type { AssetData } from '@/data/marketTypes';
import { formatObservationTimestamp } from '@/lib/dateDisplay.mjs';
import {
  isInternalSlot,
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
  const [assets, setAssets] = useState<AssetData[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([fetchSlotSources(), fetchSourceStates(), fetchLiveAssets()]).then(([rows, states, values]) => {
      if (cancelled) return;
      setSlots(groupSlotRows(rows, states).sort((a, b) => Number(isInternalSlot(a.slotId)) - Number(isInternalSlot(b.slotId)) || a.number - b.number));
      setAssets(values);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded) {
    return <div className="mb-[var(--space-3)] min-h-[120px] animate-pulse rounded-[var(--radius)] border border-border-subtle bg-bg-card p-[var(--space-3)]" />;
  }

  if (!slots.length) {
    return (
      <div className="mb-[var(--space-3)] flex items-start gap-[var(--space-2)] rounded-[var(--radius)] border border-amber-200 bg-amber-50 p-[var(--space-3)] text-amber-900">
        <AlertTriangle className="mt-[var(--space-1)] h-5 w-5 shrink-0 text-amber-800" />
        <div>
          <div className="font-bold">Реестр слотов пока пуст</div>
          <p className="mt-[var(--space-1)] text-sm text-amber-900">
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
    <div className="mb-[var(--space-3)] rounded-[var(--radius)] border border-border-subtle bg-bg-card p-[var(--space-3)]">
      <div className="mb-[var(--space-2)] flex flex-wrap items-center gap-[var(--space-1)]">
        <Database className="h-4 w-4 text-cyan-800" />
        <span className="text-xs font-bold uppercase tracking-widest text-text-secondary">
          Слоты и источники
        </span>
        <span className="rounded-full border border-border-subtle px-[var(--space-1)] py-[var(--space-1)] text-[11px] font-bold text-text-secondary">
          {slots.length} слотов
        </span>
      </div>
      <p className="mb-[var(--space-2)] max-w-3xl text-sm leading-relaxed text-text-secondary">
        Реестр описывает настроенный порядок источников, а не гарантирует, кто ответил
        последним: при отказе основного может ответить запасной. Для мировых цен отдельно
        показан источник последнего значения из кэша. Внутренние и архивные процессы
        отделены ниже от публичных данных. Отсутствие записи мониторинга не означает
        недоступность источника: российские API не пишут в этот журнал. Расход — сколько раз мы пришли к источнику за сутки UTC: он
        показывается с бюджетом, потому что «12 запросов» само по себе ничего не говорит о том,
        далеко ли мы от блокировки.
      </p>

      {withoutSource.length > 0 && (
        <p className="mb-[var(--space-2)] text-sm text-amber-900">
          Без источника сейчас: слоты {withoutSource.join(', ')} — в реестре нет включённого источника; это состояние настройки, а не проверка доступности API.
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
              <th className="pb-[var(--space-1)] pr-[var(--space-2)] font-bold">№</th>
              <th className="pb-[var(--space-1)] pr-[var(--space-2)] font-bold">Слот</th>
              <th className="pb-[var(--space-1)] pr-[var(--space-2)] font-bold">Настроенный источник</th>
              <th className="pb-[var(--space-1)] pr-[var(--space-2)] font-bold">Расход за сутки</th>
              <th className="pb-[var(--space-1)] pr-[var(--space-2)] font-bold">Журнал источника</th>
              <th className="pb-[var(--space-1)] font-bold">Последний ответ</th>
            </tr>
          </thead>
          <tbody>
            {slots.map((slot, index) => {
              const primary = slot.sources.find((source) => source.chosen);
              const backup = slot.sources.filter((source) => source !== primary && source.why !== 'выключен вручную');
              const disabled = slot.sources.filter((source) => source.why === 'выключен вручную');
              const actual = slot.slotId.startsWith('price.') ? assets.find((asset) => asset.id === slot.slotId.slice(6)) : null;
              const pause = pauseLabel(now, primary?.state ?? null);
              return (
                <Fragment key={slot.number}>
                {(index === 0 || isInternalSlot(slot.slotId) !== isInternalSlot(slots[index - 1].slotId)) && (
                  <tr><th colSpan={6} className="py-[var(--space-2)] text-xs font-bold text-text-secondary">
                    {isInternalSlot(slot.slotId) ? 'Внутренние и архивные процессы · не публичные блоки сайта' : 'Публичные данные и их обслуживание'}
                  </th></tr>
                )}
                <tr className="border-t border-border-subtle/60 align-top">
                  <td className="py-[var(--space-1)] pr-[var(--space-2)] font-mono text-xs text-text-secondary">{slot.number}</td>
                  <td className="py-[var(--space-1)] pr-[var(--space-2)]">
                    <div className="font-semibold text-text-primary">{slot.title}</div>
                    <div className="text-[11px] text-text-secondary">{slot.section}</div>
                  </td>
                  <td className="py-[var(--space-1)] pr-[var(--space-2)]">
                    <div className="flex items-center gap-[var(--space-1)]">
                      <Radio className="h-3.5 w-3.5 shrink-0 text-cyan-800" />
                      <span className="font-semibold">{primary?.id ?? '—'}</span>
                    </div>
                    <div className="text-[11px] text-text-secondary">{primary?.why ?? 'нет включённого источника'}</div>
                    {actual && <div className="mt-[var(--space-1)] text-[11px] text-text-secondary">
                      Источник показанного значения: {actual.sourceLabel || 'не указан'}
                      {actual.asOf ? ` · наблюдение ${formatObservationTimestamp(actual.asOf)}` : ' · дата не указана'}
                    </div>}
                    {backup.length > 0 && (
                      <div className="mt-[var(--space-1)] text-[11px] text-text-secondary">
                        следующие в очереди: {backup.map((source) => source.id).join(', ')}
                      </div>
                    )}
                    {disabled.length > 0 && <div className="text-[11px] text-text-secondary">Отключены: {disabled.map((source) => source.id).join(', ')}</div>}
                  </td>
                  <td className="py-[var(--space-1)] pr-[var(--space-2)] font-mono text-xs">
                    {usageLabel(primary?.state ?? null, primary ? SOURCE_BUDGETS[primary.id] ?? null : null)}
                  </td>
                  <td className={`py-[var(--space-1)] pr-[var(--space-2)] text-xs font-semibold ${stateClass(primary?.state?.verdict ?? null)}`}>
                    {verdictLabel(primary?.state?.verdict ?? null)}
                    {pause ? ` · ещё ${pause}` : ''}
                    {primary?.state && primary.state.consecutive_failures
                      ? ` · отказов подряд: ${primary.state.consecutive_failures}`
                      : ''}
                  </td>
                  <td className="py-[var(--space-1)] text-[11px] text-text-secondary">
                    {primary?.state?.last_ok_at
                      ? formatObservationTimestamp(primary.state.last_ok_at)
                      : 'нет записи'}
                  </td>
                </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-[var(--space-2)] space-y-[var(--space-1)] text-[12px] leading-relaxed text-text-secondary">
        <p>
          Настройки источников меняются владельцем через проверяемую миграцию,
          без изменения исторических котировок. Очередь определяет порядок попыток;
          ответивший поставщик подписывается у самого значения. Расход и последний
          ответ в этой таблице относятся к настроенному первому источнику, не ко всему слоту.
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
