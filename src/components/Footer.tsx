import { ArrowRight, BookOpen, HeartPulse, Info, Send } from 'lucide-react';
import BrandMark from './BrandMark';
import { telegramSupportUrl } from '@/lib/telegramSupport';

export default function Footer() {
  return (
    <footer id="footer" className="site-footer site-container mt-[var(--space-6)] lg:mt-[var(--space-6)]">
      <div className="site-footer__panel mx-auto px-[var(--space-3)] py-[var(--space-4)] sm:px-[var(--space-3)] lg:px-[var(--space-4)] lg:py-[var(--space-4)]">
        <div className="site-footer__main flex flex-col items-center justify-between gap-[var(--space-3)] md:flex-row">
          <a href="/" className="site-footer__brand flex min-h-11 items-center gap-[var(--space-2)]">
            <BrandMark className="h-9 w-9" />
            <span className="flex flex-col">
              <span className="brand-wordmark brand-wordmark--footer">Market Pulse</span>
              <span className="brand-tagline mt-[var(--space-1)]">
                НАБЛЮДЕНИЯ С ИСТОЧНИКАМИ
              </span>
            </span>
          </a>

          <div className="site-footer__copyright text-sm text-text-secondary">
            © {new Date().getFullYear()} Market Pulse. Все права защищены.
          </div>

          <nav aria-label="Полезные страницы" className="site-footer__links flex flex-wrap items-center justify-center gap-[var(--space-1)]">
            {telegramSupportUrl && (
              <a
                href={telegramSupportUrl}
                aria-label="Поддержка Market Pulse в Telegram"
                className="inline-flex min-h-11 items-center gap-[var(--space-1)] rounded-full border border-sky-300/30 bg-sky-400/10 px-[var(--space-2)] py-[var(--space-1)] text-sm font-extrabold text-text-primary transition-colors hover:border-sky-300/60 hover:bg-sky-400/15 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-sky-300"
              >
                <Send className="h-4 w-4 text-sky-800" aria-hidden="true" />
                Поддержка в Telegram
              </a>
            )}
            <a
              href="/status"
              className="inline-flex min-h-11 items-center gap-[var(--space-1)] rounded-full border border-emerald-300/25 bg-emerald-400/10 px-[var(--space-2)] py-[var(--space-1)] text-sm font-extrabold text-text-primary transition-colors hover:border-emerald-300/60 hover:bg-emerald-400/15 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-300"
            >
              <HeartPulse className="h-4 w-4 text-emerald-800" aria-hidden="true" />
              Состояние данных
            </a>
            <a
              href="/about"
              className="inline-flex min-h-11 items-center gap-[var(--space-1)] rounded-full border border-slate-300/25 bg-slate-400/10 px-[var(--space-2)] py-[var(--space-1)] text-sm font-extrabold text-text-primary transition-colors hover:border-slate-300/60 hover:bg-slate-400/15 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-slate-300"
            >
              <Info className="h-4 w-4 text-text-secondary" />
              О проекте
            </a>
            <a
              href="/guide"
              aria-label="Методология: как читать этот сайт"
              className="inline-flex min-h-11 items-center gap-[var(--space-1)] rounded-full border border-rose-300/25 bg-rose-400/10 px-[var(--space-2)] py-[var(--space-1)] text-sm font-extrabold text-text-primary shadow-[0_10px_26px_rgba(0,0,0,0.18)] transition-all duration-200 hover:-translate-y-0.5 hover:border-rose-300/60 hover:bg-rose-400/15 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-rose-300 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary active:translate-y-0"
            >
              <BookOpen className="h-4 w-4 text-rose-800" />
              Методология
              <ArrowRight className="h-4 w-4 text-rose-800" />
            </a>
          </nav>
        </div>

        <div className="site-footer__legal mt-[var(--space-3)]">
        <p className="text-center text-xs leading-relaxed text-text-secondary">
          Сайт не использует cookies и браузерные трекеры. Выбранные инструменты
          в «Моих ориентирах» и палитра тепловой карты сохраняются только в вашем
          браузере. Если вы обратитесь через Telegram, Telegram и бот получат
          текст сообщения и ваш Telegram ID; чат с ботом не является секретным.
        </p>
        <p className="mt-[var(--space-1)] text-center text-xs leading-relaxed text-text-secondary">
          Материалы сайта носят информационный характер и не являются
          персональной инвестиционной рекомендацией.
        </p>
        </div>
      </div>
    </footer>
  );
}
