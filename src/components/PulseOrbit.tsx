import { m as motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, Globe2, Landmark, Newspaper } from 'lucide-react';
import { PAGE_PATHS } from '@/lib/routes';
import BrandMark from './BrandMark';

const ORBIT_LINKS = [
  {
    href: PAGE_PATHS.russia,
    label: 'Россия',
    detail: 'рынки и бизнес',
    icon: Landmark,
    className: 'pulse-orbit__link--russia',
  },
  {
    href: PAGE_PATHS.global,
    label: 'Мир',
    detail: 'мировые ориентиры',
    icon: Globe2,
    className: 'pulse-orbit__link--world',
  },
  {
    href: PAGE_PATHS.news,
    label: 'Публикации',
    detail: 'источники и контекст',
    icon: Newspaper,
    className: 'pulse-orbit__link--news',
  },
];

/** Abstract vector artwork for the overview hero; it is not a live chart. */
export default function PulseOrbit() {
  const reduceMotion = useReducedMotion();

  return (
    <nav
      className="pulse-orbit"
      aria-label="Быстрые ссылки: российские рынки, мировые рынки и публикации. Графика декоративная и не показывает рыночные данные."
    >
      <div className="pulse-orbit__aura pulse-orbit__aura--blue" aria-hidden="true" />
      <div className="pulse-orbit__aura pulse-orbit__aura--mint" aria-hidden="true" />
      <div className="pulse-orbit__mesh" aria-hidden="true" />

      <svg
        className="pulse-orbit__mobile-scene"
        viewBox="0 0 360 300"
        preserveAspectRatio="none"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="180" cy="150" r="146" fill="#eef1f4" />
        <ellipse className="pulse-orbit__mobile-track pulse-orbit__mobile-track--far" cx="180" cy="150" rx="140" ry="77" transform="rotate(-27 180 150)" />
        <ellipse className="pulse-orbit__mobile-track pulse-orbit__mobile-track--near" cx="180" cy="150" rx="104" ry="57" transform="rotate(31 180 150)" />
        <path
          className="pulse-orbit__mobile-thread"
          d="M24 207C75 122 119 99 163 133C208 168 247 211 334 89"
          stroke="#6b7b8f"
        />
        <path
          className="pulse-orbit__mobile-runner"
          d="M24 207C75 122 119 99 163 133C208 168 247 211 334 89"
          pathLength="100"
          stroke="#6b7b8f"
        />
        <circle className="pulse-orbit__mobile-node pulse-orbit__mobile-node--mint" cx="56" cy="177" r="3.4" />
        <circle className="pulse-orbit__mobile-node pulse-orbit__mobile-node--violet" cx="288" cy="119" r="4" />
        <circle className="pulse-orbit__mobile-node pulse-orbit__mobile-node--cyan" cx="323" cy="104" r="2.8" />
        <circle className="pulse-orbit__mobile-star" cx="107" cy="78" r="1.4" />
        <circle className="pulse-orbit__mobile-star" cx="257" cy="62" r="1.2" />
        <circle className="pulse-orbit__mobile-star" cx="302" cy="209" r="1.3" />
        <circle className="pulse-orbit__mobile-star" cx="83" cy="242" r="1.1" />
      </svg>

      <svg className="pulse-orbit__chart" viewBox="0 0 640 600" fill="none" aria-hidden="true">
        <circle className="pulse-orbit__chart-ring pulse-orbit__chart-ring--outer" cx="320" cy="292" r="252" />
        <circle className="pulse-orbit__chart-ring pulse-orbit__chart-ring--inner" cx="320" cy="292" r="196" />
        <ellipse className="pulse-orbit__chart-orbit" cx="320" cy="292" rx="239" ry="114" transform="rotate(-28 320 292)" />
        <path d="M60 292H580M320 32V552" className="pulse-orbit__crosshair" />
        <path d="M75 362H166L195 309L232 414L265 339L296 353L330 302L371 329L413 219L457 263L489 240L565 240V460H75V362Z" fill="rgba(90,100,114,0.08)" />
        <path
          d="M75 362H166L195 309L232 414L265 339L296 353L330 302L371 329L413 219L457 263L489 240L565 240"
          className="pulse-orbit__chart-line"
          pathLength="100"
        />
        <path
          d="M75 362H166L195 309L232 414L265 339L296 353L330 302L371 329L413 219L457 263L489 240L565 240"
          className="pulse-orbit__chart-runner"
          pathLength="100"
        />
        <circle className="pulse-orbit__chart-node" cx="232" cy="414" r="5" />
        <circle className="pulse-orbit__chart-node pulse-orbit__chart-node--bright" cx="413" cy="219" r="6" />
        <circle className="pulse-orbit__chart-node pulse-orbit__chart-node--mint" cx="565" cy="240" r="5" />
      </svg>

      <div className="pulse-orbit__center" aria-hidden="true">
        <span className="pulse-orbit__center-halo" />
        <span className="pulse-orbit__center-label">MARKET PULSE</span>
        <BrandMark className="pulse-orbit__brand" />
        <svg className="pulse-orbit__mobile-mark" viewBox="0 0 100 54" fill="none" aria-hidden="true">
          <path
            d="M8 29H22L29 15L37 40L46 21L53 29H68L77 14"
            stroke="#3f83a1"
            strokeWidth="4.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            className="pulse-orbit__mobile-mark-flow"
            d="M8 29H22L29 15L37 40L46 21L53 29H68L77 14"
            pathLength="100"
            stroke="#F0FFFC"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle className="pulse-orbit__mobile-mark-node" cx="77" cy="14" r="3.5" />
        </svg>
        <span className="pulse-orbit__center-caption">факты · источники · контекст</span>
      </div>

      <div className="pulse-orbit__status" aria-hidden="true">
        <span className="pulse-orbit__status-dot" />
        <span>КАРТА РЫНКОВ</span>
        <span className="pulse-orbit__status-divider" />
        <span>БЕЗ ЛИШНЕГО ШУМА</span>
      </div>

      {ORBIT_LINKS.map((link, index) => {
        const Icon = link.icon;
        return (
          <motion.a
            key={link.href}
            href={link.href}
            className={`pulse-orbit__link ${link.className}`}
            initial={false}
            animate={{ y: 0, scale: 1 }}
            transition={
              reduceMotion || typeof IntersectionObserver === 'undefined'
                ? { duration: 0 }
                : { duration: 0.54, delay: 0.2 + index * 0.11, ease: 'easeOut' }
            }
            whileHover={reduceMotion ? undefined : { y: -5, scale: 1.035 }}
            whileTap={reduceMotion ? undefined : { scale: 0.98 }}
          >
            <span className="pulse-orbit__link-icon" aria-hidden="true">
              <Icon className="h-[18px] w-[18px]" />
            </span>
            <span className="pulse-orbit__link-copy">
              <span className="pulse-orbit__link-title">{link.label}</span>
              <span className="pulse-orbit__link-detail">{link.detail}</span>
            </span>
            <ArrowUpRight className="pulse-orbit__link-arrow" aria-hidden="true" />
          </motion.a>
        );
      })}

      <span className="pulse-orbit__micro-label" aria-hidden="true">OBSERVE · VERIFY · UNDERSTAND</span>
    </nav>
  );
}
