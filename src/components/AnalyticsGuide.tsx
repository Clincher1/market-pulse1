import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BookOpen,
  Calculator,
  CheckCircle2,
  Clock,
  Database,
  Gauge,
  Heart,
  Info,
  LineChart,
  MousePointerClick,
  Newspaper,
  RefreshCw,
  Scale,
  ShieldQuestion,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

type GuideSectionProps = {
  id: string;
  eyebrow: string;
  title: string;
  icon: typeof Activity;
  children: ReactNode;
};

function GuideSection({ id, eyebrow, title, icon: Icon, children }: GuideSectionProps) {
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="scroll-mt-24 bg-bg-card rounded-xl2 border border-border-subtle shadow-lg p-6 lg:p-8"
    >
      <div className="flex items-start gap-4 mb-6">
        <div className="w-11 h-11 rounded-xl bg-accent/10 text-accent flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.14em] text-accent mb-1">
            {eyebrow}
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-text-primary">{title}</h2>
        </div>
      </div>
      {children}
    </motion.section>
  );
}

function Callout({
  variant = 'info',
  children,
}: {
  variant?: 'info' | 'warning' | 'danger';
  children: ReactNode;
}) {
  const styles =
    variant === 'warning'
      ? 'bg-warning/5 border-warning/25 text-warning'
      : variant === 'danger'
        ? 'bg-negative/5 border-negative/25 text-negative'
        : 'bg-accent/5 border-accent/25 text-accent';
  const Icon = variant === 'info' ? Info : AlertTriangle;

  return (
    <div className={`rounded-xl border p-5 flex items-start gap-3 ${styles}`}>
      <Icon className="w-5 h-5 shrink-0 mt-0.5" />
      <div className="text-sm leading-relaxed text-text-primary">{children}</div>
    </div>
  );
}

function FormulaDetails({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group rounded-xl border border-border-subtle bg-bg-primary/60 p-5">
      <summary className="cursor-pointer list-none flex items-center justify-between gap-4 text-sm font-bold text-text-primary">
        <span className="flex items-center gap-2">
          <Calculator className="w-4 h-4 text-accent" />
          {title}
        </span>
        <span className="text-accent transition-transform group-open:rotate-45 text-xl leading-none">+</span>
      </summary>
      <div className="mt-4 text-sm leading-relaxed text-text-secondary space-y-3">{children}</div>
    </details>
  );
}

function QuickStep({ number, title, text }: { number: number; title: string; text: string }) {
  return (
    <div className="bg-bg-primary/60 border border-border-subtle rounded-xl p-5">
      <div className="w-8 h-8 rounded-full bg-accent text-white font-extrabold flex items-center justify-center mb-3">
        {number}
      </div>
      <div className="font-bold text-text-primary mb-1">{title}</div>
      <p className="text-sm text-text-secondary leading-relaxed">{text}</p>
    </div>
  );
}

const quickLinks = [
  { label: 'Порядок чтения', href: '#guide-start' },
  { label: 'Tension и график', href: '#guide-tension' },
  { label: 'Активы', href: '#guide-assets' },
  { label: 'Новости', href: '#guide-news' },
  { label: 'Прогнозы', href: '#guide-forecasts' },
  { label: 'Свежесть и ограничения', href: '#guide-data-quality' },
  { label: 'Частые вопросы', href: '#guide-faq' },
];

