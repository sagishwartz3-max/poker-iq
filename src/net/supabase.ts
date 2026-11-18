import { createClient } from '@supabase/supabase-js';
import type { Progress } from '../game/progress';
import { today } from '../game/progress';
import { ENV } from '../env';
import { SITE } from '../native';
import { phCapture, phIdentify } from './posthog';

// Publishable values: safe to ship inside the app. Override with VITE_SUPABASE_URL / VITE_SUPABASE_KEY.
const URL = ENV.SUPABASE_URL || 'https://xfuzuwcmvcgdkqhghgyr.supabase.co';
const KEY = ENV.SUPABASE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhmdXp1d2NtdmNnZGtxaGdoZ3lyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQyNTY2MzAsImV4cCI6MjEwOTgzMjYzMH0.mdiHyXnZRIE_REypf53-KsqFPV6ia20s4uznUPUtptg';

export const supabase = createClient(URL, KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  realtime: { params: { eventsPerSecond: 20 } }
});

/** Address used in invite links. Inside the store app the page is not served from the site, so the public URL is used. */
export const PUBLIC_URL: string = ENV.PUBLIC_URL ||
  (location.protocol.startsWith('http') ? location.origin + location.pathname.replace(/index\.html$/, '') : SITE + '/');

export interface Row {
  id: string; nickname: string; xp: number; hands: number; correct: number;
  daily_date: string | null; daily_score: number; daily_squares: string; wins: number; losses: number;
}

export async function savePlayer(p: Progress) {
  if (!p.nick) return;
  const d = p.daily && p.daily.date === today() ? p.daily : null;
  const { error } = await supabase.rpc('poker_save_player', {
    p_id: p.id, p_secret: p.secret, p_nickname: p.nick, p_xp: p.xp, p_hands: p.hands, p_correct: p.correct,
    p_daily_date: d ? d.date : null, p_daily_score: d ? d.score : 0, p_daily_squares: d ? d.squares : '', p_coins: p.coins ?? 0
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

/* ---------- product analytics (for the social experiment) ---------- */
let trackOff = false;
let identified = '';
export function track(p: Progress, event: string, meta: Record<string, unknown> = {}) {
  // product analytics (PostHog): anonymous player id only, never the nickname
  if (identified !== p.id) { identified = p.id; phIdentify(p.id, { level_xp: p.xp }); }
  phCapture(event, meta);
  if (trackOff) return;
  supabase.rpc('poker_track', { p_id: p.id, p_event: event, p_meta: meta }).then(({ error }) => { if (error) trackOff = true; });
}

/** Deletes the player's account and every row tied to it on the server. */
export async function deletePlayer(p: Progress) {
  const { error } = await supabase.rpc('poker_delete_player', { p_id: p.id, p_secret: p.secret });
  if (error && !/bad secret/.test(error.message)) throw error; // never saved to the server: nothing to delete
}

/* ---------- Pro waitlist ("fake door" price test) ---------- */
export async function joinWaitlist(p: Progress, tier: 'plus' | 'pro' | 'elite', price: string, contact: string) {
  await savePlayer(p).catch(() => {});
  const { error } = await supabase.rpc('poker_join_waitlist', { p_id: p.id, p_secret: p.secret, p_tier: tier, p_price: price, p_contact: contact });
  if (error) throw error;
}

/* ---------- AI coach ---------- */
export type CoachResult = { ok: true; answer: string; left: number } | { ok: false; reason: 'not_configured' | 'limit' | 'error' };
export async function askCoach(p: Progress, spot: string, question: string): Promise<CoachResult> {
  await savePlayer(p).catch(() => {});
  const { data, error } = await supabase.functions.invoke('poker-coach', { body: { playerId: p.id, secret: p.secret, spot, question } });
  if (!error && data?.answer) return { ok: true, answer: data.answer, left: data.left };
  let code = '';
  try { code = (await (error as any)?.context?.json?.())?.error || ''; } catch { /* no body */ }
  return { ok: false, reason: code === 'not_configured' ? 'not_configured' : code === 'limit' ? 'limit' : 'error' };
}

/* ---------- rooms: a code works only if a player really opened it ---------- */
export interface Room { code: string; channel: string; hostId: string }
export async function createRoom(p: Progress, kind: 'duel' | 'table'): Promise<Room> {
  await savePlayer(p);
  const { data, error } = await supabase.rpc('poker_room_create', { p_id: p.id, p_secret: p.secret, p_kind: kind });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) throw error || new Error('no room');
  return { code: row.code, channel: row.channel, hostId: p.id };
}
export async function getRoom(code: string, kind: 'duel' | 'table'): Promise<Room | null> {
  const { data, error } = await supabase.rpc('poker_room_get', { p_code: code, p_kind: kind });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row ? { code: code.toUpperCase(), channel: row.channel, hostId: row.host_id } : null;
}
