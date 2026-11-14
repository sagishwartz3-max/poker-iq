import { createClient } from '@supabase/supabase-js';
import type { Progress } from '../game/progress';
import { today } from '../game/progress';

// Publishable values: safe to ship inside the app. Override with VITE_SUPABASE_URL / VITE_SUPABASE_KEY.
const URL = import.meta.env.VITE_SUPABASE_URL || 'https://xfuzuwcmvcgdkqhghgyr.supabase.co';
const KEY = import.meta.env.VITE_SUPABASE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhmdXp1d2NtdmNnZGtxaGdoZ3lyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQyNTY2MzAsImV4cCI6MjEwOTgzMjYzMH0.mdiHyXnZRIE_REypf53-KsqFPV6ia20s4uznUPUtptg';

export const supabase = createClient(URL, KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  realtime: { params: { eventsPerSecond: 20 } }
});

/** Address used in invite links. Inside the store apps the page origin is capacitor://, so a public URL is needed. */
export const PUBLIC_URL: string = import.meta.env.VITE_PUBLIC_URL ||
  (location.protocol.startsWith('http') ? location.origin + location.pathname.replace(/index\.html$/, '') : 'https://poker-iq.vercel.app/');

export interface Row {
  id: string; nickname: string; xp: number; hands: number; correct: number;
  daily_date: string | null; daily_score: number; daily_squares: string; wins: number; losses: number;
}

export async function savePlayer(p: Progress) {
  if (!p.nick) return;
  const d = p.daily && p.daily.date === today() ? p.daily : null;
  const { error } = await supabase.rpc('poker_save_player', {
    p_id: p.id, p_secret: p.secret, p_nickname: p.nick, p_xp: p.xp, p_hands: p.hands, p_correct: p.correct,
    p_daily_date: d ? d.date : null, p_daily_score: d ? d.score : 0, p_daily_squares: d ? d.squares : ''
  });
  if (error) throw error;
}
export async function recordMatch(p: Progress, won: boolean) {
  if (!p.nick) return;
  await supabase.rpc('poker_record_match', { p_id: p.id, p_secret: p.secret, p_won: won });
}
export async function leaderboard(kind: 'xp' | 'daily' | 'wins'): Promise<Row[]> {
  let q = supabase.from('poker_players').select('id,nickname,xp,hands,correct,daily_date,daily_score,daily_squares,wins,losses').limit(50);
  if (kind === 'xp') q = q.order('xp', { ascending: false });
  if (kind === 'daily') q = q.eq('daily_date', today()).order('daily_score', { ascending: false });
  if (kind === 'wins') q = q.gt('wins', 0).order('wins', { ascending: false });
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as Row[];
}
