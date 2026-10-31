import { motion } from 'framer-motion';
import {
  ArrowRight,
  BookOpen,
  Bot,
  CheckCircle2,
  Clock3,
  Code2,
  Database,
  ExternalLink,
  Landmark,
  Newspaper,
  Rocket,
  ShieldCheck,
  TriangleAlert,
  Workflow,
} from 'lucide-react';
import { SectionThemeBadge } from './sectionThemes';

const pipeline = [
  {
    icon: Newspaper,
    title: 'Событие',
    text: 'Новости и факты из публичных источников очищаются и группируются в одно событие вместо десятка пересказов.',
  },
  {
    icon: Bot,
    title: 'Классификация',
    text: 'ИИ выделяет канал передачи и не более трёх наиболее прямых воздействий. Если механизм слабый, событие отклоняется.',
  },
  {
    icon: Landmark,
    title: 'Контекст России',
    text: 'Отдельный контур переводит глобальный шок на язык рубля, ставок, нефти, логистики, экспорта и цен внутри страны.',
  },
  {
    icon: CheckCircle2,
    title: 'Проверка исходом',
    text: 'Гипотеза фиксируется до результата, а через 1, 3 и 10 торговых дней сравнивается с реальным движением цены.',
  },
];

const architecture = [
  {
    icon: Code2,
    title: 'Интерфейс',
    stack: 'React 18 · TypeScript · Vite · Tailwind CSS 4',
    text: 'Дашборд: публичные данные читаются из кэша, тяжёлые разделы подключаются по мере прокрутки, у каждого числа видны источник и время.',
  },
  {
    icon: Database,
    title: 'Данные и автоматика',
    stack: 'Supabase Postgres · Edge Functions · pg_cron',
    text: 'Расписания автономно обновляют новости, цены, Tension и события. Прогнозы больше не выпускаются: 31.10.2026 их выдачу остановили, потому что точность оказалась хуже случайной. Пишущие функции закрыты серверным секретом.',
  },
  {
    icon: Workflow,
    title: 'Поставка',
    stack: 'Vercel · GitHub Actions',
    text: 'Фронтенд публикуется на Vercel. Защищённые shadow-функции развёртываются отдельным workflow с узко ограниченным токеном Supabase.',
  },
];

const honestyRules = [
  'Сайт фиксирует факты и ведёт журнал ожиданий, а не предсказывает цены: ни один блок не говорит, что покупать или продавать.',
  'Доля свидетельств — не вероятность движения цены. За записанным ожиданием стоит рынок: журнал сверяет его с фактическим закрытием.',
  'Направление показывается только после того, как журнал докажет преимущество; до этого стоит «Направление скрыто», а счёт публикуется целиком.',
  'Промахи из журнала не удаляются и не подгоняются задним числом. Если оценка пересчитана, прежнее значение сохраняется и об этом сказано.',
  'Недостающее число не заполняется: вместо цены стоит прочерк и пометка, что свежая цена не получена.',
];

const limitations = [
  'Бесплатные источники могут опаздывать, отдавать неполный текст или временно быть недоступны.',
  'Языковая модель может ошибиться в классификации; поэтому важны отказ от слабых связей и последующая проверка.',
  'Ценовая реакция не доказывает причинно-следственную связь: на актив одновременно действуют другие факторы.',
  'Это аналитический исследовательский проект, а не персональная инвестиционная рекомендация.',
];

const roadmap = [
  'Калибровка вероятностей после накопления достаточного числа оценённых исходов v3.',
  'Режим рынка: один и тот же шок может работать по-разному при risk-on и risk-off.',
  'Карта передачи шоков между нефтью, валютами, ставками, индексами и российским контуром.',
  '«Машина времени»: воспроизведение события только на данных, которые были доступны в момент, когда вышло ожидание.',
];

