import { createClient } from '@supabase/supabase-js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const SUPABASE_URL      = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  /* Latest snapshot for cross-device portfolio state */
  const { data: snap } = await supabase
    .from('portfolio_snapshots')
    .select('*')
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .single();

  /* Full upload history for the history panel */
  const { data: history } = await supabase
    .from('upload_history')
    .select('id, uploaded_at, total_invested, total_value, num_positions')
    .order('uploaded_at', { ascending: false })
    .limit(50);

  return res.status(200).json({
    portfolio:      snap?.holdings      || null,
    totalInvested:  snap?.total_invested || null,
    totalValue:     snap?.total_value    || null,
    uploadedAt:     snap?.uploaded_at    || null,
    history:        history              || [],
  });
}
