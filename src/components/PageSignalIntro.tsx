import { ArrowRight } from 'lucide-react';
import { PAGE_PATHS } from '@/lib/routes';
import { SECTION_THEMES, type SectionThemeId } from './sectionThemes.data';

type PageSignalIntroProps = {
  page: {
    themeId: SectionThemeId;
    title: string;
    description: string;
  };
};

/** Shared, open editorial heading for every inner page. */
export default function PageSignalIntro({ page }: PageSignalIntroProps) {
  const theme = SECTION_THEMES[page.themeId];
  const Icon = theme.icon;

  return (
    <header className="page-signal-intro" data-theme={theme.id}>
      <div className="page-signal-intro__content">
        <div className="page-signal-intro__eyebrow">
          <span className="page-signal-intro__icon-wrap" aria-hidden="true">
            <Icon className="page-signal-intro__eyebrow-icon" />
          </span>
          <span>MARKET PULSE</span>
          <span className="page-signal-intro__divider" aria-hidden="true" />
          <span>{theme.order} · {theme.navLabel}</span>
        </div>

        <h1 className="page-signal-intro__title">{page.title}</h1>
        <p className="page-signal-intro__description">{page.description}</p>

        <div className="page-signal-intro__footer">
          <span className="page-signal-intro__path-label">
            <span aria-hidden="true" />
            Источник · проверка · контекст
          </span>
          <a className="page-signal-intro__link" href={PAGE_PATHS.dashboard}>
            Все разделы <ArrowRight aria-hidden="true" />
          </a>
        </div>
      </div>

      <div className="page-signal-intro__art" aria-hidden="true">
        <svg viewBox="0 0 480 300" fill="none" xmlns="http://www.w3.org/2000/svg">
          <ellipse
            className="page-signal-intro__orbit page-signal-intro__orbit--wide"
            cx="240"
            cy="150"
            rx="205"
            ry="82"
            transform="rotate(-19 240 150)"
          />
          <ellipse
            className="page-signal-intro__orbit page-signal-intro__orbit--tall"
            cx="240"
            cy="150"
            rx="151"
            ry="109"
            transform="rotate(32 240 150)"
          />
          <circle className="page-signal-intro__orbit page-signal-intro__orbit--core" cx="240" cy="150" r="52" />
          <path
            className="page-signal-intro__thread"
            d="M40 174C99 107 141 92 185 134C224 171 244 216 293 188C342 160 364 87 438 104"
          />
          <path
            className="page-signal-intro__runner"
            d="M40 174C99 107 141 92 185 134C224 171 244 216 293 188C342 160 364 87 438 104"
          />
          <circle className="page-signal-intro__node page-signal-intro__node--quiet" cx="40" cy="174" r="5" />
          <circle className="page-signal-intro__node" cx="185" cy="134" r="6" />
          <circle className="page-signal-intro__node page-signal-intro__node--bright" cx="293" cy="188" r="7" />
          <circle className="page-signal-intro__node page-signal-intro__node--quiet" cx="438" cy="104" r="5" />
          <circle className="page-signal-intro__core" cx="240" cy="150" r="8" />
        </svg>
        <span className="page-signal-intro__art-caption">МАРШРУТ ПРОВЕРКИ</span>
      </div>
    </header>
  );
}
