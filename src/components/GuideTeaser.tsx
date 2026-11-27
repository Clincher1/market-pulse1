import { ArrowRight, BookOpen, Clock3, ListChecks, Scale } from 'lucide-react';
import { SectionThemeBadge } from './sectionThemes';

const entries = [
  {
    href: '/guide#guide-start',
    icon: Clock3,
    title: 'Две минуты на всё',
    text: 'Как читать сайт по порядку: факт, измерение, гипотеза.',
  },
  {
    href: '/guide#guide-overview',
    icon: Scale,
    title: 'Факт, измерение, гипотеза',
    text: 'Где заканчивается наблюдение и начинается вывод модели.',
  },
  {
    href: '/guide#guide-faq',
    icon: ListChecks,
    title: 'Восемь частых вопросов',
    text: 'Почему у плитки прочерк, почему график актива кончается вчера и зачем показывать плохой счёт.',
  },
];

/**
 * The guide is a separate screen, so the dashboard scroll jumped from 06 to 08.
 * This card keeps section 07 in the flow and gives the guide a plain entry point
 * without loading its content into the dashboard.
 */
export default function GuideTeaser() {
  return (
    <section id="guide-teaser" className="mb-[var(--space-5)] scroll-mt-[var(--space-6)] lg:mb-[var(--space-6)]">
      <div className="overflow-hidden rounded-2xl border border-border-subtle bg-bg-card p-[var(--space-3)] sm:p-[var(--space-3)]">
        <div className="flex flex-wrap items-center justify-between gap-[var(--space-2)]">
          <SectionThemeBadge themeId="guide" />
          <a
            href="/guide"
            className="group inline-flex min-h-10 items-center gap-[var(--space-1)] rounded-full border border-rose-300/50 bg-rose-400/15 px-[var(--space-2)] py-[var(--space-1)] text-sm font-extrabold text-rose-800 transition-all duration-200 hover:-translate-y-0.5 hover:border-rose-300 hover:bg-rose-700 hover:text-white focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
          >
            <BookOpen className="h-4 w-4" />
            Открыть гид
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </a>
        </div>
        <h2 className="mt-[var(--space-2)] text-2xl font-extrabold text-text-primary">Как читать Market Pulse</h2>
        <p className="mt-[var(--space-1)] max-w-3xl text-sm text-text-secondary">
          Руководство живёт отдельным экраном, поэтому первая страница открывается быстрее. Внутри —
          источники, границы применимости и то, как проверить любое число на сайте.
        </p>
        <div className="mt-[var(--space-3)] grid gap-[var(--space-2)] sm:grid-cols-3">
          {entries.map(({ href, icon: Icon, title, text }) => (
            <a
              key={href}
              href={href}
              className="group rounded-2xl border border-rose-300/25 bg-rose-400/[0.07] p-[var(--space-2)] transition-colors hover:border-rose-300/60 hover:bg-rose-400/[0.12] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-rose-400"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-700 text-white">
                <Icon className="h-4 w-4" />
              </span>
              <p className="mt-[var(--space-2)] text-sm font-extrabold text-text-primary">{title}</p>
              <p className="mt-[var(--space-1)] text-xs text-text-secondary">{text}</p>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
