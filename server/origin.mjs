/**
 * Один домен вместо двух: статика + серверные функции + прокси к базе.
 *
 * Зачем это нужно. Браузер посетителя сегодня обращается к двум чужим
 * доменам: раздаче статики и к базе Supabase. В России первый местами
 * фильтруется, а часть операторов не пропускает `*.supabase.co` — тогда сайт
 * открывается, но данных нет. Здесь оба потока сводятся к одному адресу,
 * который стоит на своём домене в России:
 *
 *   GET /                 → dist/index.html (SPA)
 *   GET /assets/…         → собранные файлы с вечным кэшем
 *   GET /api/…            → api/russia-insights.js, russia-history.js, brief-image.js
 *   *   /sb/rest/v1/…     → https://<project>.supabase.co/rest/v1/…  (только чтение)
 *   GET /healthz          → «ok» для мониторинга доступности
 *
 * Запуск:  PORT=8080 SUPABASE_URL=https://….supabase.co node server/origin.mjs
 *
 * Никаких зависимостей: на дешёвом VPS npm-дерево из 300 пакетов — лишний
 * риск, а всё, что нужно, есть в стандартной библиотеке Node 22.
 */

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

/**
 * Пути API Supabase, которые разрешено проксировать. Это не открытый прокси:
 * всё остальное отдаётся 404, поэтому через наш домен нельзя ходить на
 * произвольные хосты. Анонимный ключ и так лежит в браузере, а RLS разрешает
 * ему только чтение — прокси не расширяет права, он лишь меняет адрес.
 */
export const ALLOWED_SUPABASE_PATHS = ['/rest/v1/', '/auth/v1/', '/storage/v1/'];

/** Заголовки, которые имеет смысл передать в Supabase и обратно. */
export const FORWARD_REQUEST_HEADERS = [
  'accept',
  'accept-profile',
  'apikey',
  'authorization',
  'content-type',
  'prefer',
  'range',
  'x-client-info',
];
export const FORWARD_RESPONSE_HEADERS = [
  'cache-control',
  'content-range',
  'content-type',
  'etag',
  'vary',
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

/**
 * Куда проксировать запрос. Возвращает null, если путь не разрешён — тогда
 * вызывающий отдаёт 404, а не пытается угадать.
 */
export function proxyTarget(rawUrl, supabaseUrl) {
  if (!supabaseUrl) return null;
  let url;
  try {
    url = new URL(rawUrl, 'http://localhost');
  } catch {
    return null;
  }
  if (!url.pathname.startsWith('/sb/')) return null;
  const rest = url.pathname.slice('/sb'.length);
  if (!ALLOWED_SUPABASE_PATHS.some((prefix) => rest.startsWith(prefix))) return null;
  const base = supabaseUrl.replace(/\/+$/, '');
  return `${base}${rest}${url.search}`;
}

/**
 * Заголовки безопасности. `connect-src 'self'` — главное отличие от
 * vercel.json: в браузере не остаётся ни одного адреса, кроме своего, поэтому
 * блокировка внешнего домена больше не может сломать загрузку данных.
 */
export function securityHeaders(origin) {
  const connect = origin ? `'self' ${origin}` : `'self'`;
  return {
    'Content-Security-Policy': [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      // Exact hash of the build-time WebSite JSON-LD; executable inline JS stays blocked.
      "script-src 'self' 'sha256-mPRvFtvocZwUS+bJkgPQTLUVPMssKjqDe7cN2piY4qc='",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
      "img-src 'self' data: blob:",
      "frame-src 'none'",
      "media-src 'none'",
      `connect-src ${connect}`,
      "worker-src 'self' blob:",
      "manifest-src 'self'",
      "form-action 'self'",
      'upgrade-insecure-requests',
    ].join('; '),
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
  };
}

/**
 * Какой файл отдать по пути. Отдельная функция, потому что здесь легко
 * выйти за пределы каталога (`..`) и потому что это единственное место, где
 * решается судьба SPA-маршрутов. Возвращает абсолютный путь или null.
 */
export function resolveStaticPath(rawUrl, rootDir) {
  const root = resolve(rootDir);
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(rawUrl, 'http://localhost').pathname);
  } catch {
    return null;
  }
  if (pathname.includes('\0')) return null;

  const isFileRequest = extname(pathname) !== '';
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const candidate = normalize(join(root, relative));
  if (candidate !== root && !candidate.startsWith(root + sep)) return null;

  // Known routes have build-time HTML. Unknown paths must not become soft 404s.
  const route = pathname.replace(/\/+$/, '');
  if (['/passport', '/russia', '/world', '/brief', '/news', '/guide', '/about', '/status'].includes(route)) {
    return join(root, `${route.slice(1)}.html`);
  }
  if (pathname === '/') return join(root, 'index.html');
  return isFileRequest ? candidate : null;
}

/** Мини-адаптер к стилю Vercel: `res.status(200).json(...)` и `res.end(buffer)`. */
export function vercelStyleResponse(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (value) => {
    if (!res.getHeader('Content-Type')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    res.end(JSON.stringify(value));
    return res;
  };
  res.send = (value) => res.end(value);
  res.redirect = (location, code = 302) => {
    res.statusCode = code;
    res.setHeader('Location', location);
    res.end();
    return res;
  };
  return res;
}

async function serveFile(filePath, req, res, headers) {
  let info;
  try {
    info = await stat(filePath);
  } catch {
    return false;
  }
  if (!info.isFile()) return false;

  const type = MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
  res.setHeader('Content-Type', type);
  res.setHeader('Content-Length', String(info.size));
  // Хэшированные файлы сборки не меняются никогда, HTML — всегда свежий.
  res.setHeader(
    'Cache-Control',
    /\.(?:html|xml|txt)$/.test(filePath) ? 'no-cache' : 'public, max-age=31536000, immutable',
  );
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);

  if (req.method === 'HEAD') {
    res.end();
    return true;
  }
  createReadStream(filePath).pipe(res);
  return true;
}

