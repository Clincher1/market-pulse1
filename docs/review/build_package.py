"""Сборка пакета для независимой проверки: DOCX + PDF + JSON-снимок.

Запуск:  python3 docs/review/build_package.py
Требует: python-docx, reportlab (ставятся через pip), шрифты DejaVu.

Один источник содержания — package_content.py. Числа в документе и в
машиночитаемом снимке берутся из одних и тех же таблиц, чтобы не появилось
двух написаний одного числа.
"""

import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from package_content import (  # noqa: E402
    SNAPSHOT, MONEY, PASSPORT, PASSPORT_ARCHIVE, WHAT_CHANGED, WEEK_TABLE,
    RUSSIA, OFZ_CURVE, DERIVED, TENSION_HISTORY, TENSION_FLOW, GLOBAL_TILES,
    BRIEF_FACTS, BRIEF_RUSSIA, BRIEF_SINCE_MORNING, NEWS_FLOW_DB, NEWS_SAMPLE,
    MEMORY, INSTRUMENTS, RU_SOURCES, CHECKS, CHECKS_7D, DEAD_CHECKS, ISSUES,
    CHECKLIST, FEEDS, TABLES, GLOSSARY,
)

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
BASE = "Market-Pulse-proverka-2026-11-01"

TITLE = "Market Pulse — пакет для независимой проверки"
SUBTITLE = "Данные сайта, их источники и способ проверить всё это без браузера"
STAMP = f"Снимок: {SNAPSHOT['page_read_msk']} · база: 01.11.2026, 16:04 UTC · коммит {SNAPSHOT['commit']}"


# ─────────────────────────────────────────────────────────────── содержание ──

