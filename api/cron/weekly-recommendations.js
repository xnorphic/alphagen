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

const INDICES = new Set(['QQQ', 'VOO', 'SPY', 'IWM', 'DIA', 'GLD', 'SLV', 'TLT', 'VTI', 'ARKK']);
const STOCK_NAMES = {
  NVDA:'NVIDIA Corporation', TSM:'Taiwan Semiconductor', MSFT:'Microsoft Corporation',
  UBER:'Uber Technologies', KTOS:'Kratos Defense & Security', QQQ:'Invesco QQQ Trust',
  MU:'Micron Technology', CRDO:'Credo Technology Group', VOO:'Vanguard S&P 500 ETF',
  V:'Visa Inc Class A', AAPL:'Apple Inc', PATH:'UiPath Inc',
};

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const BOT_TOKEN       = process.env.TELEGRAM_BOT_TOKEN;
  const WEBHOOK_SECRET  = process.env.TELEGRAM_WEBHOOK_SECRET;
  const SUPABASE_URL    = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  const ANT_KEY         = process.env.VITE_ANTHROPIC_API_KEY;

  const secret = req.query?.secret || req.headers['x-webhook-secret'];
  if (!WEBHOOK_SECRET || secret !== WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!BOT_TOKEN)    return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN not configured' });
  if (!SUPABASE_URL) return res.status(500).json({ error: 'Supabase not configured' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  try {
    console.log('Starting weekly recommendations...');

    const { data: users, error: usersErr } = await supabase
      .from('users').select('*').eq('subscribed', true);
    if (usersErr) throw usersErr;

    if (!users || users.length === 0) {
      return res.status(200).json({ message: 'No subscribed users', processed: 0 });
    }

    let successCount = 0, failureCount = 0;

    for (const user of users) {
      try {
        const { data: holdings } = await supabase
          .from('holdings').select('*').eq('user_id', user.id);

        if (!holdings || holdings.length === 0) continue;

        const signals  = await generateSignals(holdings, ANT_KEY);
        const message  = formatWeeklyMessage(signals, holdings);

        await sendMessage(BOT_TOKEN, user.chat_id, message, { parse_mode: 'HTML' });
        successCount++;

        const weekOf = getMondayOfWeek(new Date());
        await supabase.from('recommendations').upsert({
          user_id: user.id, week_of: weekOf,
          portfolio_analysis: signals,
          sent_at: new Date().toISOString(),
        }, { onConflict: 'user_id,week_of' });

        await supabase.from('analysis_logs').insert({ user_id: user.id, status: 'recommendation_sent' });
        await new Promise(r => setTimeout(r, 500));
      } catch (err) {
        console.error(`Error for user ${user.telegram_id}:`, err.message);
        failureCount++;
        await supabase.from('analysis_logs').insert({
          user_id: user.id, status: 'failed', error_message: err.message,
        });
      }
    }

    return res.status(200).json({
      message: 'Weekly recommendations completed',
      total_users: users.length, successful: successCount, failed: failureCount,
    });
  } catch (err) {
    console.error('Cron error:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function generateSignals(holdings, apiKey) {
  if (!apiKey) {
    return holdings.map(h => ({ ticker: h.ticker, verdict: 'HOLD', timingSignal: 'HOLD', alphaScore: 50, confidence: 50, catalysts: [], risks: [] }));
  }

  const hsParts   = holdings.map(h => `${h.ticker}(${STOCK_NAMES[h.ticker] || h.ticker}): avg $${h.buy_price}, qty ${h.quantity}`);
  const tmplParts = holdings.map(h =>
    `{"ticker":"${h.ticker}","alphaScore":75,"momentum":70,"sentiment":65,"optionsSignal":60,"whaleActivity":55,"verdict":"HOLD","confidence":70,"kellyFraction":0.10,"catalysts":["catalyst1"],"risks":["risk1"],"timingSignal":"HOLD","targetPrice1M":0}`
  );

  const prompt =
    `Analyze these holdings: ${hsParts.join('; ')}` +
    `\n\nReturn: {"holdings":[${tmplParts.join(',')}]}` +
    `\n\nUse REAL differentiated analysis. verdict must be OVERWEIGHT, UNDERWEIGHT, HOLD, or EXIT. timingSignal must be BUY, SELL, or HOLD. Spread alphaScores 15-90. String values under 55 chars.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system: 'You are a quantitative analyst. Return ONLY valid JSON. No markdown.',
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await response.json();
    const text = data.content?.[0]?.text || '{}';
    const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    return json.holdings || [];
  } catch (err) {
    console.error('Claude error:', err);
    return holdings.map(h => ({ ticker: h.ticker, verdict: 'HOLD', timingSignal: 'HOLD', alphaScore: 50, confidence: 50 }));
  }
}

function formatWeeklyMessage(signals, holdings) {
  const verdictEmoji = { OVERWEIGHT:'🟢', UNDERWEIGHT:'🟡', HOLD:'🔵', EXIT:'🔴' };
  const verdictLabel = { OVERWEIGHT:'BUY MORE', UNDERWEIGHT:'REDUCE', HOLD:'HOLD', EXIT:'SELL' };
  const timingEmoji  = { BUY:'⬆️', SELL:'⬇️', HOLD:'➡️' };

  const sorted  = [...signals].sort((a, b) => (b.alphaScore || 0) - (a.alphaScore || 0));
  const stocks  = sorted.filter(s => !INDICES.has(s.ticker));
  const indices = sorted.filter(s =>  INDICES.has(s.ticker));

  const dateStr = new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' });

  let msg = `<b>📊 Alpha-Gen Weekly Analysis</b>\n<i>${dateStr}</i>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;

  const renderSection = (items, label) => {
    if (!items.length) return '';
    let s = `\n<b>${label}</b>\n`;
    for (const sig of items) {
      const v   = sig.verdict || 'HOLD';
      const ts  = sig.timingSignal || 'HOLD';
      s += `\n${verdictEmoji[v] || '🔵'} <b>${sig.ticker}</b> — ${verdictLabel[v] || v} ${timingEmoji[ts] || '➡️'}\n`;
      s += `   Score: ${sig.alphaScore || '?'}/100 · Confidence: ${sig.confidence || '?'}%\n`;
      if (sig.targetPrice1M) s += `   Target: $${sig.targetPrice1M}\n`;
      if (sig.catalysts?.[0]) s += `   ✨ ${sig.catalysts[0]}\n`;
      if (sig.risks?.[0])     s += `   ⚠️ ${sig.risks[0]}\n`;
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

function getMondayOfWeek(date) {
  const d   = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff)).toISOString().split('T')[0];
}
