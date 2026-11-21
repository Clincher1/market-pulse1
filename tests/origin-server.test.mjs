import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import {
  ALLOWED_SUPABASE_PATHS,
  proxyTarget,
  resolveStaticPath,
  securityHeaders,
  vercelStyleResponse,
} from '../server/origin.mjs';

const SUPABASE = 'https://example.supabase.co';

test('прокси пропускает только пути API Supabase', () => {
  assert.equal(
    proxyTarget('/sb/rest/v1/cached_assets?select=*', SUPABASE),
    'https://example.supabase.co/rest/v1/cached_assets?select=*',
  );
  assert.equal(
    proxyTarget('/sb/auth/v1/health', SUPABASE),
    'https://example.supabase.co/auth/v1/health',
  );
  // Слэш в конце адреса проекта не должен давать двойной слэш.
  assert.equal(
    proxyTarget('/sb/rest/v1/', 'https://example.supabase.co/'),
    'https://example.supabase.co/rest/v1/',
  );
});

test('прокси не становится открытым релеем', () => {
  assert.equal(proxyTarget('/sb/functions/v1/selfcheck', SUPABASE), null);
  // Не тот префикс.
  assert.equal(proxyTarget('/rest/v1/cached_assets', SUPABASE), null);
  // Хост из запроса никогда не влияет на адрес: даже если клиент прислал
  // протокол-относительный адрес, запрос уйдёт в наш проект, а не на чужой.
  const relative = proxyTarget('//evil.example.com/sb/rest/v1/x', SUPABASE);
  assert.equal(relative, 'https://example.supabase.co/rest/v1/x');
  assert.doesNotMatch(relative, /evil\.example\.com/);
  // Без адреса проекта проксировать некуда.
  assert.equal(proxyTarget('/sb/rest/v1/x', ''), null);
});

test('список разрешённых префиксов не расширился незаметно', () => {
  assert.deepEqual(ALLOWED_SUPABASE_PATHS, ['/rest/v1/', '/auth/v1/', '/storage/v1/']);
});

test('из статики отдаётся index.html для маршрутов SPA', () => {
  const root = '/srv/site/dist';
  assert.equal(resolveStaticPath('/', root), join(root, 'index.html'));
  // Каждая тема — отдельный path URL; прямой переход и перезагрузка отдают SPA entry.
  for (const route of ['/passport', '/russia', '/world', '/brief', '/news', '/guide', '/about', '/status']) {
    assert.equal(resolveStaticPath(route, root), join(root, `${route.slice(1)}.html`), `${route} должен обслуживаться приложением`);
  }
  // Подразделы гида остаются обычными hash-якорями внутри его страницы.
  assert.equal(resolveStaticPath('/guide#guide-memory', root), join(root, 'guide.html'));
  assert.equal(resolveStaticPath('/guide-memory', root), join(root, 'index.html'));
  // Настоящий файл отдаётся как файл.
  assert.equal(resolveStaticPath('/assets/app-abc123.js', root), join(root, 'assets/app-abc123.js'));
  assert.equal(resolveStaticPath('/favicon.svg', root), join(root, 'favicon.svg'));
});

test('статик нельзя вытащить за пределы каталога сборки', () => {
  const root = '/srv/site/dist';
  const staysInside = (path) => {
    const resolved = resolveStaticPath(path, root);
    // Либо отказ, либо путь внутри каталога сборки — но никогда выше него.
    return resolved === null || resolved.startsWith(`${root}/`);
  };
  // Свойство, которое важно: ни один вход не даёт файла выше каталога сборки.
  for (const nasty of [
    '/../server/origin.mjs',
    '/assets/../../etc/passwd',
    '/%2e%2e/%2e%2e/etc/passwd',
    '/./../../..',
    '/assets/%2e%2e%2f%2e%2e%2fetc%2fpasswd',
  ]) {
    assert.ok(staysInside(nasty), `путь ${nasty} не должен выводить за каталог сборки`);
  }
  // Нулевой байт отбивается сразу: он ломает системные вызовы.
  assert.equal(resolveStaticPath('/index.html%00.png', root), null);
  // Эти пути нормализуются URL-парсером ещё до захода в каталог: наружу они не
  // выводят. Файла с расширением в сборке нет — отдаём 404; путь без
  // расширения считается маршрутом SPA и получает index.html, тоже из сборки.
  assert.equal(resolveStaticPath('/../server/origin.mjs', root), join(root, 'server/origin.mjs'));
  assert.equal(resolveStaticPath('/assets/../../etc/passwd', root), join(root, 'index.html'));
});

test('CSP не оставляет браузеру чужих адресов', () => {
  const headers = securityHeaders();
  assert.match(headers['Content-Security-Policy'], /connect-src 'self'/);
  assert.doesNotMatch(headers['Content-Security-Policy'], /supabase\.co|vercel\.app/);
  assert.equal(headers['X-Frame-Options'], 'DENY');
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
});

test('адаптер повторяет поведение res.status().json() из Vercel', () => {
  const calls = [];
  const res = {
    statusCode: 200,
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    getHeader(name) {
      return this.headers[name];
    },
    end(body) {
      calls.push({ status: this.statusCode, body });
    },
  };
  const adapted = vercelStyleResponse(res);
  adapted.status(405).json({ error: 'Method not allowed' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].status, 405);
  assert.deepEqual(JSON.parse(calls[0].body), { error: 'Method not allowed' });
  assert.equal(res.headers['Content-Type'], 'application/json; charset=utf-8');
});
