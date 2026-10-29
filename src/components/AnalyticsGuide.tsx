import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  Clock,
  Database,
  Eye,
  Info,
  Landmark,
  LineChart,
  Newspaper,
  RefreshCw,
  Scale,
  ShieldQuestion,
  Target,
  TriangleAlert,
  Zap,
} from 'lucide-react';
import GuideLink from './GuideLink';

/**
 * Руководство по сайту. Правило, по которому оно написано: каждое
 * утверждение здесь либо видно на экране прямо сейчас (и тогда рядом стоит
 * ссылка «где смотреть»), либо его здесь нет. Руководство не описывает
 * возможностей, которых у сайта нет: обещание, которое нельзя проверить
 * нажатием, — это и есть та самая неправда, от которой мы уходим.
 *
 * Якоря (#guide-russia, #guide-assets и остальные) используются ссылками из
 * рабочих разделов — их нельзя переименовывать.
 */

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
      className="scroll-mt-24 rounded-xl2 border border-border-subtle bg-bg-card p-6 shadow-lg lg:p-8"
    >
      <div className="mb-5 flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-rose-300/25 bg-rose-400/10 text-rose-200">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="mb-1 text-xs font-bold uppercase tracking-[0.14em] text-rose-300">
            {eyebrow}
          </div>
          <h2 className="text-2xl font-extrabold tracking-tight text-text-primary sm:text-[28px]">
            {title}
          </h2>
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </motion.section>
  );
}

/** Три коротких блока одного раздела: что видно, что значит, чего не утверждаем. */
function GuideBlocks({
  see,
  means,
  limits,
}: {
  see: ReactNode;
  means: ReactNode;
  limits: ReactNode;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <div className="rounded-xl border border-cyan-300/20 bg-cyan-400/[0.06] p-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.1em] text-cyan-200">
          <Eye className="h-4 w-4" aria-hidden="true" /> Что видно
        </div>
        <div className="text-sm leading-relaxed text-text-secondary">{see}</div>
      </div>
      <div className="rounded-xl border border-emerald-300/20 bg-emerald-400/[0.06] p-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.1em] text-emerald-200">
          <Info className="h-4 w-4" aria-hidden="true" /> Что значит
        </div>
        <div className="text-sm leading-relaxed text-text-secondary">{means}</div>
      </div>
      <div className="rounded-xl border border-amber-300/20 bg-amber-400/[0.06] p-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.1em] text-amber-200">
          <TriangleAlert className="h-4 w-4" aria-hidden="true" /> Чего не утверждаем
        </div>
        <div className="text-sm leading-relaxed text-text-secondary">{limits}</div>
      </div>
    </div>
  );
}

const navItems = [
  { label: 'С чего начать', href: '#guide-start', icon: BookOpen },
  { label: 'Россия', href: '#guide-russia', icon: Landmark },
  { label: 'Tension', href: '#guide-tension', icon: Activity },
  { label: 'Активы и графики', href: '#guide-assets', icon: LineChart },
  { label: 'Бриф', href: '#guide-brief', icon: Zap },
  { label: 'Новости', href: '#guide-news', icon: Newspaper },
  { label: 'Журнал проверок', href: '#guide-forecasts', icon: Target },
  { label: 'Память рынка', href: '#guide-memory', icon: BrainCircuit },
  { label: 'Свежесть данных', href: '#guide-data-quality', icon: RefreshCw },
  { label: 'Вопросы', href: '#guide-faq', icon: ShieldQuestion },
];

