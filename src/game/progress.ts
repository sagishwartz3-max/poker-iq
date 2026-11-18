import type { Scenario } from '../engine/scenarios';
import type { Diag } from './path';

export interface Progress {
  id: string; secret: string; nick: string; xp: number; stars: Record<string, number>; lessons: Record<number, 1>;
  daily: { date: string; score: number; squares: string } | null; dailyStreak: number; lastDaily: string;
  hands: number; correct: number; wins: number; losses: number; sound: boolean; onboarded: boolean;
  mistakes: Mistake[];
  /** accuracy per skill bucket, for the leak map: key -> [hands, points] */
  skills: Record<string, [number, number]>;
  /** game coins: earned with every XP point and at the friends' table; never real money */
  coins: number;
  /** XP already earned today from decisions at the friends' table (capped) */
  tableDay: { date: string; xp: number };
  /** the day the daily wheel was last spun */
  wheel?: string;
  /** answers and hands of the opening diagnostic */
  diag?: Diag;
  /** knowledge levels whose checkpoint was passed */
  passed?: Record<number, 1>;
  /** lesson tips answered (from game/tips) */
  tips?: Record<string, 1>;
  /** best score in each tip's 5-hand practice */
  tipBest?: Record<string, number>;
}
/** A missed spot scheduled for spaced repetition. box 0..3: next review after 0, 1, 3, 7 days. */
export interface Mistake { s: Scenario; box: number; due: number }
const KEY = 'pokeriq-app-v1';
export const START_COINS = 2000;
export const TABLE_XP_DAY = 300;
/** Every XP point earned also adds a coin to the wallet. */
export function gain(p: Progress, xp: number) { const v = Math.max(0, Math.round(xp)); p.xp += v; p.coins = (p.coins || 0) + v; }
const rid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => ((Math.random() * 16) | 0).toString(16)));
const secret = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, '0')).join('');

export function blank(): Progress {
  return { id: rid(), secret: secret(), nick: '', xp: 0, stars: {}, lessons: {}, daily: null, dailyStreak: 0, lastDaily: '',
    hands: 0, correct: 0, wins: 0, losses: 0, sound: true, onboarded: false, mistakes: [], skills: {}, coins: START_COINS, tableDay: { date: '', xp: 0 } };
}
export function load(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      const p: Progress = { ...blank(), ...saved };
      // saves from before the wallet: credit what was already earned
      if (typeof saved.coins !== 'number') p.coins = START_COINS + (p.xp || 0);
      // older saves kept plain scenarios
      p.mistakes = (p.mistakes as any[]).map(m => ('s' in m && 'due' in m ? m : { s: m, box: 0, due: 0 }));
      return p;
    }
  } catch { /* storage off */ }
  return blank();
}
export function persist(p: Progress) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage off */ } }
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function yesterday() { const d = new Date(Date.now() - 864e5); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
export const nodeId = (w: number, l: number) => `${w}-${l}`;
export function unlocked(p: Progress, w: number, l: number) {
  if (w === 0 && l === 0) return true;
  const pw = l === 0 ? w - 1 : w, pl = l === 0 ? 2 : l - 1;
  return (p.stars[nodeId(pw, pl)] || 0) >= 1;
}

const sameSpot = (a: Scenario, b: Scenario) => a.kind === b.kind && a.hero.join() === b.hero.join() && a.board.join() === b.board.join() && a.heroPos === b.heroPos;
const DAY = 864e5;
const GAPS = [0, 1, 3, 7];
export function rememberMistake(p: Progress, s: Scenario) {
  const m = p.mistakes.find(x => sameSpot(x.s, s));
  if (m) { m.box = 0; m.due = Date.now(); return; }
  p.mistakes = [{ s, box: 0, due: Date.now() }, ...p.mistakes].slice(0, 40);
}
/** Answered right in review: move it to a later box, or retire it after the last one. */
export function promoteMistake(p: Progress, s: Scenario) {
  const m = p.mistakes.find(x => sameSpot(x.s, s));
  if (!m) return;
  if (m.box >= 3) { p.mistakes = p.mistakes.filter(x => x !== m); return; }
  m.box++; m.due = Date.now() + GAPS[m.box] * DAY;
}
export const dueMistakes = (p: Progress) => p.mistakes.filter(m => m.due <= Date.now());

/* ---------- leak map ---------- */
export const SKILLS: Record<string, string> = {
  'k:open': 'פתיחת ידיים (כולם ויתרו)', 'k:vsOpen': 'מול העלאה לפני הפלופ', 'k:bbLimp': 'ביג בליינד מול לימפים', 'k:vs3bet': 'מול 3-בט',
  'k:cbet': 'הימור המשך (סי-בט)', 'k:leadOOP': 'פעולה ראשונה בלי מיקום', 'k:facingBet': 'מול הימור אחרי הפלופ', 'k:checkRaised': 'מול צ׳ק-רייז',
  's:0': 'לפני הפלופ', 's:3': 'פלופ', 's:4': 'טרן', 's:5': 'ריבר',
  'p:ip': 'עם מיקום', 'p:oop': 'בלי מיקום', 'n:multi': 'שולחן מרובה שחקנים (3+)', 'd:draw': 'ידיים עם דרואו', 'a:all': 'הכול ביחד'
};
export function recordSkill(p: Progress, s: Scenario, pts: number) {
  const keys = [`k:${s.kind}`, `s:${s.street}`];
  if (s.street > 0) keys.push(s.ip ? 'p:ip' : 'p:oop');
  if (s.n >= 3 && s.kind !== 'open') keys.push('n:multi');
  if (s.draw && s.street > 0 && s.street < 5) keys.push('d:draw');
  for (const k of keys) { const v = p.skills[k] || [0, 0]; p.skills[k] = [v[0] + 1, v[1] + pts]; }
}
export interface Leak { key: string; name: string; hands: number; acc: number }
export function leaks(p: Progress, min = 5): Leak[] {
  return Object.entries(p.skills).filter(([k, v]) => v[0] >= min && SKILLS[k])
    .map(([k, v]) => ({ key: k, name: SKILLS[k], hands: v[0], acc: Math.round(v[1] / v[0]) }))
    .sort((a, b) => a.acc - b.acc);
}
