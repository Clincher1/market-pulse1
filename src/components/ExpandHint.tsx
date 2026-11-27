import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

type ExpandHintProps = {
  /** Состояние для React-контролируемых раскрывающихся панелей. */
  expanded?: boolean;
  /** Для нативных <details className="group">: состояние берётся из group-open. */
  detailsMode?: boolean;
  closedLabel?: ReactNode;
  openLabel?: ReactNode;
  className?: string;
  testId?: string;
};

/**
 * Единый видимый признак кликабельной раскрывающейся панели.
 * Пульсирует только маленькая точка и шеврон, а не весь текст: подсказка
 * заметна, но не превращается в раздражающее мигание. Глобальный
 * prefers-reduced-motion в index.css отключает бесконечную анимацию.
 */
export default function ExpandHint({
  expanded = false,
  detailsMode = false,
  closedLabel = 'Развернуть',
  openLabel = 'Свернуть',
  className = '',
  testId,
}: ExpandHintProps) {
  const showPing = detailsMode || !expanded;

  return (
    <span
      data-testid={testId}
      className={`inline-flex shrink-0 items-center gap-[var(--space-1)] rounded-full border px-[var(--space-1)] py-[var(--space-1)] text-[11px] font-extrabold leading-none ${className}`}
    >
      <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
        {showPing && (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-50 [animation-duration:1.8s] ${
              detailsMode ? 'group-open:hidden' : ''
            }`}
          />
        )}
        <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
      </span>

      {detailsMode ? (
        <>
          <span className="group-open:hidden">{closedLabel}</span>
          <span className="hidden group-open:inline">{openLabel}</span>
        </>
      ) : (
        <span>{expanded ? openLabel : closedLabel}</span>
      )}

      <ChevronDown
        aria-hidden="true"
        className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${
          detailsMode
            ? 'animate-pulse group-open:rotate-180 group-open:animate-none [animation-duration:1.8s]'
            : expanded
              ? 'rotate-180'
              : 'animate-pulse [animation-duration:1.8s]'
        }`}
      />
    </span>
  );
}
