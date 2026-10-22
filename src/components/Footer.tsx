import { ExternalLink, TrendingUp, Github } from 'lucide-react';

export default function Footer() {
  return (
    <footer id="footer" className="border-t border-border-subtle mt-12">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-accent-hover flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-base font-bold text-text-primary">
              Market Pulse
            </span>
          </div>

          <div className="text-sm text-text-secondary">
            © {new Date().getFullYear()} Market Pulse. Все права защищены.
          </div>

          <div className="flex items-center gap-3">
            <a
              href="https://github.com/Clincher1/market-pulse1"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Открыть исходный код Market Pulse на GitHub"
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-4 py-2 text-sm font-extrabold text-white shadow-[0_10px_26px_rgba(0,0,0,0.18)] transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/70 hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary active:translate-y-0"
            >
              <Github className="h-4 w-4" />
              Исходный код
              <ExternalLink className="h-4 w-4 text-blue-300" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
