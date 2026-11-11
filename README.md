# 🍒 Fruit Spin

Слот-игра для Telegram (Mini App): фрукты, джекпот 777, колесо фортуны, ежедневный бонус, уровни и достижения. Покупка монет за звёзды Telegram. Языки: English, Русский, Українська. Темы: фирменная, тёмная, светлая.

Монеты игровые: их нельзя вывести или обменять на деньги.

## Состав

| Файл | Что это |
|---|---|
| `index.html` | Вся игра одним файлом. Хостится на GitHub Pages |
| `worker/worker.js` | Сервер бота для оплаты звёздами. Разворачивается на Cloudflare Workers, на GitHub Pages не работает |

## 1. Игра на GitHub Pages

1. Создай репозиторий и загрузи файлы.
2. Settings → Pages → Source: **Deploy from a branch**, ветка `main`, папка `/ (root)` → Save.
3. Через минуту игра доступна по адресу `https://<логин>.github.io/<репозиторий>/`.

## 2. Бот в Telegram

1. В @BotFather: `/newapp` → выбери бота → укажи адрес игры из шага 1.
2. Или Bot Settings → Menu Button → тот же адрес.

## 3. Оплата звёздами (Cloudflare Worker)

1. Cloudflare → Workers & Pages → Create → Worker → вставь код из `worker/worker.js` → Deploy.
2. Settings → Variables and Secrets:
   - `BOT_TOKEN` (Secret): токен бота из @BotFather
   - `WEBHOOK_SECRET` (Secret): любая случайная строка
   - `APP_URL`: адрес игры из шага 1
3. Подключи вебхук, открыв в браузере:
   `https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://<адрес-воркера>/webhook&secret_token=<WEBHOOK_SECRET>`
4. В `index.html` в блоке `CONFIG` впиши адрес воркера в `apiUrl`.

Пакеты монет заданы в двух местах: `PACKS` в `index.html` и `PACKS` в `worker.js`. Меняй их одновременно.

## Настройки в `index.html` (блок `CONFIG`)

| Параметр | Что делает |
|---|---|
| `apiUrl` | Адрес воркера для оплаты. Пусто: оплата выключена |
| `leaderboardUrl` | Адрес сервера рейтинга. Пусто: в рейтинге только сам игрок |
| `startCoins` | Монеты на старте |
| `testMode` | `true` показывает кнопку «+10 000». **Перед запуском для игроков поставь `false`** |

Экономика игры (в начале скрипта): `SYMS` (шанс и выплата фруктов), `BENT_K`, `MODE1_BOOST`, `LEN_MULT`, `WHEEL` (призы колеса), `DAILY` (ежедневный бонус).

## Вывод звёзд

Звёзды от покупок копятся на балансе бота. Вывод через Fragment в TON-кошелёк: через 21 день после получения, от 1 000 звёзд, на аккаунте Telegram нужна двухэтапная проверка.
