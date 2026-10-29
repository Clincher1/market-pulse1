/**
 * Один планировщик на все фоновые обновления страницы.
 *
 * Раньше каждый раздел держал собственный setInterval на 5 минут. Пока
 * вкладка скрыта, они продолжали ходить в базу: десять независимых таймеров
 * на один открытый сайт, которых никто не видит. Здесь два правила:
 *
 * 1. Скрытая вкладка не опрашивает базу вообще — таймер снимается.
 * 2. Когда вкладку вернули и данные старше интервала, обновление происходит
 *    сразу, а не через оставшиеся минуты.
 *
 * Функция не бросает ошибок и не логирует: решение, что делать со сбоем,
 * остаётся за вызывающим кодом.
 */

export const POLL_INTERVAL_MS = 300_000;

const canUseDom = () =>
  typeof window !== 'undefined' && typeof document !== 'undefined';

/**
 * Запускает периодическое обновление с паузой на скрытой вкладке.
 * Возвращает функцию остановки — её нужно вызвать при размонтировании.
 */
export function startPolling(
  run: () => void,
  intervalMs: number = POLL_INTERVAL_MS,
): () => void {
  if (!canUseDom()) return () => {};

  let timer: number | null = null;
  let stopped = false;
  let lastRun = Date.now();

  const clear = () => {
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  };

  const tick = () => {
    if (stopped) return;
    if (document.visibilityState === 'hidden') return;
    lastRun = Date.now();
    run();
  };

  const onVisibilityChange = () => {
    if (stopped) return;
    if (document.visibilityState === 'hidden') {
      clear();
      return;
    }
    if (Date.now() - lastRun >= intervalMs) tick();
    if (timer === null) timer = window.setInterval(tick, intervalMs);
  };

  if (document.visibilityState !== 'hidden') {
    timer = window.setInterval(tick, intervalMs);
  }
  document.addEventListener('visibilitychange', onVisibilityChange);

  return () => {
    stopped = true;
    clear();
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
