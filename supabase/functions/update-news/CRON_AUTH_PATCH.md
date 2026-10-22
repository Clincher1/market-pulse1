# Патч авторизации для задеплоенной `update-news`

В репозитории пока **нет** `index.ts` этой функции: актуальный код существует только
в Supabase и виден там в минифицированном виде. Поэтому для `update-news` нельзя честно
приложить готовый полный файл, не рискуя заменить рабочую логику реконструкции наугад.

Cron уже отправляет `x-cron-secret`, а секрет `CRON_SECRET` уже добавлен в Edge
Function Secrets (по отчёту владельца от 2026-10-22). Осталось вставить проверку
первым оператором обработчика запроса.

## Перед редактированием

1. Сохрани текущую версию кода функции себе локально как резервную копию.
2. **Не отправляй этот код в чат**: в старом коде теоретически могут быть захардкожены ключи.
3. В редакторе Supabase найди обработчик:
   - сначала поиск `Deno.serve`;
   - если не нашлось — поиск `serve(`;
   - если написано `Deno.serve(handler)`, найди объявление `handler`.
4. Определи имя первой переменной запроса. Примеры:
   - `Deno.serve(async (req) => {` → имя `req`;
   - `serve(async (e) => {` → имя `e`;
   - `async function handler(request) {` → имя `request`.
5. Во фрагменте ниже замени каждое `__REQ__` этим именем и вставь фрагмент
   **сразу после открывающей `{` тела обработчика**.

## Фрагмент для минифицированного кода

```ts
{
  const __mpExpectedCronSecret = Deno.env.get("CRON_SECRET") ?? "";
  const __mpProvidedCronSecret = __REQ__.headers.get("x-cron-secret") ?? "";
  const __mpServiceRole =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_KEY") ?? "";
  const __mpIsServiceRole = Boolean(
    __mpServiceRole && __REQ__.headers.get("Authorization") === `Bearer ${__mpServiceRole}`,
  );
  let __mpDiff = __mpProvidedCronSecret.length === __mpExpectedCronSecret.length ? 0 : 1;
  for (let __mpI = 0; __mpI < __mpExpectedCronSecret.length; __mpI++) {
    __mpDiff |= (__mpProvidedCronSecret.charCodeAt(__mpI) || 0) ^
      __mpExpectedCronSecret.charCodeAt(__mpI);
  }
  if (!__mpIsServiceRole && (!__mpExpectedCronSecret || __mpDiff !== 0)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
}
```

## После деплоя

- Обычный вызов без `x-cron-secret` должен получать **401** и не должен запускать
  сбор новостей/Groq.
- Следующий запуск pg_cron должен пройти успешно, потому что cron уже шлёт заголовок.
- Проверь `cron.job_run_details` и логи функции. Если cron получает 401, сравни
  значение Vault-секрета и Edge Function Secret `CRON_SECRET` — они должны совпадать;
  значения никому не отправляй.

## Когда исходник будет восстановлен

Замени временный inline-блок читаемой функцией `isAuthorizedCron(req)` —
ровно той, что уже стоит в `update-tension/index.ts`, `update-forecasts/index.ts`
и `update-assets/index.ts`.
