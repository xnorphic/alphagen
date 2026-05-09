import { createClient } from '@supabase/supabase-js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SUPABASE_URL     = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  const { holdings, totalInvested, totalValue } = req.body || {};

  if (!Array.isArray(holdings) || holdings.length === 0) {
    return res.status(400).json({ error: 'holdings array required' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const weekOf   = getMondayOfWeek(new Date());
  const now      = new Date().toISOString();

  /* ── 1. Upsert holdings for the primary user ── */
  const { data: user } = await supabase
    .from('users').select('id').order('id').limit(1).single();

  if (user) {
    const today = now.split('T')[0];
    const rows  = holdings.map(h => ({
      user_id:   user.id,
      ticker:    h.t,
      quantity:  h.q,
      buy_price: h.a,
      buy_date:  today,
    }));

    await supabase.from('holdings')
      .upsert(rows, { onConflict: 'user_id,ticker' });

    /* Remove tickers no longer in the uploaded portfolio */
    const activeTickers = holdings.map(h => h.t);
    const { data: existing } = await supabase
      .from('holdings').select('ticker').eq('user_id', user.id);

    const toDelete = (existing || [])
      .map(r => r.ticker)
      .filter(t => !activeTickers.includes(t));

    for (const ticker of toDelete) {
      await supabase.from('holdings')
        .delete().eq('user_id', user.id).eq('ticker', ticker);
    }
  }

  /* ── 2. Upsert weekly snapshot ── */
  await supabase.from('portfolio_snapshots').upsert({
    week_of:        weekOf,
    holdings:       holdings,
    total_invested: totalInvested || null,
    total_value:    totalValue    || null,
    uploaded_at:    now,
  }, { onConflict: 'week_of' });

  return res.status(200).json({
    ok:      true,
    synced:  holdings.length,
    week_of: weekOf,
    removed: user
      ? (await supabase.from('holdings').select('ticker').eq('user_id', user.id)).data?.length
      : 0,
  });
}

function getMondayOfWeek(date) {
  const d   = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff)).toISOString().split('T')[0];
}
