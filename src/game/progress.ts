import type { Scenario } from '../engine/scenarios';

export interface Progress {
  id: string; secret: string; nick: string; xp: number; stars: Record<string, number>; lessons: Record<number, 1>;
  daily: { date: string; score: number; squares: string } | null; dailyStreak: number; lastDaily: string;
  hands: number; correct: number; wins: number; losses: number; sound: boolean; onboarded: boolean;
  mistakes: Scenario[];
}
const KEY = 'pokeriq-app-v1';
const rid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => ((Math.random() * 16) | 0).toString(16)));
const secret = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, '0')).join('');

export function blank(): Progress {
  return { id: rid(), secret: secret(), nick: '', xp: 0, stars: {}, lessons: {}, daily: null, dailyStreak: 0, lastDaily: '',
    hands: 0, correct: 0, wins: 0, losses: 0, sound: true, onboarded: false, mistakes: [] };
}
export function load(): Progress {
  try { const raw = localStorage.getItem(KEY); if (raw) return { ...blank(), ...JSON.parse(raw) }; } catch { /* storage off */ }
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
export function rememberMistake(p: Progress, s: Scenario) {
  if (p.mistakes.some(m => sameSpot(m, s))) return;
  p.mistakes = [s, ...p.mistakes].slice(0, 25);
}
export function forgetMistake(p: Progress, s: Scenario) { p.mistakes = p.mistakes.filter(m => !sameSpot(m, s)); }
