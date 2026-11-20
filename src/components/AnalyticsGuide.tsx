import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import {
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
  icon: LucideIcon;
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
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-rose-300/25 bg-rose-400/10 text-rose-800">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="mb-1 text-xs font-bold uppercase tracking-[0.14em] text-rose-800">
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
        <div className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.1em] text-cyan-800">
          <Eye className="h-4 w-4" aria-hidden="true" /> Что видно
        </div>
        <div className="text-sm leading-relaxed text-text-secondary">{see}</div>
      </div>
      <div className="rounded-xl border border-emerald-300/20 bg-emerald-400/[0.06] p-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.1em] text-emerald-800">
          <Info className="h-4 w-4" aria-hidden="true" /> Что значит
        </div>
        <div className="text-sm leading-relaxed text-text-secondary">{means}</div>
      </div>
      <div className="rounded-xl border border-amber-300/20 bg-amber-400/[0.06] p-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.1em] text-amber-900">
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
  { label: 'Активы и графики', href: '#guide-assets', icon: LineChart },
  { label: 'Бриф', href: '#guide-brief', icon: Zap },
  { label: 'Новости', href: '#guide-news', icon: Newspaper },
  { label: 'Что меняется', href: '#guide-changes', icon: Target },
  { label: 'Память рынка', href: '#guide-memory', icon: BrainCircuit },
  { label: 'Свежесть данных', href: '#guide-data-quality', icon: RefreshCw },
  { label: 'Вопросы', href: '#guide-faq', icon: ShieldQuestion },
];

