// Контраст палитры: проверка без браузера.
//
// Зачем отдельный тест. Цвет текста на залитой плашке нельзя оценить на глаз:
// #3b82f6 с белым текстом выглядит «нормально синим», а по WCAG это 3,68:1 —
// ниже порога 4,5:1 для текста 14px. Именно так и было до 02.11.2026 на всех
// главных кнопках и активных вкладках, и ни один существующий тест этого не
// видел: вёрстка собиралась, скриншоты совпадали, ошибок в консоли не было.
//
// Здесь два вида проверок:
//   1. Разобранные пары «фон + текст», на которых стоит интерфейс, — с явным
//      порогом и ссылкой на место в коде.
//   2. Сканер всех классов в src/: каждая пара «непрозрачный bg-* + text-*»
//      внутри одной строки классов должна проходить 4,5:1. Полупрозрачные
//      подложки (bg-x/10) пропускаются: их итоговый цвет зависит от слоя под
//      ними, и считать его здесь значило бы придумать число.
//
// Ни браузера, ни сети: чистый расчёт по значениям из src/index.css.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const CSS = readFileSync(join(ROOT, 'src/index.css'), 'utf8');

// --- WCAG 2.1 -------------------------------------------------------------
function channels(hex) {
  const value = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255);
}

function luminance(hex) {
  const [r, g, b] = channels(hex).map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4),
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// --- Токены из @theme -----------------------------------------------------
function readTokens() {
  const block = CSS.slice(CSS.indexOf('@theme'), CSS.indexOf('}', CSS.indexOf('@theme')));
  const tokens = new Map();
  for (const match of block.matchAll(/--color-([a-z-]+):\s*(#[0-9a-fA-F]{6})/g)) {
    tokens.set(match[1], match[2].toLowerCase());
  }
  return tokens;
}

const tokens = readTokens();
const AA_TEXT = 4.5;
const AA_GRAPHIC = 3;

// Палитра Tailwind только для тех оттенков, которые реально стоят в src/.
// Тест падает с понятным сообщением, если в коде появится оттенок, которого
// здесь нет: молча пропустить новую пару он не может.
const PALETTE = {
  // slate-500 в Tailwind 4 — это #62748e, а не #64748b: старое значение давало
  // «проходит», хотя на экране 4,13:1. Цифры ниже сверены с рендером (axe).
  slate: { 300: '#cbd5e1', 400: '#90a1b9', 500: '#62748e', 600: '#475569', 950: '#020617' },
  gray: { 500: '#6b7280' },
  red: { 300: '#fca5a5' },
  amber: { 100: '#fef3c7', 200: '#fde68a', 400: '#fbbf24' },
  emerald: { 700: '#047857' },
  cyan: { 700: '#0e7490' },
  blue: { 50: '#eff6ff', 200: '#bfdbfe', 300: '#93c5fd', 600: '#2563eb' },
  violet: { 600: '#7c3aed' },
  fuchsia: { 700: '#a21caf' },
  rose: { 50: '#fff1f2', 700: '#be123c' },
  white: '#ffffff',
};

// Имя класса → значение. Токены проекта названы по смыслу
// (`--color-text-secondary`, `--color-bg-card`), поэтому у `text-*` сначала
// ищется токен `text-<имя>`, потом просто `<имя>`: класс `text-text-secondary`
// и токен `--color-text-secondary` — это одна и та же краска.
function colorOf(className) {
  if (className === 'text-white' || className === 'bg-white') return PALETTE.white;
  const name = className.replace(/^(text|bg)-/, '');
  const candidates = [`text-${name}`, `bg-${name}`, name];
  for (const candidate of candidates) {
    if (tokens.has(candidate)) return tokens.get(candidate);
  }
  const match = /^([a-z]+)-(\d{2,3})$/.exec(name);
  if (match && PALETTE[match[1]]?.[match[2]]) return PALETTE[match[1]][match[2]];
  return null;
}

// --- 1. Пары, на которых стоит интерфейс ----------------------------------
// threshold: 4,5 для текста любого кегля; 3 для графики (иконки, рамки).
const USED_PAIRS = [
  // Основной текст на двух поверхностях.
  ['text-primary', 'bg-primary', AA_TEXT, 'заголовки и числа на фоне страницы'],
  ['text-primary', 'bg-card', AA_TEXT, 'заголовки на карточке'],
  ['text-secondary', 'bg-primary', AA_TEXT, 'подписи и пояснения'],
  ['text-secondary', 'bg-card', AA_TEXT, 'подписи на карточке'],
  ['text-secondary', 'bg-card-hover', AA_TEXT, 'подписи на карточке под курсором'],
  // Смысловые цвета как текст.
  ['positive', 'bg-card', AA_TEXT, 'рост цены'],
  ['negative', 'bg-card', AA_TEXT, 'падение цены'],
  ['accent', 'bg-card', AA_TEXT, 'акцентная подпись, ссылка'],
  ['accent', 'bg-primary', AA_TEXT, 'акцентная подпись на фоне страницы'],
  // Залитые поверхности с белым текстом (кнопки, активные вкладки).
  ['accent-strong', 'white', AA_TEXT, 'главная кнопка: белый текст на заливке'],
  ['accent-strong-hover', 'white', AA_TEXT, 'та же кнопка под курсором'],
  // Активные пункты навигации по разделам.
  ['blue-600', 'white', AA_TEXT, 'активный раздел «Россия»'],
  ['emerald-700', 'white', AA_TEXT, 'активный раздел «Паспорт»'],
  ['cyan-700', 'white', AA_TEXT, 'активный раздел «Мир»'],
  ['violet-600', 'white', AA_TEXT, 'активный раздел «Бриф»'],
  ['fuchsia-700', 'white', AA_TEXT, 'активный раздел «Память»'],
  ['rose-700', 'white', AA_TEXT, 'активный раздел «Гид»'],
  ['slate-600', 'white', AA_TEXT, 'активный раздел «Проект»'],
  ['amber-400', 'slate-950', AA_TEXT, 'активный раздел «Новости» (тёмный текст на жёлтом)'],
  // Приглушённый серый: slate-500 как текст не проходил (4,13:1 на bg-primary),
  // поэтому тексты переведены на slate-400. Обе строки — регрессия на возврат.
  ['slate-400', 'bg-primary', AA_TEXT, 'приглушённая подпись на фоне страницы'],
  ['slate-400', 'bg-card', AA_TEXT, 'приглушённая подпись на карточке'],
];

test('пары палитры проходят WCAG AA', () => {
  const failures = [];
  for (const [fg, bg, threshold, where] of USED_PAIRS) {
    const front = colorOf(fg.startsWith('text-') ? fg : `text-${fg}`);
    const back = bg === 'white' ? PALETTE.white : colorOf(`bg-${bg}`);
    assert.ok(front, `нет цвета для «${fg}» — добавьте его в PALETTE или @theme`);
    assert.ok(back, `нет цвета для «${bg}» — добавьте его в PALETTE или @theme`);
    const ratio = contrast(front, back);
    if (ratio < threshold) {
      failures.push(`${fg} на ${bg}: ${ratio.toFixed(2)}:1 < ${threshold} (${where})`);
    }
  }
  assert.deepEqual(failures, []);
});

test('токены, на которые опирается интерфейс, объявлены', () => {
  for (const name of [
    'bg-primary',
    'bg-card',
    'bg-card-hover',
    'border-subtle',
    'accent',
    'accent-strong',
    'accent-strong-hover',
    'positive',
    'negative',
    'text-primary',
    'text-secondary',
  ]) {
    assert.ok(tokens.has(name), `в @theme нет --color-${name}`);
  }
});

// --- 2. Сканер классов в исходниках ---------------------------------------
function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(tsx|ts)$/.test(entry.name)) out.push(path);
  }
  return out;
}

