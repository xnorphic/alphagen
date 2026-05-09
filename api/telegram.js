import { createClient } from '@supabase/supabase-js';

async function sendMessage(token, chatId, text, opts = {}) {
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, ...opts }),
  });
  const d = await r.json();
  if (!d.ok) throw new Error(`Telegram: ${d.description}`);
  return d.result;
}

export const config = { runtime: 'nodejs' };

/* ── Portfolio defaults (mirrors App.tsx DEFAULT_P) ── */
const DEFAULT_PORTFOLIO = [
  { t:'NVDA', n:'NVIDIA Corporation',        q:4.20, a:137.78 },
  { t:'TSM',  n:'Taiwan Semiconductor',      q:2.26, a:120.76 },
  { t:'MSFT', n:'Microsoft Corporation',     q:0.75, a:342.14 },
  { t:'UBER', n:'Uber Technologies',         q:4.39, a:41.19  },
  { t:'KTOS', n:'Kratos Defense & Security', q:2.48, a:43.52  },
  { t:'QQQ',  n:'Invesco QQQ Trust',         q:0.18, a:589.74 },
  { t:'MU',   n:'Micron Technology',         q:0.29, a:320.67 },
  { t:'CRDO', n:'Credo Technology Group',    q:2.12, a:31.35  },
  { t:'VOO',  n:'Vanguard S&P 500 ETF',      q:0.12, a:605.52 },
  { t:'V',    n:'Visa Inc Class A',          q:0.26, a:280.02 },
  { t:'AAPL', n:'Apple Inc',                 q:0.18, a:270.20 },
  { t:'PATH', n:'UiPath Inc',                q:0.57, a:12.31  },
];

/* ETFs/indices — displayed separately */
const INDICES = new Set(['QQQ', 'VOO', 'SPY', 'IWM', 'DIA', 'GLD', 'SLV', 'TLT', 'VTI', 'ARKK']);

const STOCK_NAMES = Object.fromEntries(DEFAULT_PORTFOLIO.map(s => [s.t, s.n]));

