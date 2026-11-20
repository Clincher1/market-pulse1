import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { CHECK_LABELS } from '../src/lib/checkLabels.ts';

/**
 * Страница состояния печатает подписи из CHECK_LABELS. Если серверная
 * самопроверка заведёт проверку, которой здесь нет, читатель увидит сырой ключ
 * вроде `asset_history_panel` — и не поймёт, что именно сломалось.
 *
 * Обратная ситуация тоже плоха: подпись без проверки создаёт впечатление, что
 * что-то наблюдается, хотя не наблюдается ничего.
 *
 * Тест сверяет два списка и требует, чтобы они совпадали.
 */

const source = readFileSync(
  new URL('../supabase/functions/selfcheck/index.ts', import.meta.url),
  'utf8',
);

function serverChecks() {
  const names = new Set();
  for (const match of source.matchAll(/check\('([a-z0-9_]+)'/g)) names.add(match[1]);
  return [...names];
}

test('у каждой серверной проверки есть подпись на странице', () => {
  const names = serverChecks();
  // Страховка от «тест зелёный, потому что ничего не нашёл».
  assert.ok(names.length >= 15, `в selfcheck найдено всего ${names.length} проверок`);
  const missing = names.filter((name) => !CHECK_LABELS[name]);
  assert.deepEqual(missing, [], `без подписи: ${missing.join(', ')}`);
});

test('на странице нет подписей для проверок, которых сервер не делает', () => {
  const names = new Set(serverChecks());
  const extra = Object.keys(CHECK_LABELS).filter((key) => !names.has(key));
  assert.deepEqual(extra, [], `подписи без проверки: ${extra.join(', ')}`);
});

test('расписание подписано у проверок, которые зависят от календаря источника', () => {
  // Эти проверки краснеют не от поломки, а от расписания: недельные резервы,
  // суточные снимки, ленты. Без строки с частотой их нельзя отличить от
  // мёртвого источника — ровно та путаница, из-за которой проверки не верят.
  // Проверок прогнозов здесь больше нет: выдача остановлена 31.10.2026.
  const scheduled = [
    'news_fresh',
    'assets_fresh',
    'assets_asof',
    'source_politeness',
    'slots_registry',
    'snapshot_taken',
    'feeds_fresh',
    'ru_history_api',
    'asset_history_panel',
    'market_memory',
    'brief_image',
  ];
  const withoutCadence = scheduled.filter((name) => !CHECK_LABELS[name]?.cadence);
  assert.deepEqual(withoutCadence, [], `без расписания: ${withoutCadence.join(', ')}`);
});

test('у каждой подписи есть заголовок и пояснение', () => {
  for (const [name, label] of Object.entries(CHECK_LABELS)) {
    assert.ok(label.title.trim().length > 3, `${name}: пустой заголовок`);
    assert.ok(label.hint.trim().length > 3, `${name}: пустое пояснение`);
  }
});

// The public memory page is a forecast archive, not the legacy event/analogy engine.
test('legacy event memory does not certify the public forecast archive', async () => {
  const { HIDDEN_PUBLIC_CHECKS, PUBLIC_CHECK_NAMES } = await import('../src/lib/checkLabels.ts');
  assert.equal(HIDDEN_PUBLIC_CHECKS.has('market_memory'), true);
  assert.equal(PUBLIC_CHECK_NAMES.includes('market_memory'), false);
});

test('price truth description covers all five assets and distinguishes quote from close', () => {
  assert.match(CHECK_LABELS.asset_change_truth.hint, /все пять/);
  assert.match(CHECK_LABELS.asset_change_truth.hint, /непроверенной/);
});