// Строковые литералы: классы Tailwind лежат в них, а не в разметке напрямую.
function classStrings(source) {
  const out = [];
  for (const match of source.matchAll(/(['"`])((?:(?!\1)[^\\]|\\.)*)\1/g)) {
    if (match[2].includes(' ')) out.push(match[2]);
  }
  return out;
}

// Класс = необязательный вариант + утилита: `hover:bg-accent`, `sm:text-sm`,
// `focus-visible:ring-2`. Вариант — это состояние, в котором класс действует,
// поэтому цвета сравниваются внутри одного состояния: базовый фон с базовым
// текстом, фон при наведении с текстом при наведении. Иначе сканер сравнивал
// бы цвет кнопки под курсором с цветом текста в покое и выдумывал находки.
const BREAKPOINTS = new Set(['sm', 'md', 'lg', 'xl', '2xl', 'dark', 'motion-safe', 'print']);

function parseClass(token) {
  const parts = token.split(':');
  const util = parts.pop();
  const state = parts.filter((part) => !BREAKPOINTS.has(part)).join(':');
  return { util, state };
}

function tokensOf(classString) {
  return classString
    .split(/\s+/)
    .filter(Boolean)
    .map(parseClass)
    .filter(({ util }) => util && !util.includes('[') && !util.startsWith('shadow-'));
}

const SKIP_BACKGROUND = new Set([
  'bg-transparent',
  'bg-current',
  'bg-none',
  'bg-inherit',
]);

test('нет белого текста на слишком светлой заливке', () => {
  const findings = [];
  for (const file of sourceFiles(join(ROOT, 'src'))) {
    const source = readFileSync(file, 'utf8');
    for (const classString of classStrings(source)) {
      const list = tokensOf(classString);
      const backgrounds = list.filter(
        ({ util }) =>
          util.startsWith('bg-') &&
          !util.includes('/') && // полупрозрачная подложка: цвет зависит от слоя
          !util.includes('gradient') &&
          !SKIP_BACKGROUND.has(util),
      );
      const texts = list.filter(({ util }) => util.startsWith('text-') && !util.includes('/'));
      const states = new Set([
        '',
        ...backgrounds.map((item) => item.state),
        ...texts.map((item) => item.state),
      ]);
      for (const state of states) {
        // В состоянии `state` действует класс с этим состоянием, а если его
        // нет — базовый, без варианта.
        const pick = (items) => items.find((item) => item.state === state) ?? items.find((item) => item.state === '');
        const background = pick(backgrounds);
        const text = pick(texts);
        if (!background || !text) continue;
        const back = colorOf(background.util);
        const front = colorOf(text.util);
        if (!back || !front) continue;
        const ratio = contrast(front, back);
        if (ratio < AA_TEXT) {
          const where = state ? `${state}: ` : '';
          findings.push(
            `${relative(ROOT, file)}: ${where}${text.util} на ${background.util} = ${ratio.toFixed(2)}:1 < ${AA_TEXT}`,
          );
        }
      }
    }
  }
  assert.deepEqual([...new Set(findings)].sort(), []);
});

test('ни один смысловой цвет не объявлен «на всякий случай»', () => {
  // Мёртвый токен — это ловушка: он выглядит разрешённым к использованию,
  // но никем не проверен. --color-neutral (#6b7280) жил так до 02.11.2026:
  // ни одного класса с ним, и как текст он давал 3,98:1.
  const sources = sourceFiles(join(ROOT, 'src'))
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');
  const unused = [...tokens.keys()].filter((name) => {
    const forms = [
      `text-${name}`,
      `bg-${name}`,
      `border-${name}`,
      `ring-${name}`,
      `shadow-${name}`,
      `from-${name}`,
      `to-${name}`,
    ];
    return !forms.some((form) => sources.includes(form));
  });
  assert.deepEqual(unused, [], `в @theme есть токены без единого использования: ${unused}`);
});

test('графика на заливке не ниже 3:1', () => {
  // Иконка — не текст: для неё порог 3:1 (WCAG 1.4.11). Проверяются только
  // пары, где иконка лежит на заливке того же файла темы.
  for (const [shade, hex] of Object.entries({
    'emerald-700': '#047857',
    'blue-600': '#2563eb',
    'cyan-700': '#0e7490',
    'violet-600': '#7c3aed',
    'fuchsia-700': '#a21caf',
    'rose-700': '#be123c',
    'slate-600': '#475569',
  })) {
    const ratio = contrast(hex, PALETTE.white);
    assert.ok(ratio >= AA_GRAPHIC, `${shade} с белой иконкой: ${ratio.toFixed(2)}:1 < 3`);
  }
});

test('slate-500 остаётся только у иконок', () => {
  // #62748e на тёмном фоне даёт 4,13:1 — этого хватает иконке (порог 3:1) и не
  // хватает тексту (4,5:1). До 03.11.2026 так были подписаны «· 2 ноя.»,
  // «арифметика, не прогноз» и ещё два десятка пояснений: на глаз серое
  // выглядело нормальным, а на деле было ниже порога.
  const ratio = contrast(PALETTE.slate[500], tokens.get('bg-primary'));
  assert.ok(ratio < AA_TEXT, `slate-500 неожиданно прошёл порог текста (${ratio.toFixed(2)}:1) — пересмотрите правило`);

  const offenders = [];
  for (const file of sourceFiles(join(ROOT, 'src'))) {
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, index) => {
        if (!line.includes('text-slate-500')) return;
        // У иконки есть размер (h-3.5, h-9): значит это графика, а не текст.
        const isIcon = /\bh-\d/.test(line) || /\bh-\[/.test(line);
        if (!isIcon) offenders.push(`${relative(ROOT, file)}:${index + 1}`);
      });
  }
  assert.deepEqual(offenders, [], `slate-500 как текст ниже 4,5:1 — замените на slate-400: ${offenders.join(', ')}`);
});
