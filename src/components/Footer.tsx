import { ArrowRight, BookOpen, Info } from 'lucide-react';
import BrandMark from './BrandMark';

export default function Footer() {
  return (
    <footer id="footer" className="border-t border-border-subtle mt-12">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <a href="#dashboard" className="flex items-center gap-2.5">
            <BrandMark className="h-8 w-8" />
            <span className="text-base font-bold text-text-primary">
              Market Pulse
            </span>
          </a>

          <div className="text-sm text-text-secondary">
            © {new Date().getFullYear()} Market Pulse. Все права защищены.
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <a
              href="#about"
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/15 bg-white/6 px-4 py-2 text-sm font-extrabold text-white transition-colors hover:border-cyan-300/60 hover:bg-cyan-400/15 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent"
            >
              <Info className="h-4 w-4 text-cyan-300" />
              О проекте
            </a>
            <a
              href="#guide"
              aria-label="Открыть методологию Market Pulse"
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/15 bg-white/6 px-4 py-2 text-sm font-extrabold text-white shadow-[0_10px_26px_rgba(0,0,0,0.18)] transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/70 hover:bg-accent/20 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary active:translate-y-0"
            >
              <BookOpen className="h-4 w-4" />
              Методология
              <ArrowRight className="h-4 w-4 text-blue-300" />
            </a>
          </div>
        </div>

        <p className="mt-6 text-center text-xs leading-relaxed text-text-secondary/80">
          Сайт не использует cookies, не ставит трекеры и не собирает
          персональные данные. Локально в вашем браузере сохраняются только
          выбранные вами профили в разделе «Россия и бизнес» — эти данные
          никуда не отправляются.
        </p>
      </div>
    </footer>
  );
}
