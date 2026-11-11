// Fruit Spin: сервер бота для оплаты звёздами Telegram (Cloudflare Worker).
// Переменные окружения (Settings > Variables):
//   BOT_TOKEN       токен бота из @BotFather (тип Secret)
//   WEBHOOK_SECRET  любая случайная строка (тип Secret)
//   APP_URL         адрес игры, например https://имя.github.io/fruit-spin/

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
        payload: JSON.stringify({ pack, user: user.id }),
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
        try { const pl = JSON.parse(q.invoice_payload); ok = PACKS[pl.pack] && PACKS[pl.pack].stars === q.total_amount && q.currency === 'XTR'; } catch (e) {}
        await tgApi(env, 'answerPreCheckoutQuery', ok
          ? { pre_checkout_query_id: q.id, ok: true }
          : { pre_checkout_query_id: q.id, ok: false, error_message: 'Этот пакет больше недоступен. Открой игру заново.' });
      }

      const m = u.message;
      if (m && m.successful_payment) {
        const sp = m.successful_payment;
        // charge_id нужен для возврата: refundStarPayment(user_id, telegram_payment_charge_id)
        console.log('paid', m.from.id, sp.total_amount, sp.invoice_payload, sp.telegram_payment_charge_id);
        await tgApi(env, 'sendMessage', { chat_id: m.chat.id, text: `Оплата прошла: ${sp.total_amount} ⭐. Монеты уже на балансе.` });
      } else if (m && m.text) {
        const cmd = m.text.split(' ')[0];
        if (cmd === '/start') {
          await tgApi(env, 'sendMessage', { chat_id: m.chat.id, text: '🍒 Fruit Spin: крути барабан и собирай фрукты в ряд!',
            reply_markup: { inline_keyboard: [[{ text: 'Играть', web_app: { url: env.APP_URL } }]] } });
        } else if (cmd === '/paysupport') {
          await tgApi(env, 'sendMessage', { chat_id: m.chat.id, text: 'Проблема с оплатой? Напиши, что случилось, и приложи время оплаты. Ответим в течение суток.' });
        } else if (cmd === '/terms') {
          await tgApi(env, 'sendMessage', { chat_id: m.chat.id, text: 'Монеты Fruit Spin игровые: их нельзя вывести, продать или обменять на деньги. Покупка звёздами окончательная, кроме случаев технической ошибки.' });
        }
      }
      return new Response('ok');
    }

    return new Response('Fruit Spin bot');
  },
};
