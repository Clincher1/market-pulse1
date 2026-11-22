# Отправка snapshot через выделенное GitHub App

## Причина и согласованное решение

Ручной прогон [45003492254](https://github.com/Clincher1/market-pulse1/actions/runs/45003492254)
успешно прочитал Supabase, выполнил проверки и локальный commit, но push от
`GITHUB_TOKEN` был отклонён branch protection/repository rules (подтверждено annotation).
Владелец выбрал прямой автоматический push через выделенное приложение вместо
ежедневного PR с ручным слиянием.

App **market-pulse1-snapshot-clincher1**, ID **5872216**, создано владельцем.
Владелец сообщил об установке только на `market-pulse1` и сохранил:

- Repository variable `SNAPSHOT_APP_ID`: `5872216`.
- Repository secret `SNAPSHOT_APP_PRIVATE_KEY`: приватный PEM целиком. Никогда не
  пересылать в чат, не логировать/коммитить; показанный ранее ключ следует отозвать.
- Прежние `SUPABASE_URL` (variable) и `SNAPSHOT_SUPABASE_READ_KEY` (secret) остаются
  отдельными реквизитами чтения Supabase; приватный ключ GitHub App их не заменяет.

[Credential check 45008956659](https://github.com/Clincher1/market-pulse1/actions/runs/45008956659)
подтвердил App ID/ключ, выдачу installation token, доступ к snapshot и ограничение
**выданного тестового токена** одним репозиторием. Тестовый токен был read-only,
после job отозван. Этот тест не доказывает push/bypass или область всей установки.
Саму область установки владелец сузил вручную. Проверка не раскрывала секретов.

## Проверенные настройки защиты

Read-only GitHub API подтвердил после действий владельца:

- Старое classic branch protection удалено: `protection.enabled=false`, но
  `protected=true`, так как rulesets активны. Это НЕ отключение всей защиты main.
- `main-1`, ID **27836234**, Active, только `refs/heads/main`: `deletion` и
  `non_fast_forward`, **bypass_actors=[]**. Даже приложению не разрешено удаление
  main или force push.
- `main-2`, ID **27836235**, Active, только `refs/heads/main`: PR и обязательный
  `verify` от GitHub Actions (integration_id 15368). Сохранено прежнее исключение
  Repository admin; добавлено только App **5872216**, режим `always`.

Это сознательное исключение из PR/status-check правил для данного приложения.
GitHub не ограничивает это исключение одним JSON-файлом; allowlist snapshot
обеспечивается workflow, а Contents: write само по себе даёт право менять содержимое
репозитория. Код workflow поэтому требует ревью. Этот PR не меняет настройки правил.

## Граница токена в workflow

1. `GITHUB_TOKEN` имеет только Contents: read, checkout `persist-credentials: false`.
   Этот репозиторий публичный; последующий fetch main может быть анонимным.
2. Получение снимка, семь календарных дней на каждое наблюдение, тесты/typecheck/
   lint/build/Deno, file allowlist и проверка SHA main остаются до commit/push.
3. После локального commit проверяется фиксированный разрешённый App ID. Только
   затем pinned `actions/create-github-app-token` создаёт токен с явным
   `permission-contents: write`, owner `Clincher1`, repositories `market-pulse1`.
   Нет Actions/PR/Administration permissions и нет области всех репозиториев.
4. Токен доступен только действию создания токена и финальному шагу push, не тестам,
   npm install, сборке или updater. Приватный ключ передаётся только pinned action.
5. Auth header передаётся через process-local `GIT_CONFIG_*` только команде
   `git push origin HEAD:main`: нет записи токена в remote URL, git config или файл.
   Не выводятся токен, производный Basic auth header, окружение или raw remote output.
6. Action по завершении job отзывает токен (`skip-token-revoke: 'false'`). Отказ
   выдачи/использования токена не приводит к fallback на GITHUB_TOKEN или другой ключ.
7. Сохраняются snapshot-only staging, запрет force/rebase/retry, отказ при сдвиге main.
   Новый конкурентный commit после SHA-проверки остановит обычный fast-forward push.

Изменения не расширяют права интеграции Arena и не требуют токена администратора.

## Что ещё не доказано

Новый основной workflow не запускался из ветки и не отправлял тестовый commit в main.
Успешная выдача write token, фактический App push через настроенное исключение,
production deploy для его SHA и новый статический HTML должны быть проверены первым
**ручным запуском владельца после отдельного одобрения и слияния PR**. Агент не
сливает этот PR и не запускает основной workflow без отдельного указания.

App push (в отличие от GITHUB_TOKEN push) может вызвать downstream Actions/Vercel.
Нужны production READY/PROMOTED с SHA snapshot-коммита и соответствующие exportedAt /
BZ=F / ^GSPC / XAU в исходном HTML. Пока этого нет — автоматическая публикация не
объявляется работающей. После успешного сквозного запуска дальнейшие обновления
идут по cron 03:00 UTC без ежедневного ручного подтверждения; ошибки остаются видимыми
в Actions. Одна успешная проверка не доказывает стабильность во времени.
