import { ArrowRight, BookOpen, Clock3, ListChecks, Scale } from 'lucide-react';
import { SectionThemeBadge } from './sectionThemes';

const entries = [
  {
    href: '#guide-start',
    icon: Clock3,
    title: 'Две минуты на всё',
    text: 'Как читать сайт по порядку: факт, измерение, гипотеза.',
  },
  {
    href: '#guide-overview',
    icon: Scale,
    title: 'Факт, измерение, гипотеза',
    text: 'Где заканчивается наблюдение и начинается вывод модели.',
  },
  {
    href: '#guide-faq',
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
    <section id="guide-teaser" className="mb-10 scroll-mt-24 lg:mb-12">
      <div className="overflow-hidden rounded-2xl border border-border-subtle bg-bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionThemeBadge themeId="guide" />
          <a
            href="#guide"
            className="group inline-flex min-h-10 items-center gap-2 rounded-full border border-rose-300/50 bg-rose-400/15 px-4 py-2 text-sm font-extrabold text-rose-50 transition-all duration-200 hover:-translate-y-0.5 hover:border-rose-300 hover:bg-rose-500 hover:text-white focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
          >
            <BookOpen className="h-4 w-4" />
            Открыть гид
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </a>
        </div>
        <h2 className="mt-4 text-2xl font-extrabold text-text-primary">Как читать Market Pulse</h2>
        <p className="mt-2 max-w-3xl text-sm text-text-secondary">
          Руководство живёт отдельным экраном, поэтому первая страница открывается быстрее. Внутри —
          источники, границы применимости и то, как проверить любое число на сайте.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {entries.map(({ href, icon: Icon, title, text }) => (
            <a
              key={href}
              href={href}
              className="group rounded-2xl border border-rose-300/25 bg-rose-400/[0.07] p-4 transition-colors hover:border-rose-300/60 hover:bg-rose-400/[0.12] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-rose-400"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500 text-white">
                <Icon className="h-4 w-4" />
              </span>
              <p className="mt-3 text-sm font-extrabold text-text-primary">{title}</p>
              <p className="mt-1 text-xs text-text-secondary">{text}</p>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
