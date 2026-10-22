# update-news — удалена 2026-10-22

Старая публичная функция `update-news` (ESZIP без исходника в репозитории)
была удалена из Supabase после переключения cron на защищённую замену.

- Активный писатель новостей: `../update-news-v2/index.ts` (slug `update-news-v2`).
- pg_cron job 2 вызывает `update-news-v2` с заголовком `x-cron-secret` из Vault.
- Прямые вызовы старого slug теперь возвращают 404.
- `CRON_AUTH_PATCH.md` больше не нужен и удалён: патчить минифицированный
  ESZIP не потребовалось, потому что замена сохраняет тот же контракт
  `cached_news` и проверена dry-run/ограниченным запуском.

Не пересоздавайте slug `update-news` без in-code проверки `x-cron-secret`:
gateway `verify_jwt=true` сам по себе пропускает публичный publishable key.