export default async function handler(req, res) {
  const BOT_TOKEN       = process.env.TELEGRAM_BOT_TOKEN;
  const WEBHOOK_SECRET  = process.env.TELEGRAM_WEBHOOK_SECRET;
  const SUPABASE_URL    = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  const ANT_KEY         = process.env.VITE_ANTHROPIC_API_KEY;

  if (!BOT_TOKEN) return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN not configured' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const tg       = (chatId, text, opts) => sendMessage(BOT_TOKEN, chatId, text, opts);
  const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

  try {
    const update = req.body;

    if (WEBHOOK_SECRET && req.headers['x-telegram-bot-api-secret-token'] !== WEBHOOK_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!update.message) return res.status(200).json({ ok: true });

    const message    = update.message;
    const chatId     = message.chat.id;
    const telegramId = message.from.id;
    const username   = message.from.username || message.from.first_name || 'User';
    const text       = message.text || '';

    /* Upsert user */
    let userId = null;
    if (supabase) {
      const { data: upserted, error: upsertErr } = await supabase
        .from('users')
        .upsert({ telegram_id: telegramId, chat_id: chatId, username }, { onConflict: 'telegram_id' })
        .select('id')
        .single();
      if (upsertErr) console.error('User upsert error (RLS?):', upsertErr.message);
      userId = upserted?.id;
    }

    if (!text.startsWith('/')) {
      await tg(chatId, '👋 Use /help to see available commands.');
      return res.status(200).json({ ok: true });
    }

    const command = text.split(' ')[0].split('@')[0];
    const args    = text.split(' ').slice(1);

    try {
      switch (command) {
        case '/start': {
          await tg(chatId,
            `📊 *Welcome to Alpha\\-Gen Trading Bot\\!*\n\n` +
            `I mirror your Alpha\\-Gen dashboard:\n` +
            `✅ Track your portfolio \\(stocks \\+ indices\\)\n` +
            `✅ Get AI buy/sell/hold signals\n` +
            `✅ Weekly automated analysis\n\n` +
            `Use /help to see all commands\\.`,
            { parse_mode: 'MarkdownV2' }
          );

          /* Seed DEFAULT_P if user has no holdings */
          if (supabase && userId) {
            const { data: existing } = await supabase
              .from('holdings')
              .select('id')
              .eq('user_id', userId)
              .limit(1);

            if (!existing || existing.length === 0) {
              const today = new Date().toISOString().split('T')[0];
              const rows  = DEFAULT_PORTFOLIO.map(s => ({
                user_id:   userId,
                ticker:    s.t,
                quantity:  s.q,
                buy_price: s.a,
                buy_date:  today,
              }));
              await supabase.from('holdings').upsert(rows, { onConflict: 'user_id,ticker' });
              await tg(chatId,
                `✅ Portfolio synced from Alpha\\-Gen app \\(${DEFAULT_PORTFOLIO.length} positions\\)\\.\n\nUse /portfolio to view or /analyze to get signals\\.`,
                { parse_mode: 'MarkdownV2' }
              );
            }
          }
          break;
        }

        case '/help':
          await tg(chatId,
            `📋 *Available Commands:*\n\n` +
            `/portfolio \\- View holdings \\(stocks \\+ indices\\)\n` +
            `/analyze \\- Get buy/sell/hold signals\n` +
            `/add TICKER QTY PRICE \\- Add a position\n` +
            `/remove TICKER \\- Remove a position\n` +
            `/subscribe \\- Enable weekly alerts\n` +
            `/unsubscribe \\- Disable alerts\n` +
            `/help \\- Show this message`,
            { parse_mode: 'MarkdownV2' }
          );
          break;

        case '/portfolio': {
          if (!supabase)  { await tg(chatId, '⚠️ Database not configured.'); break; }
          if (!userId)    { await tg(chatId, '⚠️ DB access blocked — run this in Supabase SQL Editor:\n\nALTER TABLE users DISABLE ROW LEVEL SECURITY;\nALTER TABLE holdings DISABLE ROW LEVEL SECURITY;'); break; }

          const { data: holdings } = await supabase
            .from('holdings')
            .select('*')
            .eq('user_id', userId)
            .order('ticker');

          if (!holdings || holdings.length === 0) {
            await tg(chatId,
              '📭 No portfolio found\\.\n\nSend /start to sync your Alpha\\-Gen portfolio, or add stocks with:\n`/add NVDA 4 137\\.78`',
              { parse_mode: 'MarkdownV2' }
            );
            break;
          }

          const stocks  = holdings.filter(h => !INDICES.has(h.ticker));
          const indices = holdings.filter(h =>  INDICES.has(h.ticker));

          let totalInvested = 0;
          holdings.forEach(h => { totalInvested += Number(h.quantity) * Number(h.buy_price); });

          let msg = `<b>📊 Alpha-Gen Portfolio</b>\n<i>${new Date().toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' })}</i>\n`;
          msg += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;

          if (stocks.length > 0) {
            msg += `\n<b>📈 STOCKS (${stocks.length})</b>\n`;
            for (const h of stocks) {
              const name = STOCK_NAMES[h.ticker] || h.ticker;
              const invested = (Number(h.quantity) * Number(h.buy_price)).toFixed(0);
              msg += `• <b>${h.ticker}</b> — ${Number(h.quantity).toFixed(2)} sh @ $${Number(h.buy_price).toFixed(2)}`;
              msg += `  <i>($${invested} cost)</i>\n`;
              if (name !== h.ticker) msg += `  <i>${name}</i>\n`;
            }
          }

          if (indices.length > 0) {
            msg += `\n<b>📉 INDICES / ETFs (${indices.length})</b>\n`;
            for (const h of indices) {
              const name = STOCK_NAMES[h.ticker] || h.ticker;
              const invested = (Number(h.quantity) * Number(h.buy_price)).toFixed(0);
              msg += `• <b>${h.ticker}</b> — ${Number(h.quantity).toFixed(2)} sh @ $${Number(h.buy_price).toFixed(2)}`;
              msg += `  <i>($${invested} cost)</i>\n`;
              if (name !== h.ticker) msg += `  <i>${name}</i>\n`;
            }
          }

          msg += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
          msg += `💰 <b>Total Cost Basis: $${totalInvested.toFixed(0)}</b>\n`;
          msg += `\n💡 Use /analyze to get AI signals`;

          await tg(chatId, msg, { parse_mode: 'HTML' });
          break;
        }

        case '/analyze': {
          if (!supabase)  { await tg(chatId, '⚠️ Database not configured.'); break; }
          if (!userId)    { await tg(chatId, '⚠️ DB access blocked — disable RLS in Supabase.'); break; }

          const { data: holdings } = await supabase
            .from('holdings')
            .select('*')
            .eq('user_id', userId);

          if (!holdings || holdings.length === 0) {
            await tg(chatId, '📭 No holdings found. Send /start to sync your portfolio.');
            break;
          }

          await tg(chatId, '⏳ Running Alpha-Gen analysis… (30-60 seconds)');

          const analysis = await generateSignals(holdings, ANT_KEY);
          const msg      = formatSignalsMessage(analysis, holdings);
          await tg(chatId, msg, { parse_mode: 'HTML' });
          break;
        }

        case '/add': {
          if (args.length < 3) {
            await tg(chatId, '❌ Format: /add TICKER QTY PRICE\n\nExample: /add NVDA 4 137.78');
            break;
          }
          const ticker   = args[0].toUpperCase();
          const quantity = parseFloat(args[1]);
          const buyPrice = parseFloat(args[2]);
          const buyDate  = args[3] || new Date().toISOString().split('T')[0];

          if (isNaN(quantity) || isNaN(buyPrice)) {
            await tg(chatId, '❌ QTY and PRICE must be numbers.');
            break;
          }

          if (!supabase || !userId) {
            await tg(chatId, `✅ ${ticker} noted (no DB configured)`);
            break;
          }

          const { error } = await supabase.from('holdings').upsert(
            { user_id: userId, ticker, quantity, buy_price: buyPrice, buy_date: buyDate },
            { onConflict: 'user_id,ticker' }
          );

          if (error) {
            await tg(chatId, `⚠️ Error: ${error.message}`);
          } else {
            const isIndex = INDICES.has(ticker);
            await tg(chatId,
              `✅ Added <b>${quantity} shares</b> of <b>${ticker}</b> @ $${buyPrice}` +
              (isIndex ? ' <i>(Index/ETF)</i>' : ''),
              { parse_mode: 'HTML' }
            );
          }
          break;
        }

        case '/remove': {
          if (args.length < 1) {
            await tg(chatId, '❌ Format: /remove TICKER\n\nExample: /remove PATH');
            break;
          }
          const ticker = args[0].toUpperCase();

          if (!supabase || !userId) {
            await tg(chatId, `✅ ${ticker} removed (no DB configured)`);
            break;
          }

          const { error } = await supabase
            .from('holdings')
            .delete()
            .eq('user_id', userId)
            .eq('ticker', ticker);

          if (error) {
            await tg(chatId, `⚠️ Error: ${error.message}`);
          } else {
            await tg(chatId, `✅ <b>${ticker}</b> removed from your portfolio`, { parse_mode: 'HTML' });
          }
          break;
        }

        case '/subscribe': {
          if (supabase) await supabase.from('users').update({ subscribed: true }).eq('telegram_id', telegramId);
          await tg(chatId, '✅ Subscribed to weekly Alpha-Gen recommendations every Sunday!');
          break;
        }

        case '/unsubscribe': {
          if (supabase) await supabase.from('users').update({ subscribed: false }).eq('telegram_id', telegramId);
          await tg(chatId, '✅ Unsubscribed from weekly recommendations.');
          break;
        }

        default:
          await tg(chatId, `❓ Unknown command: <code>${command}</code>\n\nUse /help.`, { parse_mode: 'HTML' });
      }
    } catch (err) {
      console.error('Command error:', err);
      await tg(chatId, `⚠️ Error: ${err.message}`);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).json({ error: err.message });
  }
}