export default function AnalyticsGuide() {
  return (
    <div className="space-y-6 lg:space-y-8">
      <motion.section
        id="guide"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="scroll-mt-24 overflow-hidden rounded-xl2 border border-accent/25 bg-gradient-to-br from-accent/15 via-bg-card to-bg-card shadow-xl p-6 lg:p-10"
      >
        <div className="inline-flex items-center gap-2 rounded-full bg-accent/15 text-accent px-3 py-1.5 text-xs font-bold uppercase tracking-wider mb-5">
          <BookOpen className="w-4 h-4" />
          Методология простым языком
        </div>
        <h1 className="text-3xl lg:text-5xl font-extrabold tracking-tight mb-4">
          Как читать Market Pulse
        </h1>
        <p className="max-w-4xl text-base lg:text-lg text-text-secondary leading-relaxed mb-8">
          Market Pulse показывает не «готовый ответ», а цепочку: <strong className="text-text-primary">новости → оценка их тона и значимости → общий фон → гипотеза по активам</strong>.
          Эта страница объясняет, что означает каждая цифра, от какой базы она считается и где заканчиваются факты и начинается модельная оценка.
        </p>

        <div id="guide-start" className="scroll-mt-28 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
          <QuickStep
            number={1}
            title="Сначала общий фон"
            text="Посмотрите Tension: насколько негативен свежий новостной поток относительно шкалы 0–100."
          />
          <QuickStep
            number={2}
            title="Потом факты рынка"
            text="Проверьте карточки активов: что цены уже сделали и не отыграл ли рынок новость до вас."
          />
          <QuickStep
            number={3}
            title="Затем причины"
            text="В новостях смотрите источник, время, влияние на конкретный актив, важность и уверенность — не только заголовок."
          />
          <QuickStep
            number={4}
            title="Прогноз — последним"
            text="Стрелка и процент показывают перевес новостных сигналов, а не гарантию и не доказанную вероятность движения цены."
          />
        </div>

        <nav aria-label="Разделы инструкции" className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {quickLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="whitespace-nowrap rounded-full border border-border-subtle bg-bg-primary/70 px-4 py-2 text-sm font-semibold text-text-secondary hover:text-text-primary hover:border-accent/50 transition-colors"
            >
              {link.label}
            </a>
          ))}
        </nav>
      </motion.section>

      <GuideSection id="guide-overview" eyebrow="Главное различие" title="Что здесь факт, а что оценка модели" icon={Scale}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="rounded-xl bg-bg-primary/60 border border-border-subtle p-5">
            <div className="flex items-center gap-2 font-bold mb-3 text-text-primary">
              <Database className="w-4 h-4 text-positive" />
              Наблюдаемые данные
            </div>
            <ul className="space-y-2 text-sm text-text-secondary leading-relaxed">
              <li>источник, заголовок, ссылка и дата публикации;</li>
              <li>цена, процент изменения и точки мини-графика актива из кэша;</li>
              <li>количество новостей, попавших в расчёт.</li>
            </ul>
          </div>
          <div className="rounded-xl bg-bg-primary/60 border border-border-subtle p-5">
            <div className="flex items-center gap-2 font-bold mb-3 text-text-primary">
              <MousePointerClick className="w-4 h-4 text-warning" />
              Классификация новости
            </div>
            <ul className="space-y-2 text-sm text-text-secondary leading-relaxed">
              <li>тональность от −1 до +1;</li>
              <li>важность от 1 до 10;</li>
              <li>уверенность классификации от 0% до 100%;</li>
              <li>стрелки предполагаемого влияния на активы.</li>
            </ul>
          </div>
          <div className="rounded-xl bg-bg-primary/60 border border-border-subtle p-5">
            <div className="flex items-center gap-2 font-bold mb-3 text-text-primary">
              <Target className="w-4 h-4 text-accent" />
              Агрегаты и гипотезы
            </div>
            <ul className="space-y-2 text-sm text-text-secondary leading-relaxed">
              <li>Tension — сводное негативное давление свежего новостного фона;</li>
              <li>прогноз — взвешенный перевес сигналов вверх или вниз;</li>
              <li>основание прогноза объясняет, каким получился этот перевес.</li>
            </ul>
          </div>
        </div>
        <div className="mt-5">
          <Callout>
            <strong>Правило чтения:</strong> чем дальше цифра находится от первоисточника, тем осторожнее её нужно трактовать.
            Заголовок можно открыть и проверить. Тональность уже является интерпретацией. Прогноз — гипотеза поверх нескольких интерпретаций.
          </Callout>
        </div>
      </GuideSection>

      <GuideSection id="guide-tension" eyebrow="Главный индекс" title="Шкала напряжённости мира и график за 7 дней" icon={Activity}>
        <p className="text-text-secondary leading-relaxed mb-6">
          Tension — это <strong className="text-text-primary">индекс негативного новостного давления от 0 до 100</strong>.
          Он не измеряет «вероятность кризиса» и пока не является аналогом VIX: в текущей версии в нём участвуют только классифицированные новости, а не волатильность рынка, кредитные Спреды или календарь событий.
        </p>

        <div className="mb-3 flex overflow-hidden rounded-full border border-border-subtle text-xs font-bold">
          <div style={{ width: '30%' }} className="bg-blue-500/80 text-white px-3 py-3 text-center">0–29 · Холодно</div>
          <div style={{ width: '41%' }} className="bg-warning/80 text-black px-3 py-3 text-center">30–70 · Тепло</div>
          <div style={{ width: '29%' }} className="bg-negative/85 text-white px-3 py-3 text-center">71–100 · Горячо</div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-7 text-sm leading-relaxed">
          <div className="rounded-xl bg-bg-primary/60 p-5 border border-border-subtle">
            <strong className="text-blue-400">0–29.</strong> <span className="text-text-secondary">Негативных и значимых сигналов мало либо они разбавлены нейтральными и позитивными новостями.</span>
          </div>
          <div className="rounded-xl bg-bg-primary/60 p-5 border border-border-subtle">
            <strong className="text-warning">30–70.</strong> <span className="text-text-secondary">Фон смешанный или умеренно негативный. Смотрите, какие именно сюжеты создают давление.</span>
          </div>
          <div className="rounded-xl bg-bg-primary/60 p-5 border border-border-subtle">
            <strong className="text-negative">71–100.</strong> <span className="text-text-secondary">Много свежих, важных и уверенно негативных сигналов. Это повод проверять первоисточники и реакцию цен, а не автоматическая команда продавать.</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
          <div className="rounded-xl border border-border-subtle bg-bg-primary/60 p-5">
            <h3 className="flex items-center gap-2 font-bold mb-3"><LineChart className="w-4 h-4 text-warning" /> Как читать график</h3>
            <ul className="space-y-2 text-sm text-text-secondary leading-relaxed">
              <li><strong className="text-text-primary">Горизонтальная ось</strong> — календарные дни, до семи последних точек.</li>
              <li><strong className="text-text-primary">Вертикальная ось</strong> — та же шкала 0–100, без скрытого масштаба.</li>
              <li><strong className="text-text-primary">Каждая точка</strong> — последнее сохранённое значение Tension за соответствующий день, а не каждое 15-минутное обновление.</li>
              <li><strong className="text-text-primary">Линия между точками</strong> — визуальное соединение дней; внутри дня индекс мог двигаться иначе.</li>
              <li>Если дней меньше семи, сайт честно показывает, сколько истории уже накоплено.</li>
            </ul>
          </div>
          <div className="rounded-xl border border-border-subtle bg-bg-primary/60 p-5">
            <h3 className="flex items-center gap-2 font-bold mb-3"><Clock className="w-4 h-4 text-accent" /> Какие новости попадают в индекс</h3>
            <ul className="space-y-2 text-sm text-text-secondary leading-relaxed">
              <li>только новости не старше 24 часов и не из будущего;</li>
              <li>не более 20 самых свежих квалифицированных записей;</li>
              <li>важность не ниже 3/10;</li>
              <li>уверенность классификации не ниже 50%;</li>
              <li>если квалифицированных новостей меньше трёх, расчёт пропускается и может оставаться предыдущее значение.</li>
            </ul>
          </div>
        </div>

        <FormulaDetails title="Формула Tension и пример расчёта">
          <p>Для каждой новости считается негативный вклад:</p>
          <div className="rounded-lg bg-bg-card border border-border-subtle p-4 font-mono text-[13px] text-text-primary overflow-x-auto">
            вклад = max(0, −тональность) × важность × уверенность
            <br />
            Tension = средний вклад ÷ 10 × 100
          </div>
          <p>
            Уверенность в формуле берётся долей: 80% → 0.8. Позитивная новость даёт нулевой негативный вклад, но всё равно участвует в среднем и поэтому разбавляет давление.
          </p>
          <div className="overflow-x-auto rounded-lg border border-border-subtle">
            <table className="min-w-[560px] w-full text-left text-sm">
              <thead className="bg-bg-card text-text-primary">
                <tr>
                  <th className="p-3">Новость</th>
                  <th className="p-3">Тональность</th>
                  <th className="p-3">Важность</th>
                  <th className="p-3">Уверенность</th>
                  <th className="p-3">Вклад</th>
                </tr>
              </thead>
              <tbody className="[&_td]:p-3 [&_tr]:border-t [&_tr]:border-border-subtle">
                <tr><td>Резкая эскалация</td><td>−0.80</td><td>8</td><td>90%</td><td>0.8 × 8 × 0.9 = 5.76</td></tr>
                <tr><td>Умеренный негатив</td><td>−0.20</td><td>5</td><td>60%</td><td>0.2 × 5 × 0.6 = 0.60</td></tr>
                <tr><td>Позитивная новость</td><td>+0.60</td><td>7</td><td>80%</td><td>0</td></tr>
              </tbody>
            </table>
          </div>
          <p><strong className="text-text-primary">Итог:</strong> (5.76 + 0.60 + 0) ÷ 3 ÷ 10 × 100 = <strong className="text-text-primary">21</strong>. Поэтому один тревожный заголовок не обязан делать весь фон «горячим».</p>
        </FormulaDetails>
      </GuideSection>

      <GuideSection id="guide-assets" eyebrow="Рыночный контекст" title="Ключевые активы: цена, процент и мини-график" icon={TrendingUp}>
        <div className="grid grid-cols-1 lg:grid-cols-[0.9fr_1.1fr] gap-6">
          <div className="rounded-xl2 border border-border-subtle bg-bg-primary/60 p-6">
            <div className="flex items-start justify-between mb-3">
              <span className="text-sm font-semibold text-text-secondary">Пример карточки</span>
              <span className="flex items-center gap-1 text-sm font-bold text-positive">
                <ArrowUpRight className="w-4 h-4" /> +1.2%
              </span>
            </div>
            <div className="text-3xl font-extrabold tabular-nums mb-4">$78.40</div>
            <svg viewBox="0 0 260 72" className="w-full h-20" role="img" aria-label="Пример мини-графика цены">
              <polyline points="0,58 32,52 64,55 96,42 128,46 160,31 192,34 224,20 260,14" fill="none" stroke="#10B981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="mt-3 text-xs text-text-secondary">Карточка условная: цифры нужны только для объяснения элементов.</div>
          </div>

          <div className="space-y-4 text-sm leading-relaxed text-text-secondary">
            <p><strong className="text-text-primary">Крупная цена</strong> — последнее значение, которое сайт получил из кэша Supabase. Это не потоковая биржевая котировка в реальном времени.</p>
            <p><strong className="text-text-primary">Процент справа</strong> — изменение относительно базы сравнения поставщика/кэша. Зелёный цвет означает положительное изменение, красный — отрицательное. В текущей карточке точный период изменения ещё не подписан, поэтому не называйте его автоматически «дневным», пока блок цен не перестроен на числовой ряд с явным инструментом и временем.</p>
            <p><strong className="text-text-primary">Мини-график (спарклайн)</strong> показывает форму последовательности сохранённых точек. У него нет осей цены и времени, а вертикальный масштаб подстраивается под конкретный актив. Поэтому наклон линий разных карточек напрямую сравнивать нельзя: маленькое движение может выглядеть резким.</p>
            <p><strong className="text-text-primary">Практический смысл:</strong> карточки активов нужны, чтобы проверить, отреагировал ли рынок уже сейчас. Если новость негативна, а цена давно упала до её появления в ленте, «новая» информация может быть уже в цене.</p>
          </div>
        </div>
        <div className="mt-5">
          <Callout variant="warning">
            <strong>Ограничение текущей версии цен:</strong> точный биржевой инструмент, биржа, время котировки и период процента пока не отображаются в карточке.
            Для торгового решения сверяйте цену в своём терминале. Перестройка блока на честные числовые инструменты и временные ряды — отдельный следующий этап.
          </Callout>
        </div>
      </GuideSection>

      <GuideSection id="guide-news" eyebrow="Единица анализа" title="Карточка новости: источник, влияние, тональность, важность и уверенность" icon={Newspaper}>
        <div className="rounded-xl2 border border-border-subtle bg-bg-primary/60 p-6 mb-6">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="px-2.5 py-1 bg-accent/10 text-accent text-xs font-bold rounded-md">Пример источника</span>
            <span className="text-xs text-text-secondary flex items-center gap-1"><Clock className="w-3 h-3" /> 2 ч назад</span>
            <span className="ml-auto text-xs text-warning font-semibold">Условный пример</span>
          </div>
          <h3 className="text-lg font-bold leading-snug mb-3">Центральный банк неожиданно ужесточил политику</h3>
          <div className="flex flex-wrap items-center gap-3 mb-4 text-sm">
            <span className="text-text-secondary">Влияние:</span>
            <span className="flex items-center gap-1 font-semibold text-negative">S&P 500 <TrendingDown className="w-4 h-4" /></span>
            <span className="flex items-center gap-1 font-semibold text-positive">Gold <TrendingUp className="w-4 h-4" /></span>
          </div>
          <p className="text-sm text-text-secondary leading-relaxed mb-5">
            Краткое резюме объясняет предполагаемый механизм: более высокие ставки повышают стоимость денег и могут давить на акции, а спрос на защитные активы при этом растёт.
          </p>
          <div className="flex flex-wrap gap-5 border-t border-border-subtle pt-4 text-sm">
            <span className="flex items-center gap-1.5"><Heart className="w-4 h-4 text-text-secondary" /> Тональность: <strong className="text-negative">−0.64 негатив</strong></span>
            <span className="flex items-center gap-1.5"><Gauge className="w-4 h-4 text-text-secondary" /> Важность: <strong className="text-negative">8/10</strong></span>
            <span className="flex items-center gap-1.5"><ShieldQuestion className="w-4 h-4 text-text-secondary" /> Уверенность: <strong className="text-positive">82%</strong></span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="rounded-xl border border-border-subtle bg-bg-primary/60 p-5">
            <h3 className="flex items-center gap-2 font-bold mb-3"><Heart className="w-4 h-4 text-negative" /> Тональность</h3>
            <p className="text-sm text-text-secondary leading-relaxed mb-5">
              Оценка эмоционального/рыночного знака новости от <strong className="text-text-primary">−1</strong> до <strong className="text-text-primary">+1</strong>. Это не процент и не ожидаемое изменение цены.
            </p>
            <div className="relative pt-1 pb-7">
              <div className="h-3 rounded-full bg-gradient-to-r from-negative via-neutral to-positive" />
              <span className="absolute left-0 top-6 text-xs text-text-secondary">−1</span>
              <span className="absolute left-[35%] top-6 -translate-x-1/2 text-xs text-text-secondary">−0.3</span>
              <span className="absolute left-1/2 top-6 -translate-x-1/2 text-xs text-text-secondary">0</span>
              <span className="absolute left-[65%] top-6 -translate-x-1/2 text-xs text-text-secondary">+0.3</span>
              <span className="absolute right-0 top-6 text-xs text-text-secondary">+1</span>
            </div>
            <ul className="space-y-2 text-sm text-text-secondary">
              <li><span className="text-negative font-bold">Ниже −0.3</span> — негатив;</li>
              <li><span className="text-text-primary font-bold">−0.3…+0.3</span> — нейтральная/смешанная;</li>
              <li><span className="text-positive font-bold">Выше +0.3</span> — позитив.</li>
            </ul>
          </div>

          <div className="rounded-xl border border-border-subtle bg-bg-primary/60 p-5">
            <h3 className="flex items-center gap-2 font-bold mb-3"><Gauge className="w-4 h-4 text-warning" /> Важность</h3>
            <p className="text-sm text-text-secondary leading-relaxed mb-5">
              Оценка потенциального масштаба события от <strong className="text-text-primary">1 до 10</strong>. Она отвечает на вопрос «насколько широко это может затронуть рынок?», а не «насколько процентов вырастет цена?».
            </p>
            <div className="grid grid-cols-10 gap-1 mb-4" aria-label="Шкала важности от 1 до 10">
              {[1,2,3,4,5,6,7,8,9,10].map((n) => (
                <div key={n} className={`rounded-md py-2 text-center text-xs font-bold ${n >= 8 ? 'bg-negative text-white' : n >= 6 ? 'bg-warning text-black' : 'bg-border-subtle text-text-secondary'}`}>
                  {n}
                </div>
              ))}
            </div>
            <ul className="space-y-2 text-sm text-text-secondary">
              <li><strong className="text-text-primary">1–2</strong> — почти шум; сайт скрывает новости ниже 3;</li>
              <li><strong className="text-text-primary">3–5</strong> — локальное или ограниченное значение;</li>
              <li><strong className="text-warning">6–7</strong> — заметное событие;</li>
              <li><strong className="text-negative">8–10</strong> — потенциально широкое рыночное значение. Красный здесь означает внимание, а не обязательно падение.</li>
            </ul>
          </div>

          <div className="rounded-xl border border-border-subtle bg-bg-primary/60 p-5">
            <h3 className="flex items-center gap-2 font-bold mb-3"><ShieldQuestion className="w-4 h-4 text-accent" /> Уверенность</h3>
            <p className="text-sm text-text-secondary leading-relaxed mb-5">
              Насколько уверенно классификатор понял новость и её предполагаемое влияние. Это <strong className="text-text-primary">не вероятность того, что прогноз сбудется</strong>.
            </p>
            <div className="flex overflow-hidden rounded-full border border-border-subtle text-[11px] font-bold mb-4">
              <div style={{ width: '40%' }} className="bg-negative/85 text-white py-2 text-center">0–40%</div>
              <div style={{ width: '30%' }} className="bg-warning/85 text-black py-2 text-center">41–70%</div>
              <div style={{ width: '30%' }} className="bg-positive/85 text-white py-2 text-center">71–100%</div>
            </div>
            <ul className="space-y-2 text-sm text-text-secondary">
              <li><span className="text-negative font-bold">Низкая</span> — текст неоднозначен, нужен первоисточник;</li>
              <li><span className="text-warning font-bold">Средняя</span> — трактовка правдоподобна, но есть альтернативы;</li>
              <li><span className="text-positive font-bold">Высокая</span> — связь события и активов выглядит прямой, хотя модель всё равно может ошибаться.</li>
            </ul>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
          <div className="rounded-xl border border-border-subtle bg-bg-primary/60 p-5">
            <h3 className="font-bold mb-3">Как сочетать важность и уверенность</h3>
            <div className="space-y-3 text-sm text-text-secondary leading-relaxed">
              <p><strong className="text-text-primary">Важность высокая + уверенность высокая:</strong> главный кандидат на внимание; проверьте первоисточник и уже произошедшую реакцию цены.</p>
              <p><strong className="text-text-primary">Важность высокая + уверенность низкая:</strong> потенциально значимо, но трактовка спорна. Это сигнал «разобраться», а не «действовать».</p>
              <p><strong className="text-text-primary">Важность низкая + уверенность высокая:</strong> модель уверенно считает событие малозначимым.</p>
              <p><strong className="text-text-primary">Обе низкие:</strong> обычно шум; такие карточки не должны определять вывод.</p>
            </div>
          </div>
          <div className="rounded-xl border border-border-subtle bg-bg-primary/60 p-5">
            <h3 className="font-bold mb-3">Стрелки влияния и фильтры</h3>
            <div className="space-y-3 text-sm text-text-secondary leading-relaxed">
              <p><span className="inline-flex items-center gap-1 text-positive font-bold">Актив <ArrowUpRight className="w-4 h-4" /></span> означает, что классификатор ожидает благоприятное направление для этого актива; <span className="inline-flex items-center gap-1 text-negative font-bold">Актив <ArrowDownRight className="w-4 h-4" /></span> — неблагоприятное. Это гипотеза о механизме, а не уже наблюдаемое движение.</p>
              <p>Одна новость может быть негативна для акций и позитивна для золота. Поэтому общая тональность и стрелки по конкретным активам могут не совпадать.</p>
              <p>Фильтры по источнику, теме и тональности только скрывают карточки из вида. Они не пересчитывают Tension и прогнозы под выбранную вами выборку.</p>
            </div>
          </div>
        </div>
      </GuideSection>

      <GuideSection id="guide-forecasts" eyebrow="Самая осторожная часть" title="Прогнозы: стрелка, процент, окно и уверенность" icon={Target}>
        <Callout variant="danger">
          <strong>Процент на карточке прогноза сейчас нельзя читать как статистическую вероятность.</strong>
          Например, 56% означает лишь, что 56% взвешенного новостного сигнала оказалось на одной стороне и 44% — на другой. Для нынешних коррелированных новостных сигналов этого недостаточно: карточка покажет «Нет сигнала». Настоящая калиброванная вероятность появится только после накопления и проверки фактических исходов.
        </Callout>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-6">
          <div className="rounded-xl border border-border-subtle bg-bg-primary/60 p-5">
            <h3 className="font-bold mb-4">Баланс сигналов: от чего считать</h3>
            <div className="relative pt-2 pb-8">
              <div className="h-4 rounded-full bg-gradient-to-r from-negative via-border-subtle to-positive" />
              <div className="absolute left-1/2 top-0 h-7 w-0.5 bg-white" />
              <div className="absolute left-1/2 top-8 -translate-x-1/2 text-xs font-bold">50% — перевеса нет</div>
              <span className="absolute left-0 top-8 text-xs text-negative font-bold">больше вниз</span>
              <span className="absolute right-0 top-8 text-xs text-positive font-bold">больше вверх</span>
            </div>
            <ul className="space-y-2 text-sm text-text-secondary leading-relaxed mt-3">
              <li><strong className="text-text-primary">50–59%</strong> — зона шума: карточка показывает «Нет сигнала» без стрелки;</li>
              <li><strong className="text-text-primary">60–69%</strong> — только слабый перекос новостного фона;</li>
              <li><strong className="text-text-primary">70–100%</strong> — выраженный новостной перекос, но всё ещё не шанс движения цены.</li>
              <li>Стрелка появляется только от 60% и показывает сторону с большим суммарным весом.</li>
            </ul>
          </div>

          <div className="rounded-xl border border-border-subtle bg-bg-primary/60 p-5">
            <h3 className="font-bold mb-4">Окно и уверенность прогноза</h3>
            <div className="space-y-3 text-sm text-text-secondary leading-relaxed">
              <p><strong className="text-text-primary">Окно 1–3 дня</strong> — горизонт, на котором новостной фон предположительно может проявляться. Это не обещание, что движение начнётся или закончится точно в эти сроки.</p>
              <p><strong className="text-negative">Низкая уверенность</strong> — мало сигналов, малый суммарный вес или перевес слабее 30% от максимально возможного баланса.</p>
              <p><strong className="text-warning">Средняя</strong> — сигналов достаточно, а нормированный баланс по модулю не ниже 0.30.</p>
              <p><strong className="text-positive">Высокая</strong> — баланс по модулю не ниже 0.60 и не менее пяти сигналов. «Высокая» относится к согласованности сигналов, а не к гарантированной точности.</p>
            </div>
          </div>
        </div>

        <div className="mt-5">
          <FormulaDetails title="Формула прогноза и числовой пример">
            <p>Каждая новость старше 72 часов не учитывается. Вес сигнала уменьшается со временем с периодом полураспада 12 часов:</p>
            <div className="rounded-lg bg-bg-card border border-border-subtle p-4 font-mono text-[13px] text-text-primary overflow-x-auto">
              вес = важность × 2^(−возраст_часов / 12) × уверенность
              <br />
              баланс = (вес_вверх − вес_вниз) ÷ общий_вес
              <br />
              процент_на_карточке = 50 + |баланс| × 50
            </div>
            <p>
              Если суммарный вес вверх равен 11.2, вниз — 8.8, общий вес равен 20. Доля вверх — 56%, баланс — +0.12.
              Карточка покажет <strong className="text-text-primary">«Нет сигнала», 56%</strong>: нормированный перевес 12% ниже порога 20% (60/40), поэтому стрелку вверх рисовать было бы нечестно.
            </p>
            <p>
              Через 12 часов вес той же новости станет вдвое меньше, через 24 часа — вчетверо. Поэтому свежие события влияют на прогноз сильнее старых.
            </p>
          </FormulaDetails>
        </div>
      </GuideSection>

      <GuideSection id="guide-data-quality" eyebrow="Свежесть данных" title="Как часто обновляется сайт и где главные ограничения" icon={RefreshCw}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
          <div className="rounded-xl bg-bg-primary/60 border border-border-subtle p-5">
            <div className="text-2xl font-extrabold mb-1">5 минут</div>
            <p className="text-sm text-text-secondary leading-relaxed">Плановый интервал обновления кэша активов на бэкенде. Открытая страница также перечитывает данные каждые 5 минут.</p>
          </div>
          <div className="rounded-xl bg-bg-primary/60 border border-border-subtle p-5">
            <div className="text-2xl font-extrabold mb-1">15 минут</div>
            <p className="text-sm text-text-secondary leading-relaxed">Плановый интервал новостей, Tension и прогнозов. Реальная свежесть зависит ещё и от времени публикации у источника.</p>
          </div>
          <div className="rounded-xl bg-bg-primary/60 border border-border-subtle p-5">
            <div className="text-2xl font-extrabold mb-1">24 / 72 часа</div>
            <p className="text-sm text-text-secondary leading-relaxed">Tension смотрит только на последние 24 часа. Прогнозы допускают новости до 72 часов, но быстро уменьшают вес старых.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="rounded-xl border border-border-subtle bg-bg-primary/60 p-5">
            <h3 className="flex items-center gap-2 font-bold mb-3"><CheckCircle2 className="w-4 h-4 text-positive" /> Когда сигналу можно доверять больше</h3>
            <ul className="space-y-2 text-sm text-text-secondary leading-relaxed">
              <li>есть ссылка на первоисточник или сильное деловое издание;</li>
              <li>новость свежая, важность и уверенность одновременно высокие;</li>
              <li>несколько независимых источников подтверждают само событие;</li>
              <li>механизм влияния на актив понятен без натяжек;</li>
              <li>цена ещё не полностью отреагировала до появления новости в ленте.</li>
            </ul>
          </div>
          <div className="rounded-xl border border-border-subtle bg-bg-primary/60 p-5">
            <h3 className="flex items-center gap-2 font-bold mb-3"><AlertTriangle className="w-4 h-4 text-warning" /> Когда нужно остановиться</h3>
            <ul className="space-y-2 text-sm text-text-secondary leading-relaxed">
              <li>важность высокая, но уверенность низкая;</li>
              <li>карточка показывает «Нет сигнала» либо слабый перекос 60–69% на малом числе сигналов;</li>
              <li>все подтверждения являются перепечатками одного сообщения;</li>
              <li>источник не открывается или заголовок сильнее текста;</li>
              <li>данные выглядят устаревшими либо цена в терминале заметно расходится с карточкой.</li>
            </ul>
          </div>
        </div>

        <div className="mt-5">
          <Callout variant="warning">
            <strong>Текущая версия — переходная.</strong> Публичная лента уже очищена от прежнего GDELT-потока, но новый конвейер с кластеризацией событий, независимыми подтверждениями, числовыми ценами и проверкой фактических исходов прогнозов ещё проходит shadow-тестирование.
            Поэтому одинаковые сюжеты пока могут встречаться несколькими карточками, а проценты прогноза нельзя считать калиброванными вероятностями.
          </Callout>
        </div>
      </GuideSection>

      <GuideSection id="guide-faq" eyebrow="Разбор недоумений" title="Частые вопросы" icon={BookOpen}>
        <div className="space-y-3">
          {[
            {
              q: 'Почему Tension низкий, хотя одна новость выглядит страшной?',
              a: 'Индекс усредняет до 20 свежих квалифицированных новостей. Одна важная негативная карточка может быть разбавлена нейтральными и позитивными. Кроме того, её вклад уменьшают важность ниже 10 и уверенность ниже 100%.',
            },
            {
              q: 'Почему позитивная новость не вычитает негатив напрямую?',
              a: 'В текущей формуле Tension позитивная новость даёт нулевой негативный вклад, но увеличивает знаменатель среднего. Она снижает индекс через разбавление, а не через отрицательный вклад.',
            },
            {
              q: 'Почему при балансе 53% написано «Нет сигнала», а не «Вниз»?',
              a: '53% взвешенного сигнала на стороне вниз и 47% вверх — почти равенство. Для коррелированных новостных статей такой перевес неотличим от шума. Стрелка появляется только от 60/40, а до порога система честно воздерживается от направленного вывода.',
            },
            {
              q: 'Почему новость в целом негативная, а Gold отмечен вверх?',
              a: 'Общая тональность описывает фон новости, а стрелки — предполагаемое влияние на конкретные активы. Рост неопределённости может быть плох для акций и одновременно поддерживать защитные активы.',
            },
            {
              q: 'Почему важность 9/10, но уверенность прогноза низкая?',
              a: 'Важность одной новости и уверенность агрегированного прогноза — разные вещи. Для высокой уверенности прогноза нужны несколько согласованных сигналов и сильный суммарный баланс.',
            },
            {
              q: 'Почему мини-график актива резко прыгает при маленьком проценте?',
              a: 'Спарклайн не имеет фиксированной оси и растягивает диапазон точек на высоту карточки. Смотрите прежде всего цену и процент, а форму линии используйте только как контекст.',
            },
            {
              q: 'Можно ли торговать только по этим цифрам?',
              a: 'Нет. Market Pulse — аналитический обзор и исследовательский прототип. Он помогает быстрее найти сюжеты и понять фон, но решение требует первоисточников, точной котировки, горизонта, размера позиции и управления риском.',
            },
          ].map((item) => (
            <details key={item.q} className="group rounded-xl border border-border-subtle bg-bg-primary/60 p-5">
              <summary className="cursor-pointer list-none flex items-center justify-between gap-4 font-bold text-text-primary">
                {item.q}
                <span className="text-accent text-xl leading-none transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-text-secondary">{item.a}</p>
            </details>
          ))}
        </div>

        <div className="mt-6 rounded-xl2 border border-positive/25 bg-positive/5 p-6">
          <h3 className="font-bold text-lg mb-3">Короткая памятка перед выводом</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-text-secondary">
            {[
              'Я посмотрел время и первоисточник, а не только заголовок.',
              'Я отличаю тональность новости от влияния на конкретный актив.',
              'Я проверил важность вместе с уверенностью.',
              'Я понимаю, что процент прогноза — баланс сигналов от базы 50%.',
              'Я сверил цену и период изменения в терминале.',
              'Я не принимаю торговое решение по одной карточке или одному индексу.',
            ].map((text) => (
              <div key={text} className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-positive shrink-0 mt-0.5" />
                <span>{text}</span>
              </div>
            ))}
          </div>
        </div>
      </GuideSection>
    </div>
  );
}
