// Clubs: a group of friends with its own list of live tables. Join with the club's code or link;
// the owner and the managers the owner picks open the club's tables. Play chips only.
import type { TCfg } from '../engine/holdem';
import type { Progress } from '../game/progress';
import { savePlayer, supabase } from './supabase';

export type ClubRole = 'owner' | 'manager' | 'member';
export interface ClubRow { id: string; code: string; name: string; role: ClubRole; members: number; tables: number }
export interface ClubTable { code: string; host: string; seated: number; phase: string; hand: number; cfg: Partial<TCfg> | null; bb: number | null }
export interface ClubMember { id: string; nick: string; role: ClubRole }
export interface Club { id: string; code: string; name: string; role: ClubRole; members: ClubMember[]; tables: ClubTable[] }

const ERRORS: Record<string, string> = {
  'no club': 'אין מועדון עם הקוד הזה',
  'bad name': 'שם המועדון צריך להיות 2 עד 30 תווים',
  'too many clubs': 'אפשר לפתוח עד 5 מועדונים',
  'too many memberships': 'אפשר להיות חבר בעד 20 מועדונים',
  'club full': 'המועדון מלא',
  'not a member': 'אתה כבר לא חבר במועדון הזה',
  'owner only': 'רק בעל המועדון יכול לעשות את זה'
};
const fail = (e: { message?: string } | null) => {
  const m = e?.message || '';
  return Object.entries(ERRORS).find(([k]) => m.includes(k))?.[1] ?? 'אין חיבור לשרת. בדוק שיש אינטרנט ונסה שוב.';
};
const who = (p: Progress) => ({ p_id: p.id, p_secret: p.secret });

export async function myClubs(p: Progress): Promise<ClubRow[] | string> {
  const { data, error } = await supabase.rpc('poker_club_mine', who(p));
  return error ? fail(error) : (data as ClubRow[]) ?? [];
}
export async function getClub(p: Progress, id: string): Promise<Club | string> {
  const { data, error } = await supabase.rpc('poker_club_get', { ...who(p), p_club: id });
  return error ? fail(error) : (data as Club);
}
export async function createClub(p: Progress, name: string): Promise<{ id: string; code: string } | string> {
  await savePlayer(p).catch(() => {}); // the server knows this player (and nickname) first
  const { data, error } = await supabase.rpc('poker_club_create', { ...who(p), p_name: name });
  const row = Array.isArray(data) ? data[0] : data;
  return error || !row ? fail(error) : row;
}
export async function joinClub(p: Progress, code: string): Promise<{ id: string; code: string; name: string } | string> {
  await savePlayer(p).catch(() => {});
  const { data, error } = await supabase.rpc('poker_club_join', { ...who(p), p_code: code });
  const row = Array.isArray(data) ? data[0] : data;
  return error || !row ? fail(error) : row;
}
export async function leaveClub(p: Progress, id: string) {
  const { error } = await supabase.rpc('poker_club_leave', { ...who(p), p_club: id });
  return error ? fail(error) : null;
}
/** Owner only: 'manager' | 'member' sets a role, 'remove' takes the player out of the club. */
export async function setMember(p: Progress, club: string, player: string, role: 'manager' | 'member' | 'remove') {
  const { error } = await supabase.rpc('poker_club_member_set', { ...who(p), p_club: club, p_player: player, p_role: role });
  return error ? fail(error) : null;
}
