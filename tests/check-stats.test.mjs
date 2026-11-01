import assert from 'node:assert/strict';
import test from 'node:test';

import { checkWindowLabel, summariseCheckStats } from '../src/lib/checkStats.ts';

/**
 * Фикстуры — настоящие строки вида `site_health_check_stats_7d` на 01.11.2026:
 * ru_insights 72 прогона / 69 удачных (Мосбиржа не ответила трижды),
 * ru_history_api 46/45, assets_fresh 105/105.
 * Плюс строка удалённой проверки forecasts_fresh — она осталась в истории.
 */

function row(overrides = {}) {
  return {
    check_name: 'assets_fresh',
    samples: 105,
    ok_samples: 105,
    last_seen_at: '2026-11-01T04:25:01.864+00:00',
    last_fail_at: null,
    ...overrides,
  };
}

const active = ['ru_insights', 'ru_history_api', 'assets_fresh', 'news_fresh'];

function realRows() {
  return [
    row({ check_name: 'ru_insights', samples: 72, ok_samples: 69, last_fail_at: '2026-10-31T11:25:01.769+00:00' }),
    row({ check_name: 'ru_history_api', samples: 46, ok_samples: 45, last_fail_at: '2026-10-30T07:25:03.512+00:00' }),
    row({ check_name: 'assets_fresh' }),
    row({ check_name: 'news_fresh' }),
    // Проверки прогнозов больше нет в коде, но её строки лежат в истории.
    row({ check_name: 'forecasts_fresh', samples: 92, ok_samples: 83, last_fail_at: '2026-10-29T05:25:01.617+00:00' }),
  ];
}

function plain(text) {
  return String(text ?? '').replace(/\u00A0/g, ' ');
}

test('окно считается только по проверкам, которые есть в текущем прогоне', () => {
  const stats = summariseCheckStats(realRows(), active);
  // 72 + 46 + 105 + 105; строка forecasts_fresh не подмешивается.
  assert.equal(stats.samples, 328);
  assert.equal(stats.okSamples, 324);
  assert.equal(stats.okPercent, 99);
  assert.deepEqual(stats.troubles.map((item) => item.name), ['ru_insights', 'ru_history_api']);
});

test('три провала из семидесяти двух — единичные, и это сказано словами', () => {
  const stats = summariseCheckStats(realRows(), active);
  assert.match(plain(stats.headline), /^За 7 дней пройдено 324 из 328 проверок — 99 %\./);
  assert.match(plain(stats.headline), /Предупреждения единичные/);
  // Именно так и было: 3 провала из 72 прогонов у ru_insights.
  assert.equal(stats.troubles[0].fails, 3);
  assert.equal(stats.troubles[0].samples, 72);
});

test('повторяющиеся сбои не называются единичными', () => {
  const stats = summariseCheckStats(
    [
      row({ check_name: 'ru_insights', samples: 10, ok_samples: 4 }),
      row({ check_name: 'assets_fresh' }),
    ],
    ['ru_insights', 'assets_fresh'],
  );
  assert.match(plain(stats.headline), /У проверки «ru_insights» провалов 6 из 10/);
  assert.doesNotMatch(plain(stats.headline), /единичные/);
});

test('пустое окно не превращается в «0 %»', () => {
  const stats = summariseCheckStats([], active);
  assert.equal(stats.samples, 0);
  assert.equal(stats.okPercent, null);
  assert.match(stats.headline, /Статистики за неделю пока нет/);
});

test('испорченная строка не даёт больше пройденных, чем было прогонов', () => {
  const stats = summariseCheckStats(
    [row({ check_name: 'ru_insights', samples: 5, ok_samples: 9 })],
    ['ru_insights'],
  );
  assert.equal(stats.samples, 5);
  assert.equal(stats.okSamples, 5);
  assert.equal(stats.okPercent, 100);
  assert.deepEqual(stats.troubles, []);
});

test('подпись под проверкой: без провалов и с провалами — разными словами', () => {
  assert.equal(checkWindowLabel(row()), 'за 7 дней: 105 из 105, без провалов');
  assert.equal(
    checkWindowLabel(row({ check_name: 'ru_insights', samples: 72, ok_samples: 69 })),
    'за 7 дней: 69 из 72',
  );
  assert.equal(checkWindowLabel(undefined), null);
  assert.equal(checkWindowLabel(row({ samples: 0, ok_samples: 0 })), null);
});
