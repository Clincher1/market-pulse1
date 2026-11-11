-- Первичный ряд = тот, который видит человек.
--
-- Что было не так (замер 11.11.2026 10:46 UTC по asset_instruments_v2):
--
--   gold  -> primary = gold_fred_nasdaq_index  (NASDAQQGLDI, 2381-3054 ПУНКТОВ ИНДЕКСА)
--            а на плитке стоит спот XAU/USD = 4048,2 ДОЛЛАРА ЗА УНЦИЮ;
--   btc   -> primary = btc_fred_coinbase (последняя точка 10.11, отстаёт на день),
--            а на плитке Kraken XBT/USD (11.11);
--   eurusd -> вторичный eurusd_fred_dexuseu отстал на 5 дней (06.11).
--
-- Почему это не косметика. По is_primary работают два места, которые считают
-- числа: evaluate-event-impacts-v2-shadow (доходность инструмента вокруг
-- события) и write-forecasts-v2-shadow (база прогноза). Для золота они брали
-- уровень индекса Nasdaq, то есть в 1,6 раза меньше плиточной цены: две
-- разные величины под одним словом «gold». Сам сайт ошибки не видел, потому
-- что панель истории ходит по явному белому списку, а не по is_primary.
--
-- Правило, которое теперь закреплено индексом: у asset_key ровно один
-- включённый первичный инструмент, и это тот ряд, который показывает плитка.
--
-- Строки истории НЕ удаляются: дубли остаются в asset_price_snapshots_v2,
-- отключается только запись/выборка. Историю не переписываем задним числом.

begin;

-- 1. Снимаем первичность у всех: дальше ставим ровно одну на asset_key.
update public.asset_instruments_v2
set is_primary = false,
    updated_at = now()
where is_primary;

-- 2. Золото: первичный — спот XAU/USD в долларах за унцию.
update public.asset_instruments_v2
set is_primary = true,
    updated_at = now()
where id = 'gold_twelve_xauusd_daily';

-- 3. BTC: первичный — спот Kraken.
update public.asset_instruments_v2
set is_primary = true,
    updated_at = now()
where id = 'btc_kraken_xbtusd_daily';

-- Brent, S&P 500 и EUR/USD уже указывали на те ряды, которые видны на плитке.
update public.asset_instruments_v2
set is_primary = true,
    updated_at = now()
where id in ('brent_yahoo_bzf', 'sp500_yahoo_gspc', 'eurusd_ecb_daily');

-- 4. Уровень индекса Nasdaq — не цена золота. Отключаем, историю оставляем.
update public.asset_instruments_v2
set enabled = false,
    notes = coalesce(notes, '') || ' Отключён 11.11.2026: это уровень индекса, а не цена спота. '
      || 'Пока он был первичным, оценки событий и прогнозы считали золото по индексу 2471, '
      || 'пока плитка показывала 4048 долларов за унцию.',
    updated_at = now()
where id = 'gold_fred_nasdaq_index';

-- 5. FRED/Coinbase оставляем включённым как независимую сверку ряда BTC
--    (у неё допуск 2 % в контракте данных), но не как источник истины.
update public.asset_instruments_v2
set notes = coalesce(notes, '') || ' Используется только для сверки рядов, первичный ряд — Kraken.',
    updated_at = now()
where id = 'btc_fred_coinbase';

-- 6. DEXUSEU отстаёт на пять дней от ЕЦБ и ничего не добавляет: отключаем.
update public.asset_instruments_v2
set enabled = false,
    notes = coalesce(notes, '') || ' Отключён 11.11.2026: последняя точка 06.11 при живом ЕЦБ 10.11; '
      || 'дубль одной и той же величины с отставанием.',
    updated_at = now()
where id = 'eurusd_fred_dexuseu';

-- 7. Инвариант вместо разовой уборки: два первичных ряда одного ключа
--    невозможны, и первичность нельзя поставить на выключенный инструмент.
create unique index if not exists asset_instruments_one_primary_per_key
  on public.asset_instruments_v2 (lower(asset_key))
  where is_primary and enabled;

commit;
