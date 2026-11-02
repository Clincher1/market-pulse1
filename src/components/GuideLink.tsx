import { ArrowRight, BookOpen } from 'lucide-react';

type GuideLinkProps = {
  href: string;
  label: string;
  mobileLabel?: string;
  className?: string;
};

/**
 * A deliberately button-like link to the methodology guide.
 * The previous text-only links were easy to miss on the dark dashboard,
 * especially on touch devices where hover states do not exist.
 */
export default function GuideLink({
  href,
  label,
  mobileLabel,
  className = '',
}: GuideLinkProps) {
  return (
    <a
      href={href}
      aria-label={`Открыть справку: ${label}`}
      className={`group ml-auto inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border border-accent/55 bg-accent/15 py-1.5 pl-1.5 pr-3 text-sm font-extrabold text-blue-50 shadow-[0_10px_28px_rgba(37,99,235,0.20)] transition-all duration-200 hover:-translate-y-0.5 hover:border-accent-strong hover:bg-accent-strong hover:text-white focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary active:translate-y-0 ${className}`}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-strong text-white shadow-md shadow-accent/30 transition-colors group-hover:bg-white group-hover:text-accent-strong">
        <BookOpen className="h-4 w-4" />
      </span>
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">{mobileLabel ?? label}</span>
      <ArrowRight className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5" />
    </a>
  );
}
