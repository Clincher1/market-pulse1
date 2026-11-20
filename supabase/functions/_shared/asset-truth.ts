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
 * Одна оговорка, без которой проверка врёт: ряд хранит ЗАКРЫТЫЕ наблюдения,
 * а цена на плитке может быть кавычкой более поздней даты (внутридневной ход
 * Brent, S&P 500). Тогда база изменения — последнее закрытие, а не
 * предпоследнее, и цена заведомо не равна последней точке ряда. Это не
 * расхождение, а другая база, и она названа в вердикте (`basis: "quote"`).
 * 03.11.2026 без этой оговорки проверка красила в красный честную плитку:
 * цена $106.61 против закрытия 104.77 (это +1.76 %) считалась как −10.94 %
 * по двум последним закрытиям.
 *
 * Gold и BTC используют тот же контракт: более поздняя котировка
 * сравнивается с последним сохранённым закрытием. Без дат база неизвестна.
 */
const SUPPORTED = new Set(["brent", "sp500", "usd-eur", "gold", "btc"]);

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
  /** На чём построено изменение: на двух закрытиях ряда или на кавычке. */
  basis?: "series" | "quote";
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
 * Для gold/BTC даты обязательны: без них база сравнения не проверена.
 */
export function checkChangeAgainstSeries(row: AssetRowLike): ChangeVerdict {
  const id = String(row.id ?? "");
  if (!SUPPORTED.has(id)) {
    return { checked: false, ok: true, reason: "неизвестный контракт ряда" };
  }
  if (id === "gold" || id === "btc") {
    const dates = Array.isArray(row.spark_dates) ? row.spark_dates : [];
    const values = Array.isArray(row.sparkline) ? row.sparkline : [];
    if (!isoDate(row.as_of) || dates.length !== values.length || !dates.length ||
        dates.some((date, index) => !isoDate(String(date)) || (index > 0 && String(date) <= String(dates[index - 1])))) {
      return { checked: false, ok: true, reason: "база кавычки не проверена: отсутствуют согласованные даты" };
    }
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

  const stored = typeof row.change === "number" && Number.isFinite(row.change) ? row.change : null;

  // Кавычка свежее последнего закрытия? Тогда изменение считается от последнего
  // закрытия к цене, а не между двумя закрытиями: ряд закрытий за сегодня ещё
  // не пополнился, и требовать совпадения с ним — значит требовать неправды.
  const lastSeriesDate = lastSeriesDateIso(row);
  const asOfDate = isoDate(row.as_of);
  const priceValue = parsePriceNumber(row.price ?? null);

  // Одной даты для этого мало. 08–09.11.2026 проверка восемь часов подряд
  // краснела на верной плитке: ряд заканчивался пятницей 06.11, цена была
  // живой кавычкой понедельника, но `as_of` в тот момент тоже стоял 06.11 —
  // писатель обновил цену раньше, чем отметку времени. Формулы «дата позже»
  // здесь не хватает, потому что дата совпала.
  //
  // Признак, который отличает кавычку от закрытия, наблюдаемый: цена просто
  // не равна последней точке ряда. Если она равна (в пределах той точности,
  // с какой напечатана), то это и есть закрытие, и работают две точки ряда.
  // Именно этот случай ловил настоящий дефект 01.11: цена = последняя точка,
  // а изменение подменили нулём.
  const priceEqualsLast =
    priceValue !== null && formatLikePrice(last, row.price) === formatLikePrice(priceValue, row.price);
  const quoteIsNewer = Boolean(
    lastSeriesDate &&
      priceValue !== null &&
      (Boolean(asOfDate && asOfDate > lastSeriesDate) || !priceEqualsLast) &&
      // Кавычка не может быть старше ряда: если as_of раньше последней точки,
      // расхождение — это расхождение, а не другая база.
      (!asOfDate || asOfDate >= lastSeriesDate),
  );

  if (quoteIsNewer) {
    if (!(priceValue !== null && priceValue > 0)) {
      return { checked: false, ok: true, reason: "цена-кавычка не разобрана, сверка не применима", basis: "quote" };
    }
    const expectedFromQuote = ((priceValue - last) / last) * 100;
    if (stored === null) {
      return {
        checked: true,
        ok: false,
        expected: expectedFromQuote,
        stored: null,
        priceMismatch: null,
        basis: "quote",
        reason: "изменение не сохранено",
      };
    }
    return {
      checked: true,
      ok: Math.abs(stored - expectedFromQuote) <= CHANGE_TOLERANCE_PP,
      expected: expectedFromQuote,
      stored,
      priceMismatch: null,
      basis: "quote",
    };
  }

  const expected = ((last - previous) / previous) * 100;

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
    return { checked: true, ok: false, expected, stored: null, priceMismatch, basis: "series", reason: "изменение не сохранено" };
  }
  const ok = Math.abs(stored - expected) <= CHANGE_TOLERANCE_PP && !priceMismatch;
  return { checked: true, ok, expected, stored, priceMismatch, basis: "series" };
}

/** Похоже ли на дату вида `2026-11-03` (или ISO-момент). */
function instanceofDate(value: unknown): boolean {
  return /^\d{4}-\d{2}-\d{2}/.test(String(value ?? ""));
}

/** `"2026-11-03 07:30:01+00"` → `"2026-11-03"`; мусор → null. */
function isoDate(value: string | null | undefined): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(value ?? ""));
  return match ? match[1] : null;
}

/** Дата последней точки опубликованного ряда; без дат — null. */
function lastSeriesDateIso(row: AssetRowLike): string | null {
  const dates = Array.isArray(row.spark_dates) ? row.spark_dates : [];
  const last = dates.at(-1);
  return instanceofDate(last) ? isoDate(last) : null;
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