def blocks():
    B = []
    B.append(("title", TITLE, SUBTITLE, STAMP))

    B.append(("p", "Документ подготовлен для проверки сайта человеком, у которого нет возможности "
                   "открывать ссылки и просматривать страницы. Всё, что обычно смотрят глазами, здесь "
                   "приведено числами и таблицами: что видит посетитель, откуда взято каждое число, "
                   "как оно посчитано и как его перепроверить. Ссылки указаны как реквизиты источников, "
                   "открывать их не требуется."))

    B.append(("table", [
        ["Реквизит", "Значение"],
        ["Адрес сайта", SNAPSHOT["site"]],
        ["Репозиторий", SNAPSHOT["repo"]],
        ["База данных", f"Supabase, проект {SNAPSHOT['supabase_project']} (PostgreSQL)"],
        ["Версия кода", f"коммит {SNAPSHOT['commit']} в ветке main"],
        ["Время снимка", f"страница — {SNAPSHOT['page_read_msk']}; таблицы — 01.11.2026, 16:04 UTC"],
        ["Последняя самопроверка", SNAPSHOT["selfcheck_last_utc"] + " — 19 проверок из 19 пройдены"],
    ]))

    # 1
    B.append(("h2", "1. Что за система проверяется"))
    B.append(("p", "Market Pulse — статический сайт, который показывает факты о рынках: официальные курсы "
                   "Банка России, значения Московской биржи, мировые котировки, поток деловых новостей и "
                   "производные от них числа. Сайт не строит прогнозов и не даёт рекомендаций; выдача "
                   "прогнозов остановлена 31 октября 2026 года, архив остался в базе, но не показывается."))
    B.append(("table", [
        ["Компонент", "Что делает", "Где"],
        ["Статический интерфейс", "React-сборка; читает данные напрямую из базы по публичному ключу",
         "Vercel, market-pulse1-eta.vercel.app"],
        ["Серверные функции", "Три эндпоинта: российские индикаторы и заголовки, история за 3 месяца, PNG-карточка",
         "Vercel /api/russia-insights, /api/russia-history, /api/brief-image"],
        ["База данных", "Кэш значений, снимки дня, история шкалы, журнал самопроверок, архив событий",
         "Supabase, PostgreSQL"],
        ["Сборщики", "Читают источники и пишут в базу: курсы и котировки — раз в 5 минут, новости — раз в 15 минут, "
                     "индекс напряжённости — раз в 15 минут, самопроверка — раз в час",
         "Supabase edge functions + pg_cron (11 задач)"],
        ["Мониторинг ошибок", "Sentry: только серверные отчёты, в браузере счётчиков нет",
         "Sentry org non-oun"],
    ]))
    B.append(("p", "Три вещи, которые система сознательно не делает: не ставит cookies и не собирает статистику "
                   "посещений; не хранит пользовательских данных (выбор профиля лежит только в браузере "
                   "посетителя); не считает вероятностей и не показывает «сигналов» на будущее."))

    # 2
    B.append(("h2", "2. Что видит посетитель: снимок страницы"))
    B.append(("p", "Ниже — содержимое главной страницы на момент снимка. Это не пересказ: значения, даты и "
                   "подписи взяты с самой страницы, поэтому их можно сверить с базой построчно (§5)."))

    B.append(("h3", "2.1. Деньги бизнеса — четыре ориентира"))
    B.append(("table", MONEY))

    B.append(("h3", "2.2. Паспорт дня"))
    B.append(("p", "Запись за 1 ноября 2026 г. создана в 07:00 МСК и больше не перезаписывается: повторный "
                   "запуск её не меняет. Поэтому в архив нельзя задним числом подтянуть более удачные цифры."))
    B.append(("table", PASSPORT))
    B.append(("p", "Архив снимков (все шесть записей в базе):"))
    B.append(("table", PASSPORT_ARCHIVE))
    B.append(("p", "Одно и то же движение (Brent −3,92 %) стоит несколько дней подряд не потому, что его "
                   "пересчитали, а потому что у источника не появилось нового наблюдения: дата цены — 27.10."))

    B.append(("h3", "2.3. Что меняется — только уже случившееся"))
    B.append(("table", WHAT_CHANGED))

    B.append(("h3", "2.4. Неделя к неделе"))
    B.append(("table", WEEK_TABLE))
    B.append(("p", "«Последние 7» — семь последних наблюдений, у каждого своя дата: торговые дни у российских "
                   "рядов, дни закрытия у мировых котировок. У ставок и доходностей изменения подписаны в "
                   "процентных пунктах: процент от процента сайт не считает."))

    B.append(("h3", "2.5. Российский контур"))
    B.append(("table", RUSSIA))
    B.append(("p", "Кривая доходности ОФЗ, 11 точек от 3 месяцев до 20 лет (Мосбиржа ISS, время источника "
                   "30.10.2026 18:54:59 МСК):"))
    B.append(("table", OFZ_CURVE))
    B.append(("p", "Три производные величины показаны на сайте как арифметика, а не как вывод:"))
    B.append(("table", DERIVED))

    B.append(("h3", "2.6. Шкала напряжённости"))
    B.append(("p", "Текущее значение 15 из 100, подпись «Холодно». Выборка — 120 новостей за сутки; "
                   "история шкалы — 12 дней, поэтому сравнивать недели между собой пока нельзя (для этого "
                   "нужен хотя бы месяц наблюдений). Состав потока за сутки:"))

    B.append(("table", TENSION_FLOW))
    B.append(("p", "История шкалы по дням (завершённый день больше не меняется, сегодняшняя точка "
                   "пересчитывается при каждом запуске):"))
    B.append(("table", TENSION_HISTORY))

    B.append(("h3", "2.7. Мировые котировки"))
    B.append(("table", GLOBAL_TILES))
    B.append(("p", "Площадь плиток одинакова: это не капитализация и не объём торгов. Сравнивать нужно по "
                   "напечатанному проценту, а не по насыщенности цвета."))

    B.append(("h3", "2.8. Бриф за 60 секунд"))
    B.append(("p", "Собирается автоматически из блоков выше, каждое утверждение со ссылкой на раздел."))
    B.append(("bullets", BRIEF_FACTS))
    B.append(("p", "Что это значит для России (два факта рядом, не причинная связь):"))
    B.append(("bullets", BRIEF_RUSSIA))
    B.append(("p", "Что изменилось с утра (точка отсчёта — 01.11.2026, 07:00 МСК):"))
    B.append(("bullets", BRIEF_SINCE_MORNING))

    B.append(("h3", "2.9. Новости"))
    B.append(("p", "Лента читается из 20 включённых источников (полный список — приложение A). За сутки в "
                   "базе оказалось столько материалов:"))
    B.append(("table", NEWS_FLOW_DB))
    B.append(("p", "Примеры последних строк — чтобы можно было сверить заголовок, время и оценки:"))
    B.append(("table", NEWS_SAMPLE))

    B.append(("h3", "2.10. Память рынка (исследовательский раздел)"))
    B.append(("table", MEMORY))

    # 3
    B.append(("h2", "3. Откуда взято каждое число"))
    B.append(("p", "У каждой плитки и ряда есть запись в реестре инструментов базы: провайдер, символ, тип "
                   "инструмента, единица измерения и признак «включён». Именно эта запись попадает в подпись "
                   "на сайте, поэтому подпись и источник не могут разойтись незаметно."))
    B.append(("table", INSTRUMENTS))
    B.append(("p", "Российские ряды идут не из кэша базы, а собираются серверной функцией в момент запроса:"))
    B.append(("table", RU_SOURCES))
    B.append(("p", "Важное различие, которое видно в подписях: **курсы Банка России** — официальные дневные "
                   "значения, а не биржевые котировки в реальном времени; **значения Мосбиржи** получены из "
                   "публичного ISS и могут быть задержаны, рядом стоит время источника."))

    # 4
    B.append(("h2", "4. Как считаются производные величины"))
    B.append(("h3", "4.1. Проценты и процентные пункты"))
    B.append(("p", "Изменение цены — процент от предыдущего значения: (последнее − предыдущее) / предыдущее × 100. "
                   "Изменение ставки, доходности и доли — разность в процентных пунктах. Процент от процента "
                   "(например, «изменение изменения») сайт не считает: это была бы выдуманная величина."))
    B.append(("h3", "4.2. Индекс напряжённости"))
    B.append(("p", "Считается по новостям за последние 24 часа, без участия интерфейса:"))
    B.append(("code", "index = round(100 × Σ max(0, −sentiment) × importance × confidence\n"
                      "                / Σ importance × confidence)\n\n"
                      "окно: 24 часа; порог важности ≥ 3; порог уверенности ≥ 0,5;\n"
                      "исключаются GDELT; повторы заголовков и URL схлопываются;\n"
                      "если подходящих новостей меньше 3 — индекс не публикуется."))
    B.append(("p", "Отрицательная тональность умножается на важность и уверенность: новость с тональностью "
                   "−0,6 и важностью 6 весит больше, чем заметка с −0,2 и важностью 3. Проверка "
                   "tension_matches пересчитывает индекс тем же правилом независимо от основного кода и "
                   "сравнивает — в последнем прогоне 15 против 15."))
    B.append(("p", "Ту же формулу можно пересчитать своим запросом. Запрос из docs/review/verify.sql "
                   "(блок «6») по сырым строкам cached_news за сутки дал на момент снимка **15** при "
                   "**120** подходящих материалах — ровно те числа, что видит посетитель: 15 на шкале и "
                   "«в выборке 120 новостей». Совпадение получено не тем кодом, который рисует страницу, "
                   "а прямым счётом по базе."))
    B.append(("h3", "4.3. «Где в окне»"))
    B.append(("p", "Доля значений окна, которые не выше последнего. Окно — три месяца торговых дней у российских "
                   "рядов и 30 последних закрытий у мировых котировок."))
    B.append(("h3", "4.4. Статусы каналов влияния"))
    B.append(("table", [
        ["Канал", "Спокойно", "Внимание", "Повышенное движение", "По чему считается"],
        ["Валюта и платежи", "до 0,4 %", "до 1 %", "от 1 %", "худшая по модулю из трёх пар: USD/RUB, EUR/RUB, CNY/RUB"],
        ["Рынок и деньги", "до 0,5", "до 1", "—", "большее из IMOEX/1,5 % и RGBI/0,6 %"],
        ["Сырьё и экспорт", "до 1 %", "1–2,5 %", "от 2,5 %", "только Brent: других сырьевых рядов на сайте нет"],
        ["Глобальный риск", "до 0,45", "до 0,85", "—", "большее из S&P 500/1,5 % и доли негативных среди трёх главных"],
    ]))
    B.append(("h3", "4.5. Пороги шума в брифе"))
    B.append(("p", "Изменение показывается, только если оно больше порога: у шкалы — 5 пунктов, у цен — "
                   "от 0,1 % до 1,5 % в зависимости от инструмента. Сравниваются только опубликованные значения."))
    B.append(("h3", "4.6. Снимок дня"))
    B.append(("p", "Пишется один раз в сутки в 07:00 МСК. Повторный запуск не перезаписывает существующую "
                   "запись — только добавляет новый день. Поэтому архив нельзя улучшить задним числом."))

    # 5
    B.append(("h2", "5. Как проверить, не открывая сайт"))
    B.append(("p", "Все данные сайта лежат в его собственной базе и доступны по открытому протоколу PostgREST. "
                   "Публичный ключ ниже — тот самый, который загружает браузер посетителя: он разрешает только "
                   "чтение и только тех таблиц, которые и так видны на странице. Служебный ключ (service_role) "
                   "не передаётся никому и в этот пакет не входит."))
    B.append(("h3", "5.1. Прямой запрос к базе (curl или любой HTTP-клиент)"))
    B.append(("code", f"curl -s '{ 'https://' + SNAPSHOT['supabase_project'] }.supabase.co/rest/v1/cached_assets'\n"
                      f"     '?select=id,name,price,change,as_of,updated_at'\n"
                      f"  -H 'apikey: {SNAPSHOT['publishable_key']}'\n"
                      f"  -H 'Accept: application/json'"))
    B.append(("p", "Ожидаемый ответ — пять строк. Ключевые поля: price, change, as_of (дата наблюдения) и "
                   "updated_at (когда запись попала в кэш). Это разные вещи: as_of 30.10 при updated_at 01.11 "
                   "означает «взяли последнее закрытие, оно за 30 октября», а не «цена от 1 ноября»."))
    B.append(("p", "Живые числа меняются: брокерский кэш обновляется раз в 5 минут, поэтому BTC и золото в "
                   "вашем запросе почти наверняка будут чуть другими, чем в §2.7 (там значения на 18:55 МСК). "
                   "Сверять нужно не равенство до последнего знака, а три вещи: тот же порядок величины, "
                   "та же дата as_of и совпадение с источником по этой дате. Закрытия Brent, S&P 500 и "
                   "USD/EUR за 30.10 меняться уже не будут — это завершённые торговые дни."))
    B.append(("p", "Что доступно по публичному ключу:"))
    B.append(("table", TABLES))

    B.append(("h3", "5.2. Серверные эндпоинты сайта"))
    B.append(("table", [
        ["Адрес", "Что отдаёт", "Как проверить"],
        ["/api/russia-insights", "12 индикаторов (курсы, ставка, RUONIA, резервы, инфляция, ОФЗ, IMOEX, RGBI, золото) "
                                 "и заголовки российских СМИ", "сравнить значения с cbr.ru и moex.com по датам из ответа"],
        ["/api/russia-history", "6 рядов за 92 дня: IMOEX, RGBI, USD/RUB, RUONIA, резервы, ключевая ставка",
         "проверить, что пропущенные дни отсутствуют, а не заполнены нулями"],
        ["/api/brief-image", "PNG-карточка с теми же числами, что в брифе", "сверить три цифры на картинке с §2.8"],
    ]))

    B.append(("h3", "5.3. Запросы к базе"))
    B.append(("p", "В репозитории лежат два SQL-файла: scripts/stability-baseline.sql (замер стабильности, "
                   "16 метрик одним запросом) и docs/review/verify.sql (проверки под чеклист из §8). "
                   "Оба рассчитаны на запуск в SQL-редакторе Supabase или напрямую через psql."))

    B.append(("h3", "5.4. Код"))
    B.append(("p", "Репозиторий приватный: github.com/Clincher1/market-pulse1. Доступ выдаёт владелец. "
                   "Функции сборки — supabase/functions/*/index.ts, интерфейс — src/components/*.tsx, "
                   "серверные эндпоинты — api/*.js. Сборка проверяется тестами: 138 автотестов, "
                   "проверка типов и линтер; для функций — deno check."))

    B.append(("h3", "5.5. Что снаружи проверить нельзя"))
    B.append(("p", "Служебный ключ, содержимое Edge Functions и переменные окружения закрыты. Поэтому "
                   "«правильно ли считает сборщик» снаружи проверяется косвенно: через журнал самопроверок "
                   "(19 проверок, §6) и через совпадение чисел на странице с числами в базе (§5.1)."))

    # 6
    B.append(("h2", "6. Самопроверка: 19 проверок раз в час"))
    B.append(("p", "Каждый час система проверяет себя и пишет результат в таблицу site_health — ту же, из "
                   "которой рисуется страница «Состояние системы». Проверка считается пройденной, только если "
                   "у неё есть наблюдаемое последствие: строка в базе, число на живой странице или совпадение "
                   "с независимым пересчётом. Ответ 200 сам по себе ничего не доказывает."))
    B.append(("table", CHECKS))
    B.append(("p", "Статистика за семь дней по тем же 19 проверкам:"))
    B.append(("table", CHECKS_7D))
    B.append(("p", "Пять имён в окне семи дней относятся к остановленному блоку прогнозов. Их кода больше нет, "
                   "на странице состояния они не показываются, но старые записи остались в истории. Если "
                   "считать долю успеха по всем именам подряд, число занижается — поэтому в §6 и в замере "
                   "стабильности перечислены только живые проверки."))
    B.append(("table", DEAD_CHECKS))

    # 7
    B.append(("h2", "7. Что честно не идеально"))
    B.append(("p", "Этот раздел существует, чтобы проверяющий не тратил время на поиск известных вещей. "
                   "Ничего из перечисленного не выдаётся на сайте за норму — где нужно, стоит подпись."))
    B.append(("table", ISSUES))

    # 8
    B.append(("h2", "8. Чеклист проверки"))
    B.append(("p", "Пятнадцать шагов: что сделать и что должно получиться. Если результат отличается — это "
                   "и есть находка, её стоит описать."))
    B.append(("table", CHECKLIST))

    # приложения
    B.append(("h2", "Приложение A. Ленты новостей"))
    B.append(("p", "24 источника в реестре, 20 включены. «Прогонов/успешных за 24 часа» — обращения сборщика "
                   "к ленте за сутки (норма — 48, раз в 30 минут)."))
    B.append(("table", FEEDS))

    B.append(("h2", "Приложение B. Таблицы и представления"))
    B.append(("p", "Число строк — оценка планировщика PostgreSQL, а не точный подсчёт; для проверки важен "
                   "порядок величины."))
    B.append(("table", TABLES))

    B.append(("h2", "Приложение C. Словарь"))
    B.append(("table", GLOSSARY))

    B.append(("h2", "Приложение D. Доступы"))
    B.append(("table", [
        ["Что", "Как получить", "Кому"],
        ["Сайт", "открывается всем, регистрации нет", "—"],
        ["База (чтение)", "публичный ключ из §5.1, только таблицы из списка", "любой проверяющий"],
        ["Репозиторий", "приглашение в приватный репозиторий GitHub", "по запросу владельцу"],
        ["Supabase (полный доступ, SQL)", "приглашение в проект hekzplfftannlzwvgwwm", "по запросу владельцу"],
        ["Логи ошибок", "Sentry, организация non-oun, доступ только на чтение", "по запросу владельцу"],
    ]))
    B.append(("note", "Если нужно что-то, чего нет в этом пакете — скажите, что именно: выгрузку таблицы, "
                      "снимок страницы картинкой или разбор конкретного числа. Владелец передаст."))
    return B


