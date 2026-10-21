import { TrendingUp, Github } from 'lucide-react';

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
              aria-label="GitHub"
              className="w-9 h-9 rounded-lg bg-bg-card border border-border-subtle flex items-center justify-center text-text-secondary hover:text-accent hover:border-accent/30 transition-all duration-200"
            >
              <Github className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