async function proxyRequest(req, res, target) {
  const headers = {};
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = req.headers[name];
    if (value !== undefined) headers[name] = value;
  }
  let upstream;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : req,
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    // Без честного 502 сайт показал бы пустые плитки и «—» без причины.
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ error: 'upstream_unreachable', detail: String(error?.message ?? error) }));
    return;
  }
  res.statusCode = upstream.status;
  for (const name of FORWARD_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) res.setHeader(name, value);
  }
  const body = Buffer.from(await upstream.arrayBuffer());
  res.setHeader('Content-Length', String(body.length));
  res.end(req.method === 'HEAD' ? undefined : body);
}

/**
 * Собирает сервер. Вынесено из `listen`, чтобы тесты могли поднимать его на
 * случайном порту и не зависеть от рабочего каталога.
 */
export function createOriginServer({ rootDir, supabaseUrl, apiDir, log = () => {} }) {
  const api = new Map();
  const apiModules = {
    '/api/russia-insights': 'russia-insights.js',
    '/api/russia-history': 'russia-history.js',
    '/api/brief-image': 'brief-image.js',
  };

  const loadApi = async (pathname) => {
    const file = apiModules[pathname];
    if (!file || !apiDir) return null;
    if (!api.has(pathname)) {
      const loading = import(new URL(`file://${resolve(apiDir, file)}`).href);
      api.set(pathname, loading);
      // Упавший импорт не должен остаться в кэше навсегда: файл мог не
      // доехать при выкладке (или быть заменён посреди неё), и один сбой на
      // старте сделал бы адрес мёртвым до перезапуска процесса. Снимаем
      // запись с ошибкой, чтобы следующая попытка читала диск заново.
      loading.catch(() => {
        if (api.get(pathname) === loading) api.delete(pathname);
      });
    }
    const module = await api.get(pathname);
    return module.default ?? module.handler ?? null;
  };

  return createServer(async (req, res) => {
    const started = Date.now();
    const url = req.url ?? '/';
    const pathname = url.split('?')[0];

    if (pathname === '/healthz') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end('ok');
      log(`${req.method} ${pathname} 200 ${Date.now() - started}ms`);
      return;
    }

    try {
      if (pathname.startsWith('/sb/')) {
        const target = proxyTarget(url, supabaseUrl);
        if (!target) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: 'proxy_path_not_allowed' }));
          log(`${req.method} ${pathname} 404 ${Date.now() - started}ms`);
          return;
        }
        await proxyRequest(req, res, target);
        log(`${req.method} ${pathname} ${res.statusCode} ${Date.now() - started}ms`);
        return;
      }

      if (apiModules[pathname]) {
        // Even a module-load failure is an API response and must not be cached.
        res.setHeader('Cache-Control', 'no-store');
        const handler = await loadApi(pathname);
        if (!handler) {
          res.statusCode = 404;
          res.end('not found');
          return;
        }
        vercelStyleResponse(res);
        await handler(req, res);
        log(`${req.method} ${pathname} ${res.statusCode} ${Date.now() - started}ms`);
        return;
      }

      // Match the existing Vercel compatibility redirect, including old archive links.
      if (/^\/memory(?:\/|$)/.test(pathname)) {
        res.writeHead(307, { Location: '/', 'Cache-Control': 'no-store' });
        res.end();
        return;
      }

      const file = resolveStaticPath(url, rootDir);
      if (file && (await serveFile(file, req, res, securityHeaders()))) {
        log(`${req.method} ${pathname} ${res.statusCode} ${Date.now() - started}ms`);
        return;
      }

      res.statusCode = 404;
      if (await serveFile(join(resolve(rootDir), '404.html'), req, res, securityHeaders())) {
        log(`${req.method} ${pathname} 404 ${Date.now() - started}ms`);
        return;
      }
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('not found');
      log(`${req.method} ${pathname} 404 ${Date.now() - started}ms`);
    } catch (error) {
      log(`${req.method} ${pathname} 500 ${Date.now() - started}ms: ${error?.message ?? error}`);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
      }
      if (!res.writableEnded) res.end(JSON.stringify({ error: 'internal_error' }));
    }
  });
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href;

if (isMain) {
  const port = Number(process.env.PORT ?? 8080);
  const rootDir = process.env.STATIC_DIR ?? resolve('dist');
  const apiDir = process.env.API_DIR ?? resolve('api');
  const supabaseUrl = process.env.SUPABASE_URL ?? 'https://hekzplfftannlzwvgwwm.supabase.co';

  const server = createOriginServer({
    rootDir,
    apiDir,
    supabaseUrl,
    log: (line) => console.log(line),
  });
  // Слушаем все интерфейсы: контейнеры на хостингах ходят в приложение по
  // внутреннему адресу, а 127.0.0.1 извне контейнера недоступен.
  server.listen(port, '0.0.0.0', () => {
    console.log(`origin server: http://0.0.0.0:${port}`);
    console.log(`static: ${rootDir}`);
    console.log(`api:    ${apiDir}`);
    console.log(`proxy:  /sb/* → ${supabaseUrl}`);
  });
}
