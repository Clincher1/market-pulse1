# 🌐 vibe-audit livecheck: https://market-pulse1-eta.vercel.app

**4 находок — 🔴 0 / 🟡 1 / 🔵 3**

_Только внешние GET-запросы. Это не пентест — внутреннюю логику так не проверить._

## 🟡 Нет Content-Security-Policy
- URL: https://market-pulse1-eta.vercel.app
- Как чинить: Защита от XSS/инъекций. Добавь CSP-заголовок.

## 🔵 Нет X-Frame-Options
- URL: https://market-pulse1-eta.vercel.app
- Как чинить: Защита от кликджекинга (встраивание твоего сайта в чужой iframe).

## 🔵 Нет X-Content-Type-Options
- URL: https://market-pulse1-eta.vercel.app
- Как чинить: nosniff мешает браузеру угадывать MIME-типы.

## 🔵 Заголовок server раскрывает стек: Vercel
- URL: https://market-pulse1-eta.vercel.app
- Как чинить: Скрой версию сервера/фреймворка — она подсказывает известные уязвимости.