# ────────────────────────────────────────────────────────────── рендер DOCX ──

def render_docx(path):
    from docx import Document
    from docx.shared import Pt, Cm, RGBColor
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.enum.table import WD_TABLE_ALIGNMENT
    from docx.oxml.ns import qn
    from docx.oxml import OxmlElement

    doc = Document()
    style = doc.styles["Normal"]
    style.font.name = "Calibri"
    style.font.size = Pt(10)
    style.element.rPr.rFonts.set(qn("w:eastAsia"), "Calibri")
    for section in doc.sections:
        section.left_margin = Cm(1.8)
        section.right_margin = Cm(1.6)
        section.top_margin = Cm(1.6)
        section.bottom_margin = Cm(1.6)

    def shade(cell, hex_color):
        tcPr = cell._tc.get_or_add_tcPr()
        shd = OxmlElement("w:shd")
        shd.set(qn("w:val"), "clear")
        shd.set(qn("w:color"), "auto")
        shd.set(qn("w:fill"), hex_color)
        tcPr.append(shd)

    def add_rich(paragraph, text):
        for part in re.split(r"(\*\*[^*]+\*\*)", text):
            if not part:
                continue
            if part.startswith("**") and part.endswith("**"):
                run = paragraph.add_run(part[2:-2])
                run.bold = True
            else:
                paragraph.add_run(part)

    def add_table(rows):
        cols = max(len(r) for r in rows)
        table = doc.add_table(rows=0, cols=cols)
        table.style = "Table Grid"
        table.alignment = WD_TABLE_ALIGNMENT.LEFT
        table.autofit = True
        for i, row in enumerate(rows):
            cells = table.add_row().cells
            for j in range(cols):
                text = row[j] if j < len(row) else ""
                cell = cells[j]
                cell.text = ""
                p = cell.paragraphs[0]
                p.paragraph_format.space_after = Pt(1)
                p.paragraph_format.space_before = Pt(1)
                add_rich(p, str(text))
                for run in p.runs:
                    run.font.size = Pt(8)
                    if i == 0:
                        run.bold = True
                if i == 0:
                    shade(cell, "E8EEF7")
        doc.add_paragraph()

    for block in blocks():
        kind = block[0]
        if kind == "title":
            p = doc.add_paragraph()
            p.paragraph_format.space_after = Pt(2)
            run = p.add_run(block[1])
            run.bold = True
            run.font.size = Pt(22)
            run.font.color.rgb = RGBColor(0x12, 0x2B, 0x4A)
            p2 = doc.add_paragraph()
            run2 = p2.add_run(block[2])
            run2.font.size = Pt(12)
            run2.font.color.rgb = RGBColor(0x44, 0x55, 0x66)
            p3 = doc.add_paragraph()
            run3 = p3.add_run(block[3])
            run3.font.size = Pt(9)
            run3.font.color.rgb = RGBColor(0x77, 0x77, 0x77)
            doc.add_paragraph()
        elif kind == "h2":
            h = doc.add_heading(block[1], level=1)
            h.paragraph_format.space_before = Pt(14)
            h.paragraph_format.space_after = Pt(4)
            for run in h.runs:
                run.font.size = Pt(15)
                run.font.color.rgb = RGBColor(0x12, 0x2B, 0x4A)
        elif kind == "h3":
            h = doc.add_heading(block[1], level=2)
            h.paragraph_format.space_before = Pt(10)
            h.paragraph_format.space_after = Pt(3)
            for run in h.runs:
                run.font.size = Pt(11.5)
                run.font.color.rgb = RGBColor(0x1F, 0x4E, 0x79)
        elif kind == "p":
            p = doc.add_paragraph()
            p.paragraph_format.space_after = Pt(5)
            add_rich(p, block[1])
        elif kind == "bullets":
            for item in block[1]:
                p = doc.add_paragraph(style="List Bullet")
                p.paragraph_format.space_after = Pt(3)
                add_rich(p, item)
                for run in p.runs:
                    run.font.size = Pt(10)
        elif kind == "table":
            add_table(block[1])
        elif kind == "code":
            for line in block[1].split("\n"):
                p = doc.add_paragraph()
                p.paragraph_format.space_after = Pt(0)
                p.paragraph_format.left_indent = Cm(0.4)
                run = p.add_run(line if line else " ")
                run.font.name = "Consolas"
                run.font.size = Pt(8.5)
            doc.add_paragraph()
        elif kind == "note":
            p = doc.add_paragraph()
            run = p.add_run(block[1])
            run.italic = True
            run.font.size = Pt(9.5)
    doc.save(path)


