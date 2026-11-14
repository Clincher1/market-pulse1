import { ArrowRight, Calculator, Database, Eye, ShieldCheck } from 'lucide-react';

/**
 * «Откуда мы знаем» — четыре шага конвейера вместо обещания «мы используем ИИ».
 *
 * Приём с лендингов (собираем → очищаем → считаем → доставляем): он превращает
 * абстрактное «аналитика» в процесс, который можно проверить по шагам. Здесь
 * каждый шаг ведёт в соответствующий раздел гида, чтобы слово «проверяем» не
 * оставалось на совести читателя.
 *
 * Тексты намеренно называют ограничения, а не только возможности: источник
 * может молчать, закрытие дня приходит с задержкой, а новостная лента — не
 * истина в последней инстанции.
 */
const STEPS = [
  {
    icon: Database,
    title: 'Забираем',
    text:
      'Yahoo Finance (Brent, S&P 500), Европейский центральный банк (USD/EUR), Twelve Data (золото), Kraken (BTC), ЦБ РФ и Мосбиржа для рубля, индексов и ОФЗ. Новости — из открытых RSS-лент.',
    href: '#guide-overview',
    link: 'Источники',
  },
  {
    icon: ShieldCheck,
    title: 'Проверяем',
    text:
      'Раз в час самопроверка сверяет: не застряла ли дата наблюдения, сходится ли изменение на плитке с опубликованным рядом, есть ли у каждого значения дата. Итог — на странице состояния.',
    href: '#guide-data-quality',
    link: 'Как проверяем',
  },
  {
    icon: Calculator,
    title: 'Считаем',
    text:
      'Изменения считаются по опубликованным значениям с указанной базой сравнения. Совпадение по времени не используется как доказательство причины.',
    href: '#guide-changes',
    link: 'Формулы изменений',
  },
  {
    icon: Eye,
    title: 'Показываем',
    text:
      'У каждого числа — источник и момент, на который оно верно: «за 2 нояб.» для закрытия, «на 10:21 МСК» для котировки. Если данных нет — прочерк и слова о том, чего не хватает.',
    href: '#guide-assets',
    link: 'Как читать цену',
  },
];

export default function HowWeKnow() {
  return (
    <section aria-labelledby="how-we-know-title" className="mb-8 lg:mb-10">
      <h2
        id="how-we-know-title"
        className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-text-secondary"
      >
        Откуда мы знаем
      </h2>
      <ol className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {STEPS.map((step, index) => (
          <li
            key={step.title}
            className="flex flex-col rounded-xl border border-white/10 bg-bg-card p-3.5"
          >
            <div className="flex items-center gap-2">
              {/* Номер шага — текст 11 px: на подложке accent/15 #3b82f6 даёт
                  3,99:1. Поэтому цифра белая, а акцент остаётся подложке и
                  иконке (иконке хватает 3:1). */}
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent/15 text-[11px] font-extrabold tabular-nums text-white">
                {String(index + 1).padStart(2, '0')}
              </span>
              <step.icon className="h-4 w-4 text-accent" aria-hidden="true" />
              <h3 className="text-sm font-extrabold text-text-primary">{step.title}</h3>
            </div>
            <p className="mt-2 flex-1 text-[11px] leading-relaxed text-text-secondary">{step.text}</p>
            <a
              href={step.href}
              className="mt-2 inline-flex min-h-6 w-fit items-center gap-1 text-[11px] font-bold text-accent underline-offset-2 hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent"
            >
              {step.link}
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}
