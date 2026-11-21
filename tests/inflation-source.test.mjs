import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
test('inflation uses the existing CBR HTML table, never feeds an XLSX download to an HTML parser', () => {
  const api = readFileSync('api/russia-insights.js', 'utf8');
  assert.ok(api.includes("const INFLATION_PAGE = 'https://www.cbr.ru/hd_base/infl/'"));
  assert.ok(api.includes('parseInflationTable(await fetchText(INFLATION_PAGE))'));
  assert.ok(!api.includes('https://www.cbr.ru/Queries/UniDbQuery/DownloadExcel/'));
});