# ─────────────────────────────────────────────────────────────── рендер PDF ──

def render_pdf(path):
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import cm
    from reportlab.lib import colors
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import (BaseDocTemplate, Frame, PageTemplate, Paragraph,
                                    Spacer, Table, TableStyle, KeepTogether)

    pdfmetrics.registerFont(TTFont("DejaVu", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
    pdfmetrics.registerFont(TTFont("DejaVu-Bold", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"))
    pdfmetrics.registerFont(TTFont("DejaVuMono", "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"))
    from reportlab.pdfbase.pdfmetrics import registerFontFamily
    registerFontFamily("DejaVu", normal="DejaVu", bold="DejaVu-Bold", italic="DejaVu", boldItalic="DejaVu-Bold")

    NAVY = colors.HexColor("#122B4A")
    BLUE = colors.HexColor("#1F4E79")
    GREY = colors.HexColor("#F0F3F8")

    body = ParagraphStyle("body", fontName="DejaVu", fontSize=8.6, leading=12.4, spaceAfter=5)
    small = ParagraphStyle("small", parent=body, fontSize=8.0, leading=11.6)
    h1 = ParagraphStyle("h1", fontName="DejaVu-Bold", fontSize=14, leading=18, textColor=NAVY,
                        spaceBefore=12, spaceAfter=5)
    h2 = ParagraphStyle("h2", fontName="DejaVu-Bold", fontSize=10.6, leading=14, textColor=BLUE,
                        spaceBefore=9, spaceAfter=3)
    title = ParagraphStyle("title", fontName="DejaVu-Bold", fontSize=19, leading=23, textColor=NAVY)
    sub = ParagraphStyle("sub", fontName="DejaVu", fontSize=10.6, leading=14, textColor=colors.HexColor("#445566"))
    stamp = ParagraphStyle("stamp", fontName="DejaVu", fontSize=8, leading=11, textColor=colors.HexColor("#777777"))
    code = ParagraphStyle("code", fontName="DejaVuMono", fontSize=7.4, leading=10.2,
                          leftIndent=6, spaceAfter=0, backColor=colors.HexColor("#F6F7F9"))
    bullet = ParagraphStyle("bullet", parent=body, leftIndent=12, bulletIndent=2, spaceAfter=3)
    note = ParagraphStyle("note", parent=body, fontSize=8.2, textColor=colors.HexColor("#444444"),
                          leftIndent=6, borderPadding=4, backColor=colors.HexColor("#FFF8E1"))

    # Числа в таблицах не должны рваться по строке: «−0,04 п. п.» читается как
    # одно значение, а не как «−0,04» и отдельно «п. п.». Поэтому пробел между
    # числом и единицей заменяется на неразрывный.
    NBSP_UNITS = re.compile(r"(\d)\s+(%|п\.\s?п\.|₽|млрд|мс|сут|дн|МСК|UTC|г\.)")

    def nbsp(text):
        text = text.replace("п. п.", "п.\u00a0п.")
        return NBSP_UNITS.sub("\\1\u00a0\\2", text)

    def esc(text, keep_together=True):
        text = (text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))
        text = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", text)
        return nbsp(text) if keep_together else text

    story = []
    for block in blocks():
        kind = block[0]
        if kind == "title":
            story += [Paragraph(esc(block[1]), title), Spacer(1, 6),
                      Paragraph(esc(block[2]), sub), Spacer(1, 4),
                      Paragraph(esc(block[3]), stamp), Spacer(1, 10)]
        elif kind == "h2":
            story.append(Paragraph(esc(block[1]), h1))
        elif kind == "h3":
            story.append(Paragraph(esc(block[1]), h2))
        elif kind == "p":
            story.append(Paragraph(esc(block[1]), body))
        elif kind == "bullets":
            for item in block[1]:
                story.append(Paragraph(esc(item), bullet, bulletText="•"))
            story.append(Spacer(1, 4))
        elif kind == "table":
            rows = block[1]
            cols = max(len(r) for r in rows)
            data = []
            for i, row in enumerate(rows):
                cells = []
                for j in range(cols):
                    text = ""
                    cells.append(Paragraph(esc(str(row[j]), True) if j < len(row) else "", ParagraphStyle(
                        "c", fontName="DejaVu-Bold" if i == 0 else "DejaVu",
                        fontSize=6.9, leading=9.2)))
                data.append(cells)
            avail = A4[0] - 3.4 * cm
            # Ширины столбцов считаются по самим абзацам, а не по числу символов:
            # minWidth() — сколько нужно, чтобы ни одно слово не разорвалось
            # («$113,43» не должно превращаться в «$113.4\n3»), maxWidth() —
            # сколько нужно, чтобы влезло целиком в одну строку. Сначала всем
            # выдаётся минимум, остаток ширины делится пропорционально
            # «жадности» столбцов.
            min_need = [0.0] * cols
            max_need = [0.0] * cols
            for row in data:
                for j in range(cols):
                    min_need[j] = max(min_need[j], row[j].minWidth())
                    j_raw = str(row[j]) if j < len(row) else ""
                    max_need[j] = max(max_need[j], pdfmetrics.stringWidth(j_raw, "DejaVu", 6.9))
            pad = 7.0  # левый + правый отступ ячейки
            mins = [m + pad for m in min_need]
            maxs = [m + pad for m in max_need]
            if sum(mins) >= avail:
                widths = [avail * m / sum(mins) for m in mins]
            else:
                spare = avail - sum(mins)
                hunger = [max(0.0, maxs[j] - mins[j]) for j in range(cols)]
                total_hunger = sum(hunger) or 1.0
                widths = [mins[j] + spare * hunger[j] / total_hunger for j in range(cols)]
            table = Table(data, colWidths=widths, repeatRows=1)
            table.setStyle(TableStyle([
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#B8C2D0")),
                ("BACKGROUND", (0, 0), (-1, 0), GREY),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 3),
                ("RIGHTPADDING", (0, 0), (-1, -1), 3),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ]))
            story += [table, Spacer(1, 8)]
        elif kind == "code":
            for line in block[1].split("\n"):
                story.append(Paragraph(esc(line).replace(" ", "&nbsp;") or "&nbsp;", code))
            story.append(Spacer(1, 6))
        elif kind == "note":
            story.append(Paragraph(esc(block[1]), note))

    def footer(canvas, doc):
        canvas.saveState()
        canvas.setFont("DejaVu", 7)
        canvas.setFillColor(colors.HexColor("#888888"))
        canvas.drawString(1.7 * cm, 1.0 * cm, f"Market Pulse · пакет для проверки · 01.11.2026 · коммит {SNAPSHOT['commit']}")
        canvas.drawRightString(A4[0] - 1.7 * cm, 1.0 * cm, f"стр. {doc.page}")
        canvas.restoreState()

    doc = BaseDocTemplate(path, pagesize=A4,
                          leftMargin=1.6 * cm, rightMargin=1.8 * cm,
                          topMargin=1.4 * cm, bottomMargin=1.5 * cm,
                          title="Market Pulse — пакет для независимой проверки",
                          author="Market Pulse")
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="main")
    doc.addPageTemplates([PageTemplate(id="page", frames=[frame], onPage=footer)])
    doc.build(story)


def render_md(path):
    """Тот же текст без вёрстки — для тех, кто читает файлы как текст."""
    out = []
    for block in blocks():
        kind = block[0]
        if kind == "title":
            out += [f"# {block[1]}", "", f"*{block[2]}*", "", f"`{block[3]}`", ""]
        elif kind == "h2":
            out += ["", f"## {block[1]}", ""]
        elif kind == "h3":
            out += ["", f"### {block[1]}", ""]
        elif kind == "p":
            out += [block[1], ""]
        elif kind == "bullets":
            out += [f"- {item}" for item in block[1]] + [""]
        elif kind == "table":
            rows = block[1]
            cols = max(len(r) for r in rows)
            def cell(value):
                return str(value).replace("|", "\\|").replace("\n", " ")
            header = "| " + " | ".join(cell(rows[0][j]) if j < len(rows[0]) else "" for j in range(cols)) + " |"
            sep = "| " + " | ".join("---" for _ in range(cols)) + " |"
            body = ["| " + " | ".join(cell(r[j]) if j < len(r) else "" for j in range(cols)) + " |"
                    for r in rows[1:]]
            out += [header, sep] + body + [""]
        elif kind == "code":
            out += ["```", block[1], "```", ""]
        elif kind == "note":
            out += [f"> {block[1]}", ""]
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(out))


