// Fruit Spin: сервер бота для оплаты звёздами Telegram (Cloudflare Worker).
// Переменные окружения (Settings > Variables):
//   BOT_TOKEN       токен бота из @BotFather (тип Secret)
//   WEBHOOK_SECRET  любая случайная строка (тип Secret)
//   APP_URL         адрес игры, например https://имя.github.io/fruit-spin/
//   SUPPORT         контакт поддержки по оплате, например @твой_ник (тип Text)
//   ADMIN_ID        твой Telegram ID (узнать: @userinfobot), для команды /refund
// Хранилище (Settings > Bindings > KV namespace): переменная PAYMENTS, сюда пишутся все оплаты

// цены и монеты должны совпадать с PACKS в index.html
const PACKS = {
  p50:  { stars: 50,  coins: 5000 },
  p100: { stars: 100, coins: 11000 },
  p250: { stars: 250, coins: 30000 },
  p500: { stars: 500, coins: 65000 },
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

async function tgApi(env, method, body) {
  const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return r.json();
}

// проверка подписи initData: запрос точно пришёл из Mini App этого бота
const enc = new TextEncoder();
async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', typeof key === 'string' ? enc.encode(key) : key,
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(data)));
}
async function verifyInitData(initData, token) {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const check = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = await hmac('WebAppData', token);
  const calc = [...(await hmac(secret, check))].map(b => b.toString(16).padStart(2, '0')).join('');
  if (calc !== hash) return null;
  const authDate = +params.get('auth_date');
  if (Date.now() / 1000 - authDate > 86400) return null; // старше суток
  return JSON.parse(params.get('user') || 'null');
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

    // 1. игра просит ссылку на оплату
    if (url.pathname === '/invoice' && req.method === 'POST') {
      const { pack, initData } = await req.json().catch(() => ({}));
      const p = PACKS[pack];
      if (!p) return json({ error: 'unknown pack' }, 400);
      const user = await verifyInitData(initData || '', env.BOT_TOKEN);
      if (!user) return json({ error: 'bad initData' }, 403);
      const res = await tgApi(env, 'createInvoiceLink', {
        title: `${p.coins.toLocaleString('ru-RU')} монет`,
        description: 'Игровые монеты для Fruit Spin. Их нельзя вывести или обменять на деньги.',
        payload: JSON.stringify({ u: user.id, p: pack }),
        currency: 'XTR',                     // звёзды Telegram
        prices: [{ label: 'Монеты', amount: p.stars }],
      });
      return res.ok ? json({ link: res.result }) : json({ error: res.description }, 500);
    }

    // 2. обновления от Telegram
    if (url.pathname === '/webhook' && req.method === 'POST') {
      if (req.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.WEBHOOK_SECRET) return new Response('forbidden', { status: 403 });
      const u = await req.json();

      // подтверждение перед списанием звёзд: Telegram ждёт ответ до 10 секунд
      if (u.pre_checkout_query) {
        const q = u.pre_checkout_query;
        let ok = false;
        try { const pl = JSON.parse(q.invoice_payload); ok = !!PACKS[pl.p] && PACKS[pl.p].stars === q.total_amount && q.currency === 'XTR' && pl.u === q.from.id; } catch (e) {}
        await tgApi(env, 'answerPreCheckoutQuery', ok
          ? { pre_checkout_query_id: q.id, ok: true }
          : { pre_checkout_query_id: q.id, ok: false, error_message: 'Этот пакет больше недоступен. Открой игру заново.' });
      }

      const m = u.message;
      if (m && m.successful_payment) {
        const sp = m.successful_payment;
        // charge_id нужен для возврата: храним каждую оплату
        const rec = { user: m.from.id, username: m.from.username || '', stars: sp.total_amount,
          payload: sp.invoice_payload, charge_id: sp.telegram_payment_charge_id, date: new Date().toISOString() };
        console.log('paid', JSON.stringify(rec));
        if (env.PAYMENTS) await env.PAYMENTS.put(`pay:${rec.charge_id}`, JSON.stringify(rec));
        if (env.ADMIN_ID) await tgApi(env, 'sendMessage', { chat_id: env.ADMIN_ID,
          text: `⭐ Оплата ${rec.stars} от ${m.from.id}${rec.username ? ' @' + rec.username : ''}\nДля возврата: /refund ${m.from.id} ${rec.charge_id}` });
        await tgApi(env, 'sendMessage', { chat_id: m.chat.id, text: `Спасибо за покупку! Оплата ${sp.total_amount} ⭐ прошла, монеты уже на балансе.` });
      } else if (m && m.text) {
        const cmd = m.text.split(' ')[0];
        if (cmd === '/start') {
          await tgApi(env, 'sendMessage', { chat_id: m.chat.id, text: '🍒 Fruit Spin: крути барабан и собирай фрукты в ряд!',
            reply_markup: { inline_keyboard: [[{ text: 'Играть', web_app: { url: env.APP_URL } }]] } });
        } else if (cmd === '/paysupport' || cmd === '/support') {
          await tgApi(env, 'sendMessage', { chat_id: m.chat.id, text:
            'Проблема с оплатой? Напиши' + (env.SUPPORT ? ` ${env.SUPPORT}` : ' сюда') + ' одним сообщением, что случилось, и время оплаты. Ответим в течение суток.\n\n' +
            'Поддержка Telegram и @BotSupport не помогают с покупками в этом боте: по оплатам пиши только сюда.' });
        } else if (cmd === '/refund' && env.ADMIN_ID && String(m.from.id) === String(env.ADMIN_ID)) {
          // /refund <user_id> <charge_id>: возврат звёзд игроку, только для владельца
          const [, uid, charge] = m.text.split(/\s+/);
          const res = (uid && charge) ? await tgApi(env, 'refundStarPayment', { user_id: +uid, telegram_payment_charge_id: charge }) : { ok: false, description: 'формат: /refund <user_id> <charge_id>' };
          await tgApi(env, 'sendMessage', { chat_id: m.chat.id, text: res.ok ? 'Возврат выполнен ✅' : `Возврат не прошёл: ${res.description}` });
          if (res.ok) await tgApi(env, 'sendMessage', { chat_id: +uid, text: 'Звёзды за покупку в Fruit Spin возвращены.' });
        } else if (env.ADMIN_ID && !cmd.startsWith('/')) {
          // обычное сообщение от игрока: пересылаем владельцу как обращение в поддержку
          await tgApi(env, 'forwardMessage', { chat_id: env.ADMIN_ID, from_chat_id: m.chat.id, message_id: m.message_id });
          await tgApi(env, 'sendMessage', { chat_id: m.chat.id, text: 'Сообщение передано в поддержку. Ответим в течение суток.' });
        } else if (cmd === '/terms') {
          await tgApi(env, 'sendMessage', { chat_id: m.chat.id, text: 'Условия Fruit Spin\n\n' +
            '1. Монеты игровые: их нельзя вывести, продать или обменять на деньги.\n' +
            '2. Покупка монет за звёзды окончательная. Если монеты не пришли из-за технической ошибки, звёзды вернём.\n' +
            '3. Вопросы по оплате: команда /paysupport.\n' +
            '4. Покупая монеты, ты подтверждаешь, что прочитал и принимаешь эти условия.' });
        }
      }
      return new Response('ok');
    }

    return new Response('Fruit Spin bot');
  },
};