/* ── Signal generation (same logic as App.tsx fetchBatch) ── */
async function generateSignals(holdings, apiKey) {
  if (!apiKey) {
    return holdings.map(h => ({
      ticker: h.ticker,
      verdict: 'HOLD',
      timingSignal: 'HOLD',
      alphaScore: 50,
      confidence: 50,
      targetPrice1M: null,
      catalysts: [],
      risks: ['AI not configured'],
    }));
  }

  /* Build the same prompt format as App.tsx fetchBatch */
  const hsParts   = [];
  const tmplParts = [];
  for (const h of holdings) {
    const name = STOCK_NAMES[h.ticker] || h.ticker;
    hsParts.push(`${h.ticker}(${name}): avg $${h.buy_price}, qty ${h.quantity}`);
    tmplParts.push(
      `{"ticker":"${h.ticker}","alphaScore":75,"momentum":70,"sentiment":65,` +
      `"optionsSignal":60,"whaleActivity":55,"verdict":"HOLD","confidence":70,` +
      `"kellyFraction":0.10,"catalysts":["catalyst1"],"risks":["risk1"],` +
      `"timingSignal":"HOLD","targetPrice1M":0}`
    );
  }

  const prompt =
    `Analyze these holdings: ${hsParts.join('; ')}` +
    `\n\nReturn: {"holdings":[${tmplParts.join(',')}]}` +
    `\n\nUse REAL differentiated analysis. verdict must be one of OVERWEIGHT, UNDERWEIGHT, HOLD, EXIT. timingSignal must be BUY, SELL, or HOLD. Spread alphaScores across 15-90 range. Keep all string values under 55 characters.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system: 'You are a quantitative analyst. Return ONLY valid JSON. No markdown. No text outside the JSON object.',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await response.json();
    const text = data.content?.[0]?.text || '{}';
    const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    return json.holdings || [];
  } catch (err) {
    console.error('Claude error:', err);
    return holdings.map(h => ({
      ticker: h.ticker, verdict: 'HOLD', timingSignal: 'HOLD',
      alphaScore: 50, confidence: 50, targetPrice1M: null,
      catalysts: [], risks: ['Analysis error: ' + err.message],
    }));
  }
}

/* ── Format signals into Telegram HTML ── */
function formatSignalsMessage(signals, holdings) {
  const verdictEmoji = { OVERWEIGHT: '🟢', UNDERWEIGHT: '🟡', HOLD: '🔵', EXIT: '🔴' };
  const verdictLabel = { OVERWEIGHT: 'BUY MORE', UNDERWEIGHT: 'REDUCE', HOLD: 'HOLD', EXIT: 'SELL' };
  const timingEmoji  = { BUY: '⬆️', SELL: '⬇️', HOLD: '➡️' };

  /* Sort by alphaScore descending */
  const sorted = [...signals].sort((a, b) => (b.alphaScore || 0) - (a.alphaScore || 0));

  const stocks  = sorted.filter(s => !INDICES.has(s.ticker));
  const indices = sorted.filter(s =>  INDICES.has(s.ticker));

  let msg = `<b>📊 Alpha-Gen Signals</b>\n`;
  msg += `<i>${new Date().toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' })}</i>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;

  const renderSection = (items, label) => {
    if (items.length === 0) return '';
    let s = `\n<b>${label}</b>\n`;
    for (const sig of items) {
      const v   = sig.verdict || 'HOLD';
      const ts  = sig.timingSignal || 'HOLD';
      const em  = verdictEmoji[v]  || '🔵';
      const lbl = verdictLabel[v]  || v;
      const tem = timingEmoji[ts]  || '➡️';
      const name = STOCK_NAMES[sig.ticker] || sig.ticker;
      s += `\n${em} <b>${sig.ticker}</b> — ${lbl} ${tem}\n`;
      s += `   Score: ${sig.alphaScore || '?'}/100 · Confidence: ${sig.confidence || '?'}%\n`;
      if (sig.targetPrice1M) s += `   Target: $${sig.targetPrice1M}\n`;
      if (sig.catalysts?.length) s += `   ✨ ${sig.catalysts[0]}\n`;
      if (sig.risks?.length)     s += `   ⚠️ ${sig.risks[0]}\n`;
    }
    return s;
  };

  msg += renderSection(stocks,  `📈 STOCKS (${stocks.length})`);
  msg += renderSection(indices, `📉 INDICES / ETFs (${indices.length})`);

  msg += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `<b>Legend:</b> 🟢 Buy More · 🟡 Reduce · 🔵 Hold · 🔴 Sell\n`;
  msg += `<i>⚠️ Educational only. Not financial advice.</i>`;

  return msg;
}