def dump_json(path):
    data = {
        "snapshot": SNAPSHOT,
        "money": MONEY[1:],
        "passport": PASSPORT[1:],
        "passport_archive": PASSPORT_ARCHIVE[1:],
        "what_changed": WHAT_CHANGED[1:],
        "week_to_week": WEEK_TABLE[1:],
        "russia": RUSSIA[1:],
        "ofz_curve": {"terms": OFZ_CURVE[0][1:], "yields": OFZ_CURVE[1][1:]},
        "derived": DERIVED[1:],
        "tension": {"dates": TENSION_HISTORY[0][1:], "values": TENSION_HISTORY[1][1:],
                    "flow": TENSION_FLOW[1:]},
        "global_tiles": GLOBAL_TILES[1:],
        "brief": {"facts": BRIEF_FACTS, "russia": BRIEF_RUSSIA, "since_morning": BRIEF_SINCE_MORNING},
        "news": {"by_source_24h": NEWS_FLOW_DB[1:], "sample": NEWS_SAMPLE[1:]},
        "memory": MEMORY[1:],
        "instruments": INSTRUMENTS[1:],
        "checks": {"last_run_utc": SNAPSHOT["selfcheck_last_utc"], "items": CHECKS[1:]},
        "checks_7d": CHECKS_7D[1:],
        "dead_checks": DEAD_CHECKS[1:],
        "issues": ISSUES[1:],
        "checklist": CHECKLIST[1:],
        "feeds": FEEDS[1:],
    }
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    docx_path = os.path.join(OUT_DIR, BASE + ".docx")
    pdf_path = os.path.join(OUT_DIR, BASE + ".pdf")
    json_path = os.path.join(OUT_DIR, "snapshot-2026-11-01.json")
    md_path = os.path.join(OUT_DIR, BASE + ".md")
    render_docx(docx_path)
    render_pdf(pdf_path)
    render_md(md_path)
    dump_json(json_path)
    for p in (docx_path, pdf_path, md_path, json_path):
        print(f"{os.path.basename(p)}: {os.path.getsize(p) // 1024} КБ")
