-- 01.11.2026: FRED перестал быть надёжным источником дневных рядов для S&P 500
-- и Brent. В 07:00-07:05 UTC fredgraph.csv отвечал 404 на SP500 и
-- DCOILBRENTEU («Error - St. Louis Fed»), в 07:10 снова 200. Программный
-- доступ к FRED с ноября 2025 требует зарегистрированного ключа, а бесплатный
-- ключ выдаётся только человеку через форму — сайт на такие регистрации не
-- опирается.
--
-- Замена (публичный чарт Yahoo, без ключа и без регистрации):
--   sp500_yahoo_gspc — ^GSPC, дневное закрытие. Тот же индекс: закрытие 28.10
--                      = 7 743,98, ровно то число, что приходило от FRED;
--   brent_yahoo_bzf  — BZ=F, фьючерс ближайшего месяца (NYMEX). Это НЕ спот
--                      EIA: 30.10 фьючерс 113,43 при споте 123,10. Поэтому
--                      display_name и notes называют инструмент фьючерсом.
--
-- Старые ряды FRED не удаляются (история — доказательство), но выключаются:
-- писать в них больше нечему, а включённый ряд без обновлений — мёртвый
-- указатель. Публичное представление asset_price_history_v1 отбирает строки
-- по i.enabled = true, поэтому панель актива сразу переключится на новый ряд
-- и не смешает два разных инструмента в одной линии.

insert into public.asset_instruments_v2
  (id, asset_key, provider, provider_symbol, display_name, instrument_type,
   currency, unit, frequency, is_primary, enabled, notes)
values
  ('sp500_yahoo_gspc', 'sp500', 'Yahoo Finance', '^GSPC', 'S&P 500 (Yahoo Finance ^GSPC, дневное закрытие)',
   'cash_index', 'USD', 'index_points', 'daily', true, true,
   'Индекс S&P 500, закрытие дня из публичного чарта Yahoo. Заменил FRED SP500 01.11.2026: у FRED программный доступ требует ключа, и его CSV отвечал 404 всплесками. Значения совпадают (28.10 = 7743,98), поэтому это тот же ряд, а не прокси.'),
  ('brent_yahoo_bzf', 'Brent', 'Yahoo Finance', 'BZ=F', 'Brent, фьючерс ближайшего месяца (Yahoo BZ=F)',
   'commodity_future', 'USD', 'usd_per_barrel', 'daily', true, true,
   'Фьючерс ближайшего месяца на Brent (NYMEX), закрытие дня. Заменил FRED/EIA спот DCOILBRENTEU 01.11.2026. Это другой инструмент: 30.10 фьючерс 113,43 против спота 123,10, поэтому подпись обязана называть фьючерс.')
on conflict (id) do update set
  asset_key = excluded.asset_key,
  provider = excluded.provider,
  provider_symbol = excluded.provider_symbol,
  display_name = excluded.display_name,
  instrument_type = excluded.instrument_type,
  currency = excluded.currency,
  unit = excluded.unit,
  frequency = excluded.frequency,
  is_primary = excluded.is_primary,
  enabled = excluded.enabled,
  notes = excluded.notes,
  updated_at = now();

update public.asset_instruments_v2
set enabled = false,
    is_primary = false,
    notes = notes || ' Отключён 01.11.2026: писать в ряд больше нечему (FRED отдаёт CSV только по зарегистрированному ключу и отвечал 404 всплесками). Историю оставили, ряд заменён на Yahoo.',
    updated_at = now()
where id in ('sp500_fred_sp500', 'brent_fred_dcoilbrenteu');
