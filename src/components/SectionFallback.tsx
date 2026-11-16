import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, LoaderCircle, RotateCcw } from 'lucide-react';

type SectionFallbackProps = {
  id?: string;
  title: string;
  message?: string;
  minHeightClass?: string;
  className?: string;
};

export function SectionFallback({
  id,
  title,
  message = 'Загружаем раздел и актуальные данные…',
  minHeightClass = 'min-h-56',
  className = '',
}: SectionFallbackProps) {
  return (
    <section
      id={id}
      className={`scroll-mt-24 overflow-hidden rounded-2xl border border-border-subtle bg-bg-card ${className}`}
      aria-busy="true"
      aria-label={`Загрузка: ${title}`}
    >
      <div className={`flex ${minHeightClass} flex-col justify-center p-5 sm:p-6`}>
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-800">
            <LoaderCircle className="h-5 w-5 animate-spin" />
          </span>
          <div>
            <p className="text-base font-extrabold text-text-primary">{title}</p>
            <p className="mt-0.5 text-sm text-text-secondary">{message}</p>
          </div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-3" aria-hidden="true">
          <div className="h-20 animate-pulse rounded-2xl bg-slate-100" />
          <div className="h-20 animate-pulse rounded-2xl bg-slate-100 [animation-delay:120ms]" />
          <div className="h-20 animate-pulse rounded-2xl bg-slate-100 [animation-delay:240ms]" />
        </div>
        <div className="mt-3 h-24 animate-pulse rounded-2xl bg-slate-100 [animation-delay:180ms]" aria-hidden="true" />
      </div>
    </section>
  );
}

export function DeferredSection({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback: ReactNode;
}) {
  return <Suspense fallback={fallback}><>{children}</></Suspense>;
}

type DeferredMountProps = {
  children: ReactNode;
  fallback: ReactNode;
  targetId?: string;
  rootMargin?: string;
};

/**
 * Монтирует тяжёлую секцию только при приближении к ней. До этого на месте
 * остаётся fallback с тем же id, поэтому якорная навигация не ломается.
 * Если пользователь пришёл сразу по ссылке на секцию, она открывается сразу.
 */
export function DeferredMount({
  children,
  fallback,
  targetId,
  rootMargin = '900px 0px',
}: DeferredMountProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [shouldRender, setShouldRender] = useState(() => {
    if (typeof window === 'undefined' || !targetId) return false;
    return window.location.hash === `#${targetId}`;
  });

  useEffect(() => {
    if (shouldRender) return;
    const element = ref.current;
    if (!element) return;

    if (typeof IntersectionObserver === 'undefined') {
      setShouldRender(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldRender(true);
          observer.disconnect();
        }
      },
      { rootMargin, threshold: 0 },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [rootMargin, shouldRender]);

  // Явный переход по навигации важнее экономии трафика: целевая секция
  // должна подключиться сразу, а не ждать, пока placeholder приблизится.
  useEffect(() => {
    if (!targetId) return;
    const activateIfHashMatches = () => {
      if (window.location.hash === `#${targetId}`) setShouldRender(true);
    };
    activateIfHashMatches();
    window.addEventListener('hashchange', activateIfHashMatches);
    return () => window.removeEventListener('hashchange', activateIfHashMatches);
  }, [targetId]);

  // Подгрузка промежуточных чанков может сдвинуть цель вниз после первого
  // браузерного скролла — особенно на мобильных, где карточки идут одной
  // колонкой и реальная секция намного выше placeholder-а. Несколько
  // коррекций в течение пяти секунд доводят страницу точно к якорю.
  // Первое ручное колесо/касание/клавиша отменяет дальнейшие коррекции,
  // чтобы страница не спорила с пользователем.
  useEffect(() => {
    if (!shouldRender || !targetId || window.location.hash !== `#${targetId}`) return;

    let cancelled = false;
    const timers = [100, 400, 1000, 2000, 3500, 5000].map((delay) =>
      window.setTimeout(() => {
        if (!cancelled && window.location.hash === `#${targetId}`) {
          ref.current?.scrollIntoView({
            behavior: 'instant' as ScrollBehavior,
            block: 'start',
          });
        }
      }, delay),
    );

    const cancel = () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
    };

    window.addEventListener('wheel', cancel, { passive: true, once: true });
    window.addEventListener('touchmove', cancel, { passive: true, once: true });
    window.addEventListener('keydown', cancel, { once: true });

    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener('wheel', cancel);
      window.removeEventListener('touchmove', cancel);
      window.removeEventListener('keydown', cancel);
    };
  }, [shouldRender, targetId]);

  return <div ref={ref}>{shouldRender ? <>{children}</> : fallback}</div>;
}

type ErrorNoticeProps = {
  title: string;
  message: string;
  actionLabel?: string;
  onRetry?: () => void;
  className?: string;
};

export function ErrorNotice({
  title,
  message,
  actionLabel = 'Повторить',
  onRetry,
  className = '',
}: ErrorNoticeProps) {
  return (
    <div
      role="alert"
      className={`rounded-2xl border border-red-200 bg-red-50 p-5 text-left ${className}`}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />
        <div className="min-w-0 flex-1">
          <p className="font-extrabold text-red-900">{title}</p>
          <p className="mt-1 text-sm leading-relaxed text-red-800">{message}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-full border border-red-300 bg-white px-4 py-2 text-sm font-extrabold text-red-800 transition-colors hover:bg-red-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-red-500"
            >
              <RotateCcw className="h-4 w-4" />
              {actionLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
