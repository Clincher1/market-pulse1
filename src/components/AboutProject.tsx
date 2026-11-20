import { motion } from 'framer-motion';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock3,
  Code2,
  Database,
  ExternalLink,
  Newspaper,
  ShieldCheck,
  TriangleAlert,
  Workflow,
} from 'lucide-react';
import { SectionThemeBadge } from './sectionThemes';

const architecture = [
  {
    icon: Code2,
    title: 'Интерфейс',
    stack: 'React · TypeScript · Vite',
    text: 'Показывает рыночные значения, их источник и дату наблюдения; каждая тема открывается на отдельной странице.',
  },
  {
    icon: Database,
    title: 'Данные',
    stack: 'Supabase Postgres · Edge Functions',
    text: 'Хранит публичные кэши и архивные записи. Браузер читает данные; исторические строки архива не удаляются этим интерфейсом.',
  },
  {
    icon: Workflow,
    title: 'Серверные источники',
    stack: 'Vercel API · официальные потоки и RSS',
    text: 'Российские индикаторы и заголовки запрашиваются на сервере с ограничениями времени. Источник, который не ответил, не должен блокировать остальные данные.',
  },
];

const principles = [
  'Новости показываются как публикации: заголовок, источник, время и ссылка. Оценки важности, уверенности, тональности и предполагаемого влияния не выдаются за факты.',
  'Заголовок и последующее движение цены сами по себе не доказывают, что произошло одно событие или что публикация вызвала изменение.',
  'Рыночные вычисления привязаны к показанным рядам; формула, единицы и база сравнения указываются рядом.',
  'Если источник не дал значение, сайт показывает отсутствие данных, а не придуманное или устаревшее число под новой датой.',
  'Выдача новых прогнозов остановлена. Архивные прогнозные записи и их исходные строки сохранены для проверки; архив не является текущей рекомендацией.',
];

const limitations = [
  'Внешние источники могут задержать публикацию, вернуть неполный ответ или временно не отвечать.',
  'Котировка, дневное закрытие и официальный курс — разные типы значений; сравнивать их можно только с учётом даты и единицы.',
  'Изменение ряда описывает только наблюдаемое движение и не устанавливает его причину.',
  'Проект не даёт персональных инвестиционных рекомендаций и не обещает доходность.',
];

