#!/usr/bin/env node
/**
 * Независимая проверка шкалы напряжённости и живости данных.
 *
 * Скрипт не доверяет ни сайту, ни back-end-функции: он заново достаёт сырые
 * новости, сам применяет правила отбора и сам считает индекс, после чего
 * сравнивает результат с тем, что опубликовано. Любое расхождение — это
 * ошибка метрики, а не «так показалось».
 *
 * Запуск:  node scripts/verify-tension.mjs
 * Выход:   0 — всё совпало, 1 — есть расхождение.
 *
 * Ключ ниже — публичный (publishable). Он и так лежит в JS-бандле сайта,
 * секретом не является и даёт только чтение кэшированных таблиц.
 */

const SUPABASE_URL = 'https://hekzplfftannlzwvgwwm.supabase.co';
const PUBLIC_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  'sb_publishable_FPAh2Z30aCCKpbfDdDrM_g_urRwk8r-';

const MIN_IMPORTANCE = 3;
const MIN_CONFIDENCE = 0.5;
const BLOCKED_SOURCES = new Set(['GDELT (Global)', 'GDELT']);
const FRESH_SAMPLE_HOURS = 6;

let failures = 0;

function check(name, ok, detail) {
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function rest(path) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: PUBLIC_KEY, Authorization: `Bearer ${PUBLIC_KEY}`, Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`${path} → HTTP ${response.status}`);
  return response.json();
}

const hours = (ms) => Math.round((ms / 3_600_000) * 10) / 10;
const age = (iso) => hours(Date.now() - new Date(iso).getTime());

const windowStart = new Date(Date.now() - 24 * 3_600_000).toISOString();

// Колонка sample_newest появляется только после выкатки update-tension v18.
// Пока её нет, база отвечает 400 — это не поломка метрики, а просто
// недоступность одной проверки, поэтому запрашиваем её отдельно и мягко.
async function restOptional(path, fallbackPath) {
  try {
    return await rest(path);
  } catch {
    return rest(fallbackPath);
  }
}

const [news, tensionRows, forecastRows, snapshotRows] = await Promise.all([
  rest(
    `cached_news?select=sentiment,importance,confidence,source,published_at` +
      `&published_at=gte.${encodeURIComponent(windowStart)}&limit=500`,
  ),
  restOptional(
    'cached_tension?select=value,label,news_count,updated_at,sample_newest,history&id=eq.1',
    'cached_tension?select=value,label,news_count,updated_at,history&id=eq.1',
  ),
  rest('cached_forecasts?select=id,updated_at'),
  rest('daily_snapshots?select=date&order=date.desc&limit=1'),
]);

// 1. Считаем индекс заново, своими руками, по тем же правилам.
const qualified = news.filter(
  (row) =>
    Number(row.importance) >= MIN_IMPORTANCE &&
    Number(row.confidence) >= MIN_CONFIDENCE &&
    !BLOCKED_SOURCES.has(row.source),
);
let negative = 0;
let total = 0;
for (const row of qualified) {
  const weight = Number(row.importance) * Number(row.confidence);
  total += weight;
  negative += Math.max(0, -Number(row.sentiment)) * weight;
}
const computed = total > 0 ? Math.round((negative / total) * 100) : 0;

const published = tensionRows[0];
console.log('');
console.log(`Окно 24 часа: ${news.length} материалов, прошло фильтры ${qualified.length}`);
console.log(`Индекс: пересчитано ${(negative / total * 100).toFixed(2)} → ${computed}; опубликовано ${published.value}`);
console.log('');

check(
  'индекс совпадает с опубликованным',
  Math.abs(published.value - computed) <= 1,
  `разница ${Math.abs(published.value - computed)}`,
);
// Размер выборки сравниваем с допуском, а не в точности: индекс публикуется
// раз в 15 минут, а пересчёт идёт «на сейчас», и окно за это время успевает
// сдвинуться. Сам индекс — отношение, поэтому он устойчив к такому сдвигу и
// проверяется выше точно; абсолютное же число материалов в окне плавает.
const countDrift = Math.abs(published.news_count - qualified.length);
check(
  'размер выборки сопоставим с опубликованным',
  countDrift <= Math.max(8, qualified.length * 0.12),
  `сайт ${published.news_count}, пересчёт ${qualified.length}, расхождение ${countDrift}`,
);
check('выборка достаточна для вывода', qualified.length >= 20, `${qualified.length} материалов`);

const newest = qualified
  .map((row) => new Date(row.published_at).getTime())
  .sort((a, b) => b - a)[0];
check(
  'поток новостей живой',
  newest !== undefined && age(new Date(newest).toISOString()) <= FRESH_SAMPLE_HOURS,
  `свежему материалу ${newest ? age(new Date(newest).toISOString()) : '—'} ч`,
);

if (published.sample_newest) {
  check(
    'возраст выборки, заявленный сайтом, совпадает с фактом',
    Math.abs(age(published.sample_newest) - age(new Date(newest).toISOString())) <= 0.5,
    `заявлено ${age(published.sample_newest)} ч, по факту ${age(new Date(newest).toISOString())} ч`,
  );
} else {
  console.log('INFO  колонка sample_newest ещё не пишется — свежесть проверена напрямую по новостям');
}

const forecastAge = forecastRows.length ? age(forecastRows[0].updated_at) : null;
check(
  'прогнозы обновляются',
  forecastAge !== null && forecastAge <= 2,
  `последнее обновление ${forecastAge} ч назад`,
);

const snapshot = snapshotRows[0];
check(
  'ежедневный снимок знаний пишется',
  Boolean(snapshot) && age(`${snapshot.date}T00:00:00Z`) <= 36,
  snapshot ? `последний снимок за ${snapshot.date}` : 'снимков нет',
);

console.log('');
console.log(failures === 0 ? 'Все проверки пройдены.' : `Расхождений: ${failures}.`);
process.exit(failures === 0 ? 0 : 1);