export default function AnalyticsGuide() {
  return (
    <div className="space-y-6 lg:space-y-8">
      <section
        id="guide-start"
        className="scroll-mt-24 rounded-xl2 border border-border-subtle bg-bg-card p-6 shadow-lg lg:p-8"
      >
        <div className="text-xs font-extrabold uppercase tracking-[0.16em] text-rose-300">
          Руководство
        </div>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-text-primary sm:text-4xl">
          Как читать этот сайт за две минуты
        </h1>
        <p className="mt-3 max-w-3xl text-base leading-relaxed text-text-secondary">
          Сайт фиксирует то, что происходит на рынках, и показывает источник у каждого
          числа. Он не предсказывает цены и не даёт рекомендаций. Всё, что относится к
          ожиданиям модели, собрано в одном разделе — «Журнал проверок», и там же
          опубликован счёт вместе с промахами.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-cyan-300/25 bg-cyan-400/[0.07] p-4">
            <div className="text-xs font-extrabold uppercase tracking-[0.1em] text-cyan-200">
              1 · Факт
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
              Цена, время, источник. Курсы ЦБ, Мосбиржа, мировые котировки.
            </p>
          </div>
          <div className="rounded-xl border border-emerald-300/25 bg-emerald-400/[0.07] p-4">
            <div className="text-xs font-extrabold uppercase tracking-[0.1em] text-emerald-200">
              2 · Измерение
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
              Напряжённость новостного фона и изменения за день. Всегда рядом с
              объяснением, откуда число.
            </p>
          </div>
          <div className="rounded-xl border border-slate-300/25 bg-slate-400/[0.07] p-4">
            <div className="text-xs font-extrabold uppercase tracking-[0.1em] text-slate-200">
              3 · Гипотеза
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
              Ожидания модели. Самый тихий слой и всегда со счётом: сколько
              записано, сколько проверено, сколько совпало.
            </p>
          </div>
        </div>

        <nav aria-label="Разделы руководства" className="mt-6 flex flex-wrap gap-2">
          {navItems.map(({ label, href, icon: Icon }) => (
            <a
              key={href}
              href={href}
              className="inline-flex min-h-9 items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-text-secondary transition-colors hover:border-white/35 hover:text-text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-rose-300"
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {label}
            </a>
          ))}
        </nav>
      </section>

      <GuideSection
        id="guide-overview"
        eyebrow="Главное различие"
        title="Факт, измерение, гипотеза"
        icon={Scale}
      >
        <p className="max-w-3xl text-sm leading-relaxed text-text-secondary">
          Почти все ошибки чтения рынка происходят от смешивания этих трёх вещей. На
          сайте они разведены по разделам и по оформлению.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-text-secondary">
              <tr>
                <th scope="col" className="py-2 pr-3 font-bold">Слой</th>
                <th scope="col" className="py-2 pr-3 font-bold">Где на сайте</th>
                <th scope="col" className="py-2 font-bold">Что можно утверждать</th>
              </tr>
            </thead>
            <tbody className="text-text-secondary">
              <tr className="border-t border-white/10">
                <td className="py-2 pr-3 font-bold text-cyan-200">Факт</td>
                <td className="py-2 pr-3">Россия и бизнес, Мировые рынки, Новости</td>
                <td className="py-2">«Такое значение было в такое время у такого источника»</td>
              </tr>
              <tr className="border-t border-white/10">
                <td className="py-2 pr-3 font-bold text-emerald-200">Измерение</td>
                <td className="py-2 pr-3">Tension, Бриф, графики с датами</td>
                <td className="py-2">«Вот как мы это посчитали, вот формула»</td>
              </tr>
              <tr className="border-t border-white/10">
                <td className="py-2 pr-3 font-bold text-slate-300">Гипотеза</td>
                <td className="py-2 pr-3">Журнал проверок, Память рынка</td>
                <td className="py-2">«Мы ожидали так, рынок ответил так»</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="rounded-xl border border-amber-300/25 bg-amber-400/[0.07] p-4 text-sm leading-relaxed text-amber-100">
          Сайт не торговая система, не инвестиционная рекомендация и не прогнозный
          сервис. Точность ожиданий пока не доказана — это написано прямо в журнале,
          а не спрятано.
        </div>
      </GuideSection>

      <GuideSection
        id="guide-russia"
        eyebrow="01 · Синий раздел"
        title="Россия и бизнес: два разных источника, две разные задержки"
        icon={Landmark}
      >
        <GuideBlocks
          see={
            <>
              Курсы ЦБ (USD/RUB, EUR/RUB, CNY/RUB), биржевые IMOEX, RGBI и CNY/RUB с
              Мосбиржи ISS. У каждой строки — значение, изменение и время источника.
            </>
          }
          means={
            <>
              Курс ЦБ — официальный, устанавливается раз в день и не меняется до
              следующего. Биржевой курс живёт внутри дня, поэтому он и официальный
              расходятся в пределах дневного движения.
            </>
          }
          limits={
            <>
              Биржевые данные могут приходить с задержкой — время источника написано
              рядом, сверяйтесь с ним, а не с часами на своих устройствах.
            </>
          }
        />
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-relaxed text-text-secondary">
          <strong className="text-text-primary">RGBI</strong> — ценовой индекс
          государственных облигаций. Растёт индекс — цены облигаций растут, доходности
          при прочих равных падают. Падает — обычно означает рост доходностей и более
          жёсткий денежный фон. Это не ставка ЦБ и не доходность конкретной бумаги.
        </div>
        <GuideLink href="#russia-business" label="Открыть раздел «Россия и бизнес»" mobileLabel="К разделу" />
      </GuideSection>

      <GuideSection
        id="guide-tension"
        eyebrow="02 · Мировой фон"
        title="Tension: температура новостного фона, а не волатильность рынка"
        icon={Activity}
      >
        <GuideBlocks
          see={
            <>
              Одно число от 0 до 100, словесная метка, число новостей в выборке и
              история по дням.
            </>
          }
          means={
            <>
              Чем выше значение, тем больше негатива в текущем потоке новостей. Число
              считается по текстам, а не по ценам, и пересчитывается по расписанию.
            </>
          }
          limits={
            <>
              Значение — снимок на определённый момент, а не среднее за день, и это
              прямо подписано на карточке. Высокий Tension не значит «скоро упадёт»:
              связи с будущим движением цен сайт не утверждает.
            </>
          }
        />
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-relaxed text-text-secondary">
          Если точек истории мало, шкала показывает ровно столько, сколько есть, и не
          дорисовывает недостающие дни. Значение и его дата указаны у каждой точки.
        </div>
      </GuideSection>

      <GuideSection
        id="guide-assets"
        eyebrow="02 · Мировые рынки"
        title="Тепловая карта: цвет — это шкала, а не оценка"
        icon={LineChart}
      >
        <GuideBlocks
          see={
            <>
              Пять плиток: USD/EUR, S&P 500, Brent, золото, биткоин. На плитке цена,
              время, на которое она получена, изменение за выбранный горизонт и мини-линия
              последних значений.
            </>
          }
          means={
            <>
              Насыщенность цвета нормирована, и шкала написана на самой плитке. Она
              разная у каждого актива: ±0,8 % у USD/EUR, ±2 % у S&P 500, ±2,5 % у золота,
              ±4 % у Brent, ±6 % у биткоина. Это не оценка важности, а разный размер
              обычного дневного движения. При переключении на неделю или месяц шкала
              расширяется пропорционально корню из числа наблюдений.
            </>
          }
          limits={
            <>
              Мини-линия не имеет оси цены и времени: она показывает форму, а не
              масштаб. Площадь плитки одинакова у всех и ничего не кодирует.
            </>
          }
        />
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-relaxed text-text-secondary">
          <strong className="text-text-primary">Нажмите на плитку</strong> — откроется
          панель: датированный график за 30, 90 или 180 дней, изменение периода,
          минимум и максимум с датами, источник и блок «Проверить данные» — те самые
          точки, из которых построена линия, с датой и закрытием, чтобы сверить с
          первоисточником.
        </div>
        <div className="rounded-xl border border-cyan-300/25 bg-cyan-400/[0.07] p-4 text-sm leading-relaxed text-cyan-100">
          Сегодняшний незакрытый день на график не попадает: он ещё меняется, а
          закрытый — нет. Где это сработало, под графиком есть отдельная пометка.
        </div>
        <GuideLink href="#global-economy" label="Открыть мировые рынки" mobileLabel="К рынкам" />
      </GuideSection>

      <GuideSection
        id="guide-brief"
        eyebrow="03 · Фиолетовый раздел"
        title="Бриф: короткая сводка, собранная из блоков ниже"
        icon={Zap}
      >
        <GuideBlocks
          see={
            <>
              Что изменилось с утра, что происходит со шкалой напряжённости и какие
              события главные. У каждого пункта есть ссылка в раздел, откуда он взят.
            </>
          }
          means={
            <>
              Бриф собирается по фиксированным порогам, без свободного текста модели:
              Brent от 1 %, среднее движение валютной корзины выше 0,15 %, RGBI от
              0,1 %. Сработал порог — пункт появился, не сработал — не появился.
            </>
          }
          limits={
            <>
              Это не редакционный комментарий и не объяснение причин: бриф только
              перечисляет то, что уже видно в блоках ниже.
            </>
          }
        />
        <GuideLink href="#dashboard" label="К брифу на главной" mobileLabel="К брифу" />
      </GuideSection>

      <GuideSection
        id="guide-news"
        eyebrow="04 · Янтарный раздел"
        title="Новости: сначала четыре свежие, потом вся лента"
        icon={Newspaper}
      >
        <GuideBlocks
          see={
            <>
              Время публикации источника, тональность, важность, уверенность и стрелки
              предполагаемого влияния на активы.
            </>
          }
          means={
            <>
              Похожие пересказы одного события схлопываются в одну карточку со счётчиком
              копий и списком источников — чтобы десять перепечаток не выглядели как
              десять событий.
            </>
          }
          limits={
            <>
              Стрелки влияния — гипотеза классификатора, а не факт. Уверенность бывает
              низкой, и тогда так и написано. Тональность — оценка текста, не движение
              цены.
            </>
          }
        />
        <GuideLink href="#news" label="Открыть новости" mobileLabel="К новостям" />
      </GuideSection>

      <GuideSection
        id="guide-forecasts"
        eyebrow="05 · Изумрудный раздел"
        title="Журнал проверок: ожидание записано до факта"
        icon={Target}
      >
        <GuideBlocks
          see={
            <>
              Карточки по пяти активам и счёт: записей в журнале, проверено рынком,
              попаданий, точность по Брайеру.
            </>
          }
          means={
            <>
              Для каждого актива и дня пишется три горизонта — 1, 3 и 10 торговых дней,
              поэтому записей втрое больше, чем карточек: на карточках показан дневной.
              Брайер 0,25 — уровень подбрасывания монеты, меньше — лучше.
            </>
          }
          limits={
            <>
              Пока проверенных записей меньше 30, вывод о точности не делается, а
              направление скрыто: сайт не выдаёт стрелку за преимущество, которого не
              доказал. Промахи из журнала не удаляются.
            </>
          }
        />
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-relaxed text-text-secondary">
          «Нет сигнала» — это тоже результат: свидетельства не перевесили порог 60/40.
          Такая запись не оценивается как попадание или промах, потому что направления в
          ней не было.
        </div>
        <GuideLink href="#forecasts" label="Открыть журнал проверок" mobileLabel="К журналу" />
      </GuideSection>

      <GuideSection
        id="guide-memory"
        eyebrow="06 · Раздел цвета фуксии"
        title="Память рынка: прошлые события и их исходы"
        icon={BrainCircuit}
      >
        <GuideBlocks
          see={
            <>
              События из архива: заголовок, канал передачи, затронутые активы, сколько
              статей и источников за ним стоит, и что стало с ценой после.
            </>
          }
          means={
            <>
              Это способ посмотреть на прошлое теми же глазами, что и на настоящее:
              событие → предполагаемый канал → фактическое движение.
            </>
          }
          limits={
            <>
              Совпадение по времени не доказывает причину: на актив одновременно
              действуют другие факторы, и сайт этого не скрывает.
            </>
          }
        />
        <GuideLink href="#market-memory" label="Открыть память рынка" mobileLabel="К памяти" />
      </GuideSection>

      <GuideSection
        id="guide-data-quality"
        eyebrow="Свежесть и честность"
        title="Почему у разных чисел разная дата"
        icon={RefreshCw}
      >
        <div className="space-y-3 text-sm leading-relaxed text-text-secondary">
          <p>
            Источники обновляются с разной скоростью: официальный курс — раз в день,
            биржа — в течение сессии, криптовалюта — круглосуточно. Поэтому у каждого
            числа указано своё время, и «свежее» у них означает разное.
          </p>
          <p>
            Если свежая цена не получена, вместо числа стоит прочерк и пометка «нет
            свежей цены». Подставлять сохранённое или выдуманное значение сайт не
            будет: цифра на экране выглядит как котировка, даже когда рядом написано
            предупреждение.
          </p>
          <p>
            Время на сайте показывается по Москве и подписано. Данные из внешних
            источников приходят в UTC и переводятся, а не выдаются за московские.
          </p>
          <p>
            <strong className="text-text-primary">Паспорт дня</strong> — запись,
            которая делается один раз в день (по расписанию — утром) и больше не
            переписывается: повторная запись того же дня отклоняется базой. Поэтому через неделю видно ровно то, что
            сайт показывал тогда. Архив начинается с того дня, когда снимки начали
            сохраняться, и пропущенные дни не дорисовываются.
          </p>
        </div>
        <GuideLink href="#status" label="Открыть состояние системы" mobileLabel="К статусу" />
      </GuideSection>

      <GuideSection
        id="guide-faq"
        eyebrow="Разбор недоумений"
        title="Вопросы, которые возникают почти у всех"
        icon={ShieldQuestion}
      >
        <div className="space-y-3">
          {[
            {
              q: 'Сайт предсказывает цены?',
              a: 'Нет. Он фиксирует факты и ведёт журнал ожиданий, где видно и попадания, и промахи. Пока точность не доказана, направленные выводы скрыты.',
            },
            {
              q: 'Почему у некоторых плиток прочерк вместо цены?',
              a: 'Потому что свежая цена не получена. Показать вместо неё сохранённое или выдуманное число значило бы соврать о текущей котировке.',
            },
            {
              q: 'Почему график заканчивается вчерашним днём?',
              a: 'Сегодняшний день ещё не закрыт. Его точка меняется до конца суток, поэтому на датированный график она не попадает — иначе закрытый и незакрытый день сравнивались бы как одно и то же.',
            },
            {
              q: 'Число на плитке не совпадает с графиком. Это ошибка?',
              a: 'Плитка показывает текущую цену, график — закрытия завершённых дней. Если расхождение больше обычного, раскройте «Проверить данные» и сверьте точки с первоисточником.',
            },
            {
              q: 'Можно ли по Tension понять, куда пойдёт рынок?',
              a: 'Нет. Tension измеряет негативный фон в новостях и ничего не обещает про будущее движение цен.',
            },
            {
              q: 'Счёт прогнозов плохой. Зачем его показывать?',
              a: 'Именно поэтому и показываем. Сайт, который демонстрирует только удачные случаи, невозможно проверить — а непроверяемому не стоит верить.',
            },
            {
              q: 'Это инвестиционная рекомендация?',
              a: 'Нет. Ни один блок не говорит, что покупать или продавать.',
            },
          ].map(({ q, a }) => (
            <details
              key={q}
              className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
            >
              <summary className="cursor-pointer text-sm font-extrabold text-text-primary">
                {q}
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">{a}</p>
            </details>
          ))}
        </div>
      </GuideSection>

      <section className="rounded-xl2 border border-emerald-300/25 bg-emerald-400/[0.06] p-6 lg:p-8">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" aria-hidden="true" />
          <div>
            <h2 className="text-lg font-extrabold text-text-primary">
              Короткая памятка перед выводом
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-secondary">
              Сначала посмотрите на время и источник числа — это факт. Потом на то, как
              оно посчитано — это измерение. И только потом на ожидания модели, помня,
              что её счёт опубликован вместе с промахами. Если чего-то не хватает,
              сайт должен сказать об этом прямо, а не заполнить пробел догадкой.
            </p>
            <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-text-secondary">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" /> Время — по Москве
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Database className="h-3.5 w-3.5" aria-hidden="true" /> Источник указан у
                каждого числа
              </span>
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