export default function AboutProject() {
  return (
    <section id="about" className="scroll-mt-28" aria-labelledby="about-title">
      <motion.article
        initial={{ opacity: 0, y: 22 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.42, ease: 'easeOut' }}
        className="overflow-hidden rounded-[28px] border border-slate-300/25 bg-linear-to-br from-white via-blue-50/70 to-slate-50 shadow-[0_18px_48px_rgba(15,23,42,0.08)]"
      >
        <div className="grid gap-8 p-6 sm:p-8 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] xl:p-10">
          <div>
            <SectionThemeBadge themeId="about" />
            <h2 id="about-title" className="mt-5 text-3xl font-black tracking-tight text-text-primary sm:text-4xl">
              Рыночные данные с источником и временем
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-text-secondary">
              Market Pulse собирает проверяемые рыночные значения и заголовки публикаций.
              Там, где сайт считает разницу по ряду, можно увидеть базу сравнения и формулу.
              Сайт не превращает классификацию новости в факт о рынке и не выводит причинность
              из совпадения заголовка с движением цены.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <Clock3 className="h-5 w-5 text-text-secondary" aria-hidden="true" />
                <p className="mt-3 text-sm font-extrabold text-text-primary">Наблюдения, не обещания</p>
                <p className="mt-1 text-sm leading-relaxed text-text-secondary">
                  У рыночных значений указаны источник и дата или время. Если данных нет,
                  значение не подменяется догадкой.
                </p>
              </div>
              <div className="rounded-2xl border border-emerald-300/15 bg-emerald-400/[0.06] p-4">
                <ShieldCheck className="h-5 w-5 text-emerald-800" aria-hidden="true" />
                <p className="mt-3 text-sm font-extrabold text-text-primary">Без браузерной слежки</p>
                <p className="mt-1 text-sm leading-relaxed text-text-secondary">
                  Нет cookies, аналитики и браузерных SDK телеметрии. Технический мониторинг
                  выполняется на серверной стороне.
                </p>
              </div>
            </div>

            <div className="mt-7 flex flex-wrap gap-3">
              <a
                href="/guide"
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-accent-strong px-5 py-2.5 text-sm font-extrabold text-white shadow-lg shadow-accent/25 transition-colors hover:bg-accent-strong-hover focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-200"
              >
                <BookOpen className="h-4 w-4" aria-hidden="true" />
                Методология
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
              <a
                href="https://github.com/Clincher1/market-pulse1/tree/main"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-5 py-2.5 text-sm font-extrabold text-text-primary transition-colors hover:border-cyan-300/50 hover:bg-cyan-400/10 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-200"
              >
                <Code2 className="h-4 w-4 text-cyan-800" aria-hidden="true" />
                Код в GitHub · main
                <ExternalLink className="h-3.5 w-3.5 text-text-secondary" aria-hidden="true" />
              </a>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-bg-card p-5">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-400/15 text-cyan-800">
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-base font-extrabold text-text-primary">Проверяемые ряды</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                Курсы, биржевые индексы, ставки и котировки показаны с тем источником и датой,
                которые пришли в ответе источника.
              </p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-bg-card p-5">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-400/15 text-blue-800">
                <Newspaper className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-base font-extrabold text-text-primary">Исходные заголовки</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                В лентах оставлены текст заголовка, издатель, время публикации и ссылка. Нет
                оценки новости как важной, негативной или влияющей на конкретный актив.
              </p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-bg-card p-5 sm:col-span-2">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-400/15 text-violet-800">
                <Database className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-base font-extrabold text-text-primary">Архив прогнозных записей</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                Новые прогнозы не выпускаются. Исторические записи и сохранённые результаты
                остаются в архиве, но не являются текущими сигналами. Сопоставление с ценовым
                рядом не устанавливает причинную связь с новостями.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 border-t border-slate-200 bg-slate-50 p-6 sm:p-8 lg:grid-cols-3 xl:p-10 xl:pt-8">
          {architecture.map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.title} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <div className="flex items-start justify-between gap-4">
                  <Icon className="h-6 w-6 text-cyan-800" aria-hidden="true" />
                  <span className="text-right text-[11px] font-bold leading-relaxed text-text-secondary">
                    {item.stack}
                  </span>
                </div>
                <h3 className="mt-4 text-base font-extrabold text-text-primary">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">{item.text}</p>
              </article>
            );
          })}
        </div>

        <div className="grid gap-4 p-6 pt-0 sm:p-8 sm:pt-0 lg:grid-cols-2 xl:p-10 xl:pt-0">
          <div className="rounded-3xl border border-blue-300/15 bg-blue-400/[0.05] p-5 sm:p-6">
            <h3 className="flex items-center gap-2 text-base font-extrabold text-text-primary">
              <ShieldCheck className="h-5 w-5 text-blue-800" aria-hidden="true" />
              Правила представления данных
            </h3>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-text-secondary">
              {principles.map((rule) => (
                <li key={rule} className="flex gap-2.5">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-800" aria-hidden="true" />
                  <span>{rule}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-3xl border border-amber-300/15 bg-amber-400/[0.05] p-5 sm:p-6">
            <h3 className="flex items-center gap-2 text-base font-extrabold text-text-primary">
              <TriangleAlert className="h-5 w-5 text-amber-900" aria-hidden="true" />
              Ограничения
            </h3>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-text-secondary">
              {limitations.map((item) => (
                <li key={item} className="flex gap-2.5">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </motion.article>
    </section>
  );
}
