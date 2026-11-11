/**
 * Один повтор для источника, который «не ответил вовремя».
 *
 * Зачем: самопроверка дважды за сутки ловила красное «Блок Россия наполнен»,
 * и оба раза оно закрывалось само через час. Мосбиржа и SOAP-сервис ЦБ
 * периодически отвечают дольше 6,5 секунды, и один такой таймаут выбивал
 * индикатор из снимка: плитка пропадала честно, но зря — через полсекунды
 * источник отвечал нормально.
 *
 * Повтор здесь не подставляет ничего выдуманного: он ещё раз спрашивает тот
 * же источник. Если и второй раз не вышло, ошибка уходит наверх как раньше, и
 * плитки просто нет.
 *
 * Повторяем только то, что имеет смысл повторять: таймаут, обрыв сети, 429 и
 * 5xx. Ошибка разбора (источник ответил, но формат другой) не повторяется:
 * второй такой же ответ ничего не изменит, а время потратит.
 */

export function isTransientError(error) {
  if (!error) return false;
  if (error.name === 'AbortError' || error.name === 'TimeoutError') return true;
  const message = String(error.message ?? '');
  if (/HTTP (429|5\d\d)/.test(message)) return true;
  return error.name === 'TypeError' || /fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up/i.test(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Сколько источник попросил подождать (`Retry-After`), если попросил.
 *
 * Заголовок приходит секундами или датой; timedFetch кладёт разобранные
 * миллисекунды в error.retryAfterMs. Если он есть — он главнее нашего
 * бэкоффа: это единственное, что источник говорит нам словами.
 */
export function retryAfterMs(error) {
  const value = error?.retryAfterMs;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Пауза перед повтором: линейная, но с разбросом ±25 %.
 *
 * Без разброса все ленты, получившие отказ в одну секунду, повторяют запрос
 * тоже в одну секунду. Со стороны источника это залп — ровно то, на что
 * срабатывает защита от ботов. Разброс делает повторы непохожими.
 */
export function retryDelayMs(attempt, error, random = Math.random) {
  const jittered = Math.round(delayFor(attempt) * (0.75 + random() * 0.5));
  return Math.max(jittered, retryAfterMs(error));
}

function delayFor(attempt) {
  return DEFAULT_DELAY_MS * Math.max(1, attempt);
}

export const DEFAULT_DELAY_MS = 250;
/**
 * Дольше этого запуск ждать не станет: если источник просит больше, повтор
 * сейчас — нарушение его же просьбы, поэтому мы честно сдаёмся и не долбим.
 */
export const MAX_WAIT_MS = 5000;

function hostKey(url) {
  try {
    return new URL(url).host;
  } catch {
    return String(url);
  }
}

/**
 * Очередь по хосту: не больше `limit` запросов к одному адресу одновременно.
 *
 * Шестнадцать RSS-лент — это не шестнадцать серверов, а восемь адресов, и
 * залп из одного серверлес-вызова выглядит со стороны источника как атака.
 * У самого ЦБ в одном снимке шесть запросов к cbr.ru — по одному на каждую
 * валюту, ставку, резервы и инфляцию.
 *
 * Очередь передаёт слот напрямую: счётчик уменьшается только когда очередь
 * пуста, иначе два ожидающих могли бы проскочить в освободившийся слот.
 */
export function hostQueue({ limit = 1 } = {}) {
  const slots = new Map();
  return async function runOnHost(url, run) {
    const key = hostKey(url);
    let slot = slots.get(key);
    if (!slot) {
      slot = { active: 0, queue: [] };
      slots.set(key, slot);
    }
    if (slot.active >= limit) {
      await new Promise((resolve) => slot.queue.push(resolve));
    } else {
      slot.active += 1;
    }
    try {
      return await run();
    } finally {
      const next = slot.queue.shift();
      if (next) next();
      else slot.active -= 1;
    }
  };
}

export async function withRetry(run, { attempts = 2, delayMs = DEFAULT_DELAY_MS, random = Math.random } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= Math.max(1, attempts); attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !isTransientError(error)) throw error;
      const waitMs = Math.max(retryDelayMs(attempt, error, random), Math.round(delayMs * Math.max(1, attempt)));
      // Источник просит паузу длиннее бюджета запуска — не повторяем вовсе.
      if (retryAfterMs(error) > MAX_WAIT_MS) throw error;
      await sleep(waitMs);
    }
  }
  throw lastError;
}

/**
 * Жёсткий срок на задачу внутри запуска.
 *
 * Очередь по хосту бережёт источник, но у неё есть цена: если он лежит,
 * задачи копятся, и запуск упирается в 30 секунд платформы — тогда страница
 * отвечает не «плитки нет», а ошибкой целиком. Срок возвращает честный
 * частный отказ: этой плитки в снимке не будет, остальные будут.
 */
export function withinDeadline(promise, deadline) {
  const left = deadline - Date.now();
  // Имя источника в сообщение не входит: вызывающая сторона и так печатает
  // «Frank Media: …», и без этого получалось «Frank Media: Frank Media: …».
  if (left <= 0) return Promise.reject(new Error('срок запуска истёк'));
  let timer;
  const guard = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('не уложился в срок запуска')), left);
  });
  // race подписывается на оба промиса, поэтому позднее падение задачи не
  // остаётся необработанным.
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
}

/**
 * Срок последней задачи: платформа даёт 30 секунд, проверка `ru_insights`
 * ждёт 25. Отвечаем раньше обоих — иначе честный частичный снимок приходит
 * слишком поздно и считается таймаутом.
 */
export const RUN_DEADLINE_MS = 18000;

/**
 * Срок для лент. Их шестнадцать, каждая мелкая и обновляется каждую минуту,
 * поэтому одна зависшая лента не имеет права задерживать снимок: она
 * выпадает и возвращается на следующем запросе.
 */
export const FEED_DEADLINE_MS = 8000;