export default function AnalyticsGuide() {
  return (
    // id="guide" — адрес экрана гида: по нему ведут ссылки «Гид» из шапки,
    // подвала и карточки-тизера. Без самого элемента такой переход работает
    // только через hashchange-роутер, а как якорь ведёт в никуда.
    <div id="guide" className="scroll-mt-24 space-y-6 lg:space-y-8">
      <section
        id="guide-start"
        aria-labelledby="guide-start-title"
        className="scroll-mt-24 rounded-xl2 border border-border-subtle bg-bg-card p-6 shadow-lg lg:p-8"
      >
        <div className="text-xs font-extrabold uppercase tracking-[0.16em] text-rose-800">
          Руководство
        </div>
        <h2 id="guide-start-title" className="mt-2 text-3xl font-extrabold tracking-tight text-text-primary sm:text-4xl">
          Как читать этот сайт за две минуты
        </h2>
        <p className="mt-3 max-w-3xl text-base leading-relaxed text-text-secondary">
          Сайт фиксирует то, что происходит на рынках, и показывает источник у каждого
          числа. Он не предсказывает цены и не даёт рекомендаций. Прогнозов здесь больше
          нет: их выдачу остановили 31 октября 2026 года, когда выяснилось, что точность
          хуже случайной. Вместо них — раздел «Что меняется»: факты о движении рядов,
          которые можно проверить по графику.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-cyan-300/25 bg-cyan-400/[0.07] p-4">
            <div className="text-xs font-extrabold uppercase tracking-[0.1em] text-cyan-800">
              1 · Факт
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
              Цена, время, источник. Курсы ЦБ, Мосбиржа, мировые котировки.
            </p>
          </div>
          <div className="rounded-xl border border-emerald-300/25 bg-emerald-400/[0.07] p-4">
            <div className="text-xs font-extrabold uppercase tracking-[0.1em] text-emerald-800">
              2 · Измерение
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
              Арифметические изменения в опубликованных рядах. Рядом показаны точки
              сравнения и способ расчёта.
            </p>
          </div>
          <div className="rounded-xl border border-slate-300/25 bg-slate-400/[0.07] p-4">
            <div className="text-xs font-extrabold uppercase tracking-[0.1em] text-slate-700">
              3 · Архив
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
              Архив прежних прогнозов и рассчитанных исходов. Это исторические записи,
              а не текущие рекомендации или подтверждённые причины движения цены.
            </p>
          </div>
        </div>

        <nav aria-label="Разделы руководства" className="mt-6 flex flex-wrap gap-2">
          {navItems.map(({ label, href, icon: Icon }) => (
            <a
              key={href}
              href={href}
              className="inline-flex min-h-9 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-text-secondary transition-colors hover:border-slate-200 hover:text-text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-rose-300"
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
        title="Факт, расчёт, архив"
        icon={Scale}
      >
        <p className="max-w-3xl text-sm leading-relaxed text-text-secondary">
          Рыночные значения показываются отдельно от вычислений и от старых прогнозных
          записей. Совпадение по времени не выдаётся за объяснение причины.
        </p>
        <div
          className="overflow-x-auto focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-200"
          tabIndex={0}
          role="group"
          aria-label="Таблица «факт, измерение, гипотеза»: прокручивается по горизонтали стрелками."
        >
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-text-secondary">
              <tr>
                <th scope="col" className="py-2 pr-3 font-bold">Слой</th>
                <th scope="col" className="py-2 pr-3 font-bold">Где на сайте</th>
                <th scope="col" className="py-2 font-bold">Что можно утверждать</th>
              </tr>
            </thead>
            <tbody className="text-text-secondary">
              <tr className="border-t border-slate-200">
                <td className="py-2 pr-3 font-bold text-cyan-800">Факт</td>
                <td className="py-2 pr-3">Россия и бизнес, Мировые рынки, Новости</td>
                <td className="py-2">«Такое значение было в такое время у такого источника»</td>
              </tr>
              <tr className="border-t border-slate-200">
                <td className="py-2 pr-3 font-bold text-emerald-800">Измерение</td>
                <td className="py-2 pr-3">Что меняется, бриф, графики с датами</td>
                <td className="py-2">«Вот как мы это посчитали, вот формула»</td>
              </tr>
              <tr className="border-t border-slate-200">
                <td className="py-2 pr-3 font-bold text-text-secondary">Архив</td>
                <td className="py-2 pr-3">Память рынка (исторические записи)</td>
                <td className="py-2">«Запись прогноза и рассчитанное изменение цены»</td>
              </tr>
            </tbody>
          </table>
        </div>
      </GuideSection>

      <GuideSection
        id="guide-russia"
        eyebrow="01 · Синий раздел"
        title="Россия: первичные рыночные значения и заголовки"
        icon={Landmark}
      >
        <GuideBlocks
          see={
            <>
              Официальные курсы Банка России, биржевые показатели Мосбиржи, ставка ЦБ,
              RUONIA, кривая ОФЗ и международные резервы. У каждой плитки показаны
              источник, единица измерения и дата или время значения. Ниже — заголовки
              российских деловых лент с издателем, временем публикации и ссылкой.
            </>
          }
          means={
            <>
              Изменения рядом с показателями — арифметические сравнения опубликованных
              значений. База и единица подписаны; разности ставок выражаются в процентных
              пунктах. «Деньги бизнеса» показывает формулы, которые можно пересчитать
              из стоящих рядом исходных чисел.
            </>
          }
          limits={
            <>
              Заголовки не ранжируются по модельной важности, тональности или предполагаемому
              влиянию. Сайт не выводит из публикации, кто или что изменит курс, и не считает
              совпадение по времени доказательством причины. Курс ЦБ и биржевая цена — разные
              значения с разным расписанием.
            </>
          }
        />
        <GuideLink href="/russia" label="Открыть раздел «Россия и бизнес»" mobileLabel="К разделу" />
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
              Мини-линия не имеет ни оси цены, ни оси времени: точки в ней стоят на
              равном расстоянии независимо от дат, поэтому пропуски в наблюдениях на ней
              не видны и сравнивать наклон между активами нельзя. Площадь плитки одинакова
              у всех и ничего не кодирует.
            </>
          }
        />
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-text-secondary">
          <strong className="text-text-primary">Что именно нарисовано на графике.</strong>{' '}
          Ось X линейна по календарным датам источника и подписана четырьмя датами.
          На графике только <strong className="text-text-primary">дневные закрытия</strong>:
          внутридневных максимумов и минимумов там нет, объёма нет, это не торговый
          график. Ось Y без делений: подписаны только максимум и минимум периода, а точное
          значение точки показывается при наведении или касании. Цвет линии означает знак
          изменения за период, а не силу движения.
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-text-secondary">
          <strong className="text-text-primary">Нажмите на плитку</strong> — откроется
          панель: график за 30, 90 или 180 календарных дней, изменение периода, минимум и
          максимум с датами, источник и блок «Проверить данные». В нём — те самые точки, из
          которых построена линия: дата, закрытие, изменение к предыдущему закрытию, имя
          ряда и провайдер. Показаны последние 30 записей выбранного периода; если их
          больше, под таблицей сказано, сколько всего.
        </div>
        <div className="rounded-xl border border-cyan-300/25 bg-cyan-400/[0.07] p-4 text-sm leading-relaxed text-cyan-800">
          Сегодняшний незакрытый день на график не попадает: он ещё меняется, а закрытый —
          нет. Где это сработало, под графиком есть отдельная пометка с датой последнего
          закрытия. Если датированной истории по активу нет, вместо неё показывается
          график по последним сохранённым наблюдениям без оси дат, и это подписано.
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-text-secondary">
          Горизонты плитки — это <strong className="text-text-primary">наблюдения, а не
          календарные дни</strong>: неделя — пять переходов, месяц — до 29.
          День — цена к предыдущему закрытию (процент источника либо расчёт приложения),
          не разность двух точек графика. Для недели и месяца берётся разница
          между последним и N-м сохранённым значением. Поэтому «неделя» на карте и неделя
          в календаре могут расходиться.
        </div>
        <GuideLink href="/world" label="Открыть мировые рынки" mobileLabel="К рынкам" />
      </GuideSection>

      <GuideSection
        id="guide-brief"
        eyebrow="03 · Фиолетовый раздел"
        title="Бриф: значения и сравнение со снимком"
        icon={Zap}
      >
        <GuideBlocks
          see={
            <>
              Какие рыночные значения отличаются от сохранённого снимка. Для каждого
              сравнения указана точка отсчёта; связанные графики открываются по ссылке.
            </>
          }
          means={
            <>
              В мировом контуре бриф выбирает наибольшее по модулю изменение двух последних датированных закрытий, как и главная. В российском — доступное изменение выбранных индикаторов. Периоды рядов могут различаться. Сравнения со снимком показывают ненулевые изменения
              с точностью 0,01 % для цен и курсов, 0,01 п.п. для ставок и доходностей.
              В каждой группе — до шести строк, отсортированных по модулю; разные единицы
              между собой не ранжируются. У каждой точки сравнения подписана дата,
              а если дата точки старого снимка не сохранена — это сказано явно.
            </>
          }
          limits={
            <>
              Это не редакционный комментарий и не объяснение причин: бриф только
              показывает доступные значения и арифметику, не объясняя причины движения.
            </>
          }
        />
        <GuideLink href="/brief" label="Открыть отдельную страницу брифа" mobileLabel="К брифу" />
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
              Заголовок публикации, источник, время публикации и ссылку на материал.
            </>
          }
          means={
            <>
              Публикации выводятся как заголовки источников; лента не присваивает им
              оценки значимости, тональности или влияния на цены.
            </>
          }
          limits={
            <>
              Заголовок — текст публикации, а не подтверждение отдельного рыночного
              события или причины изменения цены. Сверяйте содержание по ссылке на источник.
            </>
          }
        />
        <GuideLink href="/news" label="Открыть новости" mobileLabel="К новостям" />
      </GuideSection>

      <GuideSection
        id="guide-changes"
        eyebrow="05 · Движение вместо прогноза"
        title="Что меняется: наблюдения по прошедшим дням"
        icon={Target}
      >
        <GuideBlocks
          see={
            <>
              Карточки по индикаторам: «растёт 3-й день подряд», «максимум с 01.10»,
              «узкий диапазон: 0,49 %» — с числами и датами. Ниже — сравнение двух периодов:
              последние семь переходов между точками и семь предыдущих. Это не обязательно
              календарные недели; для двух окон нужны 15 наблюдений.
            </>
          }
          means={
            <>
              Серия считается по закрытиям торговых дней; день без движения серию обрывает,
              поэтому «0,00 %» никогда не называется ростом. Максимум и минимум — это
              положение последнего значения относительно всего окна в три месяца, а не
              предсказание. Узкий диапазон — размах последних пяти значений меньше 0,6 %
              от их среднего. В сравнении изменение последних семи переходов сопоставляется
              с предыдущими семью; «Разница окон» — вычитание предыдущего изменения из
              последнего в процентных пунктах. «Где в окне» — доля значений доступной истории,
              которые строго ниже последнего.
            </>
          }
          limits={
            <>
              У котировок дата — день закрытия или наблюдения, который сохранил источник; в
              сравнении показываются крайние даты каждого периода, если они доступны. Для
              российских рядов это торговые наблюдения, не календарные недели. Пропуски не
              достраиваются. Если даты не сохранены, строка говорит об этом, а не приписывает
              значениям чужой календарь.
            </>
          }
        />
        <GuideLink
          href="/memory"
          label="Архив прежних прогнозов с промахами"
          mobileLabel="К архиву"
        />
      </GuideSection>

      <GuideSection
        id="guide-memory"
        eyebrow="06 · Раздел цвета фуксии"
        title="Память рынка: архив прогнозных записей"
        icon={BrainCircuit}
      >
        <GuideBlocks
          see={
            <>
              Сохранённые ранее прогнозные записи и посчитанные для них результаты. Новые
              прогнозы не выпускаются; исходные записи архива не переписываются.
            </>
          }
          means={
            <>
              Архивный прогноз — зафиксированное ожидание; результат описывает только
              изменение цены на выбранном горизонте, рассчитанное по сохранённым значениям.
            </>
          }
          limits={
            <>
              Архивная запись и последующее движение не доказывают причинную связь.
              Похожие заголовки не объединяются здесь в подтверждённое событие.
            </>
          }
        />
        <GuideLink href="/memory" label="Открыть память рынка" mobileLabel="К памяти" />
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
            У мировой плитки два разных времени, и они не одно и то же: когда цена верна
            («за 29 окт.» — дата закрытия, которую назвал источник) и когда её записал наш
            кэш («обновлено 12:55 МСК»). Если источник дату наблюдения не назвал, стоит
            только время записи — плитка не приписывает цене дату, которой у неё нет.
          </p>
          <p>
            У части рядов расписание, а не задержка: RUONIA ЦБ публикует на следующий день,
            международные резервы — раз в неделю (отчётная пятница, публикация на следующей
            неделе), ключевая ставка меняется только решением регулятора и месяцами стоит на
            месте. Поэтому отсутствующая плитка — не всегда поломка; на странице состояния
            рядом с каждой проверкой подписано, как часто её данные обязаны обновляться.
          </p>
          <p>
            <strong className="text-text-primary">Паспорт дня</strong> — запись,
            которая делается один раз в день (по расписанию — утром) и больше не
            переписывается: повторная запись того же дня отклоняется базой. Поэтому через неделю видно ровно то, что
            сайт показывал тогда. Архив начинается с того дня, когда снимки начали
            сохраняться, и пропущенные дни не дорисовываются.
          </p>
        </div>
        <GuideLink href="/status" label="Открыть состояние системы" mobileLabel="К статусу" />
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
              a: 'Нет. Он фиксирует факты и показывает, что уже произошло в рядах. Прогнозы не выдаются с 31 октября 2026 года: на 26 оценённых исходах точность оказалась хуже случайной, поэтому обещаний на будущее на сайте нет.',
            },
            {
              q: 'Почему у некоторых плиток прочерк вместо цены?',
              a: 'Потому что свежая цена не получена. Показать вместо неё сохранённое или выдуманное число значило бы соврать о текущей котировке.',
            },
            {
              q: 'Почему график актива заканчивается вчерашним днём?',
              a: 'Потому что сегодняшний день ещё не закрыт: на графике только дневные закрытия, а незакрытый день сравнивать с закрытым нельзя. Дата последнего закрытия подписана под графиком.',
            },
            {
              q: 'Меняются ли прошлые точки на графике?',
              a: 'Нет. Завершённый день не пересчитывается: новая запись делается только на текущую дату. Меняется одна точка — сегодняшняя.',
            },
            {
              q: 'Число на плитке не совпадает с графиком. Это ошибка?',
              a: 'Плитка показывает текущую цену, график — закрытия завершённых дней. Если расхождение больше обычного, раскройте «Проверить данные» и сверьте точки с первоисточником.',
            },
            {
              q: 'Почему пропали прогнозы?',
              a: 'Потому что они не проходили проверку: на 26 оценённых исходах доля попаданий была 46 %, а счёт Брайера 0,40 — хуже, чем у подбрасывания монетки (0,25). Выдачу новых прогнозов остановили 31 октября 2026 года, а старые записи вместе с промахами остались в архиве «Памяти рынка»: переписать задним числом их нельзя.',
            },
            {
              q: 'Что теперь вместо прогнозов?',
              a: 'Раздел «Что меняется»: сколько дней подряд ряд движется в одну сторону, где последнее значение относительно всего окна, насколько узок диапазон последних дней. Это утверждения о прошедших данных, которые можно проверить по графику рядом.',
            },
            {
              q: 'Это инвестиционная рекомендация?',
              a: 'Нет. Ни один блок не говорит, что покупать или продавать.',
            },
          ].map(({ q, a }) => (
            <details
              key={q}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
            >
              <summary className="min-h-6 cursor-pointer py-1 text-sm font-extrabold text-text-primary">
                {q}
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">{a}</p>
            </details>
          ))}
        </div>
      </GuideSection>

      <section className="rounded-xl2 border border-emerald-300/25 bg-emerald-400/[0.06] p-6 lg:p-8">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-800" aria-hidden="true" />
          <div>
            <h2 className="text-lg font-extrabold text-text-primary">
              Короткая памятка перед выводом
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-secondary">
              Сначала посмотрите на время и источник числа — это факт. Потом на то, как
              оно посчитано — это измерение. И только потом на наблюдения о движении,
              помня, что это описание прошедших дней, а не обещание будущих. Если
              чего-то не хватает, сайт должен сказать об этом прямо, а не заполнить
              пробел догадкой.
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
