import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

/**
 * Граница ошибок одного раздела.
 *
 * Зачем. В приложении нет ни одной границы ошибок: исключение при рендере
 * любого блока размонтирует всё дерево React, и страница становится белой.
 * Самопроверка этого не видит — она проверяет HTTP 200 HTML-оболочки, а не то,
 * что React смонтировался. То есть сайт мог быть пустым при зелёном статусе.
 *
 * Что делает. Ловит ошибку рендера внутри одного раздела, оставляет остальную
 * страницу живой и говорит прямо, что блок не отрисовался. Текст не делает вид,
 * что данные в порядке.
 *
 * Чего не делает. Ничего не отправляет наружу: по правилам проекта на сайте нет
 * телеметрии. Ошибка уходит только в консоль браузера.
 */
export class SectionBoundary extends Component<
  { title: string; id?: string; className?: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Единственный канал — консоль посетителя. Никаких сетевых вызовов.
    console.error(`[раздел «${this.props.title}»] ошибка отрисовки`, error, info.componentStack);
  }

  private retry = () => {
    this.setState({ failed: false });
  };

  render() {
    const { title, id, className = '', children } = this.props;

    if (!this.state.failed) return children;

    return (
      <section
        id={id}
        className={`mb-10 scroll-mt-24 rounded-2xl border border-amber-200 bg-amber-50 p-5 lg:mb-12 lg:p-6 ${className}`}
        role="alert"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-800" />
          <div className="min-w-0">
            <p className="text-base font-extrabold text-amber-900">
              Раздел «{title}» не отрисовался
            </p>
            <p className="mt-1 text-sm leading-relaxed text-amber-900">
              В этом блоке произошла ошибка, поэтому он скрыт целиком — показывать
              его данные было бы нечестно. Остальная страница работает. Если ошибка
              повторяется, раздел стоит починить, а не обходить.
            </p>
            <button
              type="button"
              onClick={this.retry}
              className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-extrabold text-amber-900 transition-colors hover:bg-amber-100"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Попробовать снова
            </button>
          </div>
        </div>
      </section>
    );
  }
}
