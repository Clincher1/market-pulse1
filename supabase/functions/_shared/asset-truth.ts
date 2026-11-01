/**
 * Сверка опубликованной строки кэша с её же рядом.
 *
 * Зачем это отдельным модулем: почти все дефекты, которые находились на
 * проде, были не «источник молчит», а «два числа об одном и том же не
 * сходятся». Источник отвечал 200, кэш свежий, проверка `assets_fresh`
 * зелёная — и при этом на плитке стояло `0 %` вместо `−1,26 %`.
 *
 * Правило, которое здесь проверяется, одно:
 *   если изменение считается по опубликованному ряду, то оно обязано
 *   совпадать с разностью двух последних точек этого ряда, а цена — с
 *   последней точкой.
 *
 * Почему не для всех рядов: у золота и BTC цена приходит из кавычки, а база
 * изменения — `previous_close` той же кавычки, а не два последних закрытия
 * нашего ряда. Сравнивать их — значит получать «расхождение» там, где всё
 * верно. Поэтому такие ряды явно перечислены и пропускаются, а не угадываются
 * по эвристике.
 */

/** Ряды, у которых цена И ЕСТЬ последнее закрытие опубликованного ряда. */
const CLOSE_DRIVEN = new Set(["brent", "sp500", "usd-eur"]);

/** Расхождение в процентных пунктах, которое ещё можно списать на округление. */
const CHANGE_TOLERANCE_PP = 0.02;

export interface AssetRowLike {
  id: string;
  name?: string | null;
  price?: string | null;
  change?: number | null;
  sparkline?: unknown;
  spark_dates?: unknown;
  as_of?: string | null;
}

/**
 * `"$113.43"` → 113.43, `"7,580"` → 7580, `"0.8951"` → 0.8951.
 * Запятая здесь — разделитель тысяч: строки собираются в en-US.
 */
export function parsePriceNumber(text: string | null | undefined): number | null {
  if (!text) return null;
  const cleaned = String(text).replace(/[^0-9.,-]/g, "");
  if (!cleaned) return null;
  const numeric = cleaned.includes(".") ? cleaned.replace(/,/g, "") : cleaned.replace(/,/g, "");
  const value = Number(numeric);
  return Number.isFinite(value) ? value : null;
}

/** Сколько знаков после запятой реально напечатано в цене. */
export function priceDigits(text: string | null | undefined): number | null {
  if (!text) return null;
  const cleaned = String(text).replace(/[^0-9.,]/g, "");
  if (!cleaned) return null;
  const dot = cleaned.indexOf(".");
  return dot === -1 ? 0 : cleaned.length - dot - 1;
}

/** То же число, напечатанное так же, как цена: `114.87999…` при `"$113.43"` → `"114.88"`. */
export function formatLikePrice(value: number, text: string | null | undefined): string | null {
  const digits = priceDigits(text);
  if (digits === null || !Number.isFinite(value)) return null;
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function seriesValues(row: AssetRowLike): number[] {
  const values = Array.isArray(row.sparkline) ? row.sparkline : [];
  return values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
}

export interface ChangeVerdict {
  /** Проверка применима к этому ряду. */
  checked: boolean;
  /** Всё сходится (или проверка неприменима — тогда расхождений не выдумываем). */
  ok: boolean;
  /** Почему проверка пропущена — словами, а не пустотой. */
  reason?: string;
  expected?: number;
  stored?: number | null;
  /** Цена не совпала с последней точкой ряда. */
  priceMismatch?: { printed: string; fromSeries: string } | null;
}

/**
 * Сходится ли опубликованное изменение с опубликованным рядом.
 *
 * Возвращает `checked: false` для рядов, где цена — кавычка (золото, BTC):
 * там база изменения живёт в ответе источника, а не в нашем ряду закрытий.
 */
export function checkChangeAgainstSeries(row: AssetRowLike): ChangeVerdict {
  const id = String(row.id ?? "");
  if (!CLOSE_DRIVEN.has(id)) {
    return { checked: false, ok: true, reason: "цена из кавычки, база — из ответа источника" };
  }
  const values = seriesValues(row);
  if (values.length < 2) {
    return { checked: false, ok: true, reason: "в ряду меньше двух точек" };
  }
  const last = values[values.length - 1];
  const previous = values[values.length - 2];
  if (!(previous > 0) || !(last > 0)) {
    return { checked: false, ok: true, reason: "в ряду нулевые значения" };
  }

  const expected = ((last - previous) / previous) * 100;
  const stored = typeof row.change === "number" && Number.isFinite(row.change) ? row.change : null;

  // Сравниваем именно числа, а не строки: у цены в кэше есть знак валюты
  // («$113.43»), у значения ряда — нет. Символ валюты не должен выглядеть
  // расхождением, а вот другая цифра — должна.
  const printed = row.price ? String(row.price).replace(/[^0-9.,-]/g, '') : '';
  const fromSeries = formatLikePrice(last, row.price);
  const priceMismatch =
    fromSeries !== null && printed && fromSeries !== printed
      ? { printed: String(row.price), fromSeries }
      : null;

  if (stored === null) {
    return { checked: true, ok: false, expected, stored: null, priceMismatch, reason: "изменение не сохранено" };
  }
  const ok = Math.abs(stored - expected) <= CHANGE_TOLERANCE_PP && !priceMismatch;
  return { checked: true, ok, expected, stored, priceMismatch };
}

/**
 * Не противоречит ли подпись ряда типу инструмента из реестра.
 *
 * 01.11.2026 Brent переехал со спота EIA на фьючерс NYMEX, а имя в кэше
 * осталось «Brent». Читатель видел одно слово для двух разных инструментов,
 * расходящихся на 8 %. Здесь проверяется именно это: если реестр говорит
 * «фьючерс», подпись обязана это сказать; если «спот» — не имеет права.
 */
export function checkNameMatchesInstrument(
  name: string | null | undefined,
  instrumentType: string | null | undefined,
): { ok: boolean; reason?: string } {
  const label = String(name ?? "").toLowerCase();
  const type = String(instrumentType ?? "");
  if (!label) return { ok: false, reason: "у ряда нет подписи" };
  const saysFuture = label.includes("фьючерс") || label.includes("future");
  if (type === "commodity_future" && !saysFuture) {
    return { ok: false, reason: "реестр называет инструмент фьючерсом, а подпись — нет" };
  }
  if (type === "commodity_spot" && saysFuture) {
    return { ok: false, reason: "реестр называет инструмент спотом, а подпись — фьючерсом" };
  }
  return { ok: true };
}
