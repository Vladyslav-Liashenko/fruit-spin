# 🍒 Fruit Spin

Слот-игра для Telegram (Mini App): фрукты, джекпот 777, колесо фортуны, ежедневный бонус, уровни и достижения. Покупка монет за звёзды Telegram. Языки: English, Русский, Українська. Темы: фирменная, тёмная, светлая.

Бот: [@FruitSpinPlayBot](https://t.me/FruitSpinPlayBot) · Игра: https://vladyslav-liashenko.github.io/fruit-spin/

Монеты игровые: их нельзя вывести или обменять на деньги.

## Состав

| Файл | Что это |
|---|---|
| `index.html` | Вся игра одним файлом. Хостится на GitHub Pages |
| `worker/worker.js` | Сервер бота для оплаты звёздами. Разворачивается на Cloudflare Workers |
| `brand/` | Логотип, аватар бота 640×640, обложка Mini App 640×360 |

Токен бота не хранится ни в одном файле репозитория.

## Запуск

Порядок важен: сначала адреса, потом связки между ними.

1. **GitHub Pages:** Settings → Pages → Deploy from a branch → `main` → `/ (root)` → Save. Дождись зелёной галочки в Actions.
2. **BotFather:** вставь адрес игры в Main App, Direct Link и Menu Button.
3. **Cloudflare:** Workers & Pages → Create → Hello World → назови Worker → Deploy → Edit code → вставь `worker/worker.js` → Deploy.
4. **Cloudflare, переменные** (Settings → Variables and Secrets):

   | Имя | Тип | Значение |
   |---|---|---|
   | `BOT_TOKEN` | Secret | токен бота из @BotFather |
   | `WEBHOOK_SECRET` | Secret | любая случайная строка из латиницы и цифр |
   | `APP_URL` | Text | `https://vladyslav-liashenko.github.io/fruit-spin/` |
   | `SUPPORT` | Text | контакт поддержки по оплате, например `@твой_ник` |
   | `ADMIN_ID` | Text | твой Telegram ID из @userinfobot: уведомления об оплатах, сообщения игроков, команда `/refund` |

   Settings → Bindings → KV namespace: создай хранилище и привяжи под именем `PAYMENTS`. В нём хранятся все оплаты с `charge_id` для возврата.
5. **Webhook:** открой в браузере целиком, подставив свои значения:
   ```
   https://api.telegram.org/bot<ТОКЕН>/setWebhook?url=<адрес Worker>/webhook&secret_token=<WEBHOOK_SECRET>&allowed_updates=["message","pre_checkout_query"]
   ```
   Ответ должен быть `Webhook was set`.
6. **Игра:** в начале скрипта в `index.html` впиши адрес Worker в `const PAY_API = ''` и перезалей файл на GitHub.
7. **Проверка:** боту `/start` → приветствие с кнопкой. В игре купи самый дешёвый пакет → монеты пришли, бот написал «Спасибо за покупку». Звёзды можно вернуть себе: `/refund` из уведомления об оплате.

## Пакеты

Заданы в двух местах: `PACKS` в `index.html` и `PACKS` в `worker.js`. Меняй их одновременно.

| Звёзды | Монеты |
|---|---|
| 50 ⭐ | 5 000 |
| 100 ⭐ | 11 000 |
| 250 ⭐ | 30 000 |
| 500 ⭐ | 65 000 |

## Команды бота

| Команда | Кто | Что делает |
|---|---|---|
| `/start` | все | Кнопка «Играть» |
| `/terms` | все | Условия покупки |
| `/paysupport`, `/support` | все | Помощь с оплатой. Обычные сообщения игроков пересылаются владельцу |
| `/refund <user_id> <charge_id>` | только `ADMIN_ID` | Возврат звёзд. Готовая команда приходит в уведомлении об оплате |

В @BotFather → `/setcommands`:
```
start - Играть в Fruit Spin
terms - Условия покупки
paysupport - Помощь с оплатой
```

## Частые ошибки

| Что видишь | Причина | Что сделать |
|---|---|---|
| «Время ожидания ответа от бота истекло» при оплате | Webhook не подключён | Открыть ссылку `setWebhook`, проверить `.../bot<ТОКЕН>/getWebhookInfo` |
| `{"ok":false,"error_code":404}` от api.telegram.org | Неверная ссылка: нет `bot` перед токеном, пробел, обрезан токен | Сначала проверить `.../bot<ТОКЕН>/getMe` |
| «Оплата ещё не подключена» | Пустой `PAY_API` | Вписать адрес Worker и перезалить `index.html` |
| «Оплата работает только внутри Telegram» | Игра открыта в браузере | Открывать через бота |
| Worker отвечает 403 на `/webhook` | `secret_token` в ссылке не совпадает с `WEBHOOK_SECRET` | Заново открыть `setWebhook` с правильным секретом |
| На GitHub Pages старая версия | Сборка в очереди или упала | Actions → Re-run all jobs, подождать 1–2 минуты |
| После `/revoke` оплата перестала работать | В Cloudflare старый токен | Обновить `BOT_TOKEN` и заново открыть `setWebhook` |

Ключ сохранения прогресса (`fruitspin_v1`) не меняется между версиями: обновления игры не стирают прогресс игроков.

## Вывод звёзд

Звёзды копятся на балансе бота и выводятся вручную через Fragment в TON: от 1 000 звёзд, доступны звёзды старше 21 дня, на аккаунте нужен облачный пароль (2FA). BotFather → бот → Monetization → Telegram Stars → Withdraw.
