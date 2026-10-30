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
 * @param {() => Promise<unknown>} run — одна попытка
 * @param {{ attempts?: number, delayMs?: number }} [options]
 */
export async function withRetry(run, { attempts = 2, delayMs = 250 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= Math.max(1, attempts); attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !isTransientError(error)) throw error;
      await sleep(delayMs * attempt);
    }
  }
  throw lastError;
}