export default function AboutProject() {
  return (
    <section id="about" className="scroll-mt-28" aria-labelledby="about-title">
      <motion.article
        initial={{ opacity: 0, y: 22 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.42, ease: 'easeOut' }}
        className="overflow-hidden rounded-[28px] border border-slate-300/25 bg-linear-to-br from-[#111827] via-[#0A1224] to-[#07101F] shadow-[0_28px_80px_rgba(0,0,0,0.28)]"
      >
        <div className="grid gap-8 p-6 sm:p-8 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] xl:p-10">
          <div>
            <SectionThemeBadge themeId="about" />
            <h2
              id="about-title"
              className="mt-5 text-3xl font-black tracking-tight text-white sm:text-4xl"
            >
              Не ещё одна лента новостей, а система, которая запоминает и проверяет себя
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-300">
              Market Pulse отвечает на три вопроса: что произошло, через какой канал это
              может дойти до рынков и России, и что в итоге случилось с ценой. Главная
              ценность проекта — не мгновенный «прогноз», а накапливаемая проверяемая
              история событий, гипотез и исходов.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4">
                <Clock3 className="h-5 w-5 text-slate-300" />
                <p className="mt-3 text-sm font-extrabold text-white">Работает автономно</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-400">
                  Сбор, кластеризация, классификация, цены, исходы и журнал сигналов
                  запускаются по расписанию без ручного ежедневного обслуживания.
                </p>
              </div>
              <div className="rounded-2xl border border-emerald-300/15 bg-emerald-400/[0.06] p-4">
                <ShieldCheck className="h-5 w-5 text-emerald-300" />
                <p className="mt-3 text-sm font-extrabold text-white">Бесплатный стек</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-400">
                  Проект спроектирован так, чтобы оставаться в свободных лимитах Vercel,
                  Supabase, GitHub Actions и используемых API.
                </p>
              </div>
            </div>

            <div className="mt-7 flex flex-wrap gap-3">
              <a
                href="#guide"
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-extrabold text-white shadow-lg shadow-accent/25 transition-colors hover:bg-accent-hover focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-200"
              >
                <BookOpen className="h-4 w-4" />
                Методология
                <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href="https://github.com/Clincher1/market-pulse1"
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/15 bg-white/[0.05] px-5 py-2.5 text-sm font-extrabold text-slate-100 transition-colors hover:border-cyan-300/50 hover:bg-cyan-400/10 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-200"
              >
                <Code2 className="h-4 w-4 text-cyan-300" />
                Исходный код
                <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
              </a>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {pipeline.map((step, index) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.title}
                  className="relative rounded-3xl border border-white/10 bg-[#0B1528]/88 p-5"
                >
                  <span className="absolute right-5 top-4 text-xs font-black tracking-widest text-slate-600">
                    0{index + 1}
                  </span>
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-linear-to-br from-cyan-400/20 via-blue-500/20 to-violet-500/20 text-cyan-200">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 text-base font-extrabold text-white">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{step.text}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 border-t border-white/8 bg-black/12 p-6 sm:p-8 lg:grid-cols-3 xl:p-10 xl:pt-8">
          {architecture.map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.title} className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                <div className="flex items-start justify-between gap-4">
                  <Icon className="h-6 w-6 text-cyan-300" />
                  <span className="text-right text-[11px] font-bold leading-relaxed text-slate-400">
                    {item.stack}
                  </span>
                </div>
                <h3 className="mt-4 text-base font-extrabold text-white">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{item.text}</p>
              </article>
            );
          })}
        </div>

        <div className="grid gap-4 p-6 pt-0 sm:p-8 sm:pt-0 lg:grid-cols-2 xl:p-10 xl:pt-0">
          <div className="rounded-3xl border border-blue-300/15 bg-blue-400/[0.05] p-5 sm:p-6">
            <h3 className="flex items-center gap-2 text-base font-extrabold text-white">
              <ShieldCheck className="h-5 w-5 text-blue-300" />
              Правила честности
            </h3>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-slate-300">
              {honestyRules.map((rule) => (
                <li key={rule} className="flex gap-2.5">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                  <span>{rule}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-3xl border border-amber-300/15 bg-amber-400/[0.05] p-5 sm:p-6">
            <h3 className="flex items-center gap-2 text-base font-extrabold text-white">
              <TriangleAlert className="h-5 w-5 text-amber-300" />
              Ограничения
            </h3>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-slate-300">
              {limitations.map((item) => (
                <li key={item} className="flex gap-2.5">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-white/8 px-6 py-6 sm:px-8 xl:px-10">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
            <div className="flex shrink-0 items-center gap-2 text-sm font-extrabold text-white">
              <Rocket className="h-5 w-5 text-violet-300" />
              Следующий этап
            </div>
            <div className="grid flex-1 gap-2 sm:grid-cols-2">
              {roadmap.map((item, index) => (
                <div key={item} className="rounded-2xl bg-white/[0.04] px-4 py-3 text-sm leading-relaxed text-slate-300">
                  <span className="mr-2 font-black text-violet-300">{index + 1}.</span>
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.article>
    </section>
  );
}
