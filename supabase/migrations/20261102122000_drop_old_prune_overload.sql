-- После добавления третьего параметра осталась старая двухаргументная версия
-- prune_operational_logs, и вызов без аргументов стал неоднозначным
-- (42725: function public.prune_operational_logs() is not unique).
-- Оставляем только актуальную сигнатуру.
drop function if exists public.prune_operational_logs(integer, integer);
