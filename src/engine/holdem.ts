// A full No-Limit Hold'em table for friends: play chips only. Pure functions over one state object,
// so the same code can run on the host's device today and on a server later.
import { best5, scoreName, type Rng } from './cards';

export interface TCfg { stack: number; levelMin: number; rebuys: number; turnSec: number; /** learning mode: helper + hand review for every player */ learn?: boolean;
  /** tournament entry in game coins (0 = free table): no rebuys, no gifts, prizes from the entries */ buyIn?: number }
export const DEFAULT_CFG: TCfg = { stack: 2000, levelMin: 10, rebuys: 2, turnSec: 30 };
/** Seconds per turn: learning mode adds 15 so there is time to think the question through. */
export const turnSecs = (cfg: TCfg) => cfg.turnSec + (cfg.learn ? 15 : 0);
export const BLINDS: [number, number][] = [[10, 20], [15, 30], [25, 50], [50, 100], [75, 150], [100, 200], [150, 300], [200, 400], [300, 600], [500, 1000], [1000, 2000]];
export const MAX_SEATS = 9;

export interface TP {
  id: string; nick: string; stack: number; bet: number; total: number;
  folded: boolean; allIn: boolean; acted: boolean; inHand: boolean;
  buyIns: number; gifts: number; pending: number; out: boolean; away: boolean;
  cards?: number[]; actedBet?: number;
  /** buy-in tables: entered (paid) and the hand number they were knocked out in */
  paid?: boolean; bust?: number;
  /** sitting out: 'idle' after two timed-out turns (returns with a tap), 'away' while disconnected (returns on reconnect) */
  sitOut?: 'idle' | 'away'; missed?: number;
  /** online tables: last command time, screen on, and when the player went away */
  seen?: number; vis?: boolean; awayAt?: number;
}
export type Phase = 'lobby' | 'hand' | 'show' | 'over';
export interface Win { id: string; amount: number; name: string }
export interface TS {
  code: string; hostId: string; cfg: TCfg; phase: Phase; paused: boolean; pausedAt?: number; players: TP[];
  handNo: number; btn: number; street: number; board: number[]; deck: number[];
  pot: number; curBet: number; minRaise: number; turn: string | null; deadline: number;
  startedAt: number; level: number; sb: number; bb: number;
  winners: Win[]; shown: Record<string, number[]>; last: { id: string; text: string } | null; nextAt: number;
  /** showdown timeline: when it began, how many board cards were already out before the run-out, the pot being won,
   *  and each shown hand's name and best five cards */
  showAt?: number; runFrom?: number; potWon?: number; hands?: Record<string, { name: string; best: number[] }>;
  /** waiting-room suggestions from players, and a short note of the manager's last change */
  suggest?: { id: string; nick: string; key: string; val: number | boolean; at: number }[]; note?: { text: string; at: number };
  /** why the game ended early, when it did */
  endReason?: string;
  /** the last finished hand, for the 'last hand' panel */
  prev?: { hand: number; board: number[]; winners: { nick: string; amount: number; name: string }[]; shown: { nick: string; cards: number[]; name: string }[] };
}

/** Seconds into the showdown when board card i lands, and when the result is revealed. Host and players share it. */
export function showTimes(runFrom: number, showdown: boolean) {
  const streetOf = (len: number) => (len >= 5 ? 3 : len >= 4 ? 2 : len >= 3 ? 1 : 0);
  const from = streetOf(runFrom), steps = showdown ? 3 - from : 0;
  const cardAt = (i: number) => (!showdown || i < runFrom ? 0 : 0.9 + ((i < 3 ? 1 : i - 1) - from - 1) * 1.7 + (i < 3 ? i * 0.15 : 0));
  const resolveAt = !showdown ? 0.3 : steps ? 0.9 + (steps - 1) * 1.7 + 1.3 : 1.4;
  return { cardAt, resolveAt, endAt: resolveAt + (showdown ? 6 : 2.9) };
}
export type TAction = { type: 'fold' | 'check' | 'call' } | { type: 'raise'; to: number };

export function newTable(code: string, hostId: string, cfg: TCfg): TS {
  return { code, hostId, cfg, phase: 'lobby', paused: false, players: [], handNo: 0, btn: -1, street: 0, board: [], deck: [],
    pot: 0, curBet: 0, minRaise: 0, turn: null, deadline: 0, startedAt: 0, level: 0, sb: BLINDS[0][0], bb: BLINDS[0][1],
    winners: [], shown: {}, last: null, nextAt: 0, hands: {}, runFrom: 0, potWon: 0, showAt: 0 };
}
export function seat(s: TS, id: string, nick: string): TP | null {
  const ex = s.players.find(p => p.id === id);
  if (ex) { ex.nick = nick; ex.away = false; return ex; }
  if (s.players.length >= MAX_SEATS || s.phase === 'over') return null;
  const p: TP = { id, nick, stack: s.cfg.stack, bet: 0, total: 0, folded: false, allIn: false, acted: false, inHand: false, buyIns: 1, gifts: 0, pending: 0, out: false, away: false };
  // a buy-in table seats you as a spectator until you pay the entry
  if (s.cfg.buyIn) { p.out = true; p.paid = false; }
  s.players.push(p);
  return p;
}
const canAct = (p: TP) => p.inHand && !p.folded && !p.allIn;
const alive = (s: TS) => s.players.filter(p => p.inHand && !p.folded);
/** A short all-in does not reopen raising for someone who already acted. */
export const mayRaise = (s: Pick<TS, 'curBet' | 'minRaise'>, p: Pick<TP, 'acted' | 'actedBet' | 'bet' | 'stack'>) =>
  p.bet + p.stack > s.curBet && (!p.acted || p.actedBet === 0 || s.curBet - (p.actedBet ?? p.bet) >= s.minRaise);
export const canRebuy = (s: TS, p: TP) => !s.cfg.buyIn && p.stack === 0 && !(s.phase === 'hand' && p.inHand) && (s.cfg.rebuys < 0 || p.buyIns - 1 < s.cfg.rebuys);
export const levelEndsAt = (s: TS) => (s.cfg.levelMin > 0 && s.startedAt ? s.startedAt + (s.level + 1) * s.cfg.levelMin * 60000 : 0);

function pay(s: TS, p: TP, amt: number) {
  const a = Math.min(amt, p.stack);
  p.stack -= a; p.bet += a; p.total += a; s.pot += a;
  if (p.stack === 0) p.allIn = true;
}
function nextIdx(s: TS, from: number, ok: (p: TP) => boolean) {
  const n = s.players.length;
  for (let k = 1; k <= n; k++) { const i = (from + k) % n; if (ok(s.players[i])) return i; }
  return -1;
}

/** Deals a new hand. Returns false when fewer than two players have chips. */
export function startHand(s: TS, rng: Rng, now: number): boolean {
  for (const p of s.players) { if (p.pending) { p.stack += p.pending; p.gifts += p.pending; p.pending = 0; } }
  const ready = s.players.filter(p => p.stack > 0 && !p.out && !p.sitOut);
  if (ready.length < 2) return false;
  if (!s.startedAt) s.startedAt = now;
  if (s.cfg.levelMin > 0) s.level = Math.min(BLINDS.length - 1, Math.floor((now - s.startedAt) / (s.cfg.levelMin * 60000)));
  [s.sb, s.bb] = BLINDS[s.level];
  for (const p of s.players) { p.bet = 0; p.total = 0; p.folded = false; p.allIn = false; p.acted = false; p.actedBet = 0; p.inHand = p.stack > 0 && !p.out && !p.sitOut; delete p.cards; }
  s.handNo++; s.street = 0; s.board = []; s.pot = 0; s.winners = []; s.shown = {}; s.hands = {}; s.runFrom = 0; s.potWon = 0; s.last = null; s.phase = 'hand';
  s.btn = nextIdx(s, s.btn < 0 ? Math.floor(rng() * s.players.length) : s.btn, p => p.inHand);
  const deck: number[] = [];
  for (let c = 0; c < 52; c++) deck.push(c);
  for (let i = 51; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  s.deck = deck;
  for (const p of s.players) if (p.inHand) p.cards = [deck.pop()!, deck.pop()!];
  const n = ready.length;
  const sbI = n === 2 ? s.btn : nextIdx(s, s.btn, p => p.inHand);
  const bbI = nextIdx(s, sbI, p => p.inHand);
  pay(s, s.players[sbI], s.sb);
  pay(s, s.players[bbI], s.bb);
  s.curBet = s.bb; s.minRaise = s.bb;
  s.turn = s.players[bbI].id; // progress() moves to the next player who can act
  progress(s, now);
  return true;
}

export function act(s: TS, id: string, a: TAction, now: number): boolean {
  if (s.phase !== 'hand' || s.paused || s.turn !== id) return false;
  const p = s.players.find(x => x.id === id);
  if (!p || !canAct(p)) return false;
  const toCall = s.curBet - p.bet;
  let text = '';
  if (a.type === 'fold') { p.folded = true; text = 'Fold'; }
  else if (a.type === 'check') { if (toCall > 0) return false; text = 'Check'; }
  else if (a.type === 'call') { if (toCall <= 0) return false; pay(s, p, toCall); text = p.allIn ? 'All-in' : `Call ${toCall}`; }
  else {
    const max = p.bet + p.stack;
    let to = Math.floor((a as { to: number }).to);
    if (!Number.isFinite(to) || !(to > 0)) return false;
    if (to >= max) to = max;
    else if (to < s.curBet + s.minRaise) return false;
    if (to <= s.curBet) { pay(s, p, toCall); text = p.allIn ? 'All-in' : `Call ${toCall}`; }
    else {
      if (!mayRaise(s, p)) return false;
      pay(s, p, to - p.bet);
      const fullRaise = to - s.curBet >= s.minRaise;
      if (fullRaise) s.minRaise = to - s.curBet;
      const wasBet = s.curBet;
      s.curBet = to;
      if (fullRaise) for (const o of s.players) if (o !== p && canAct(o)) o.acted = false;
      text = p.allIn ? `All-in ${to}` : wasBet === 0 ? `Bet ${to}` : `Raise to ${to}`;
    }
  }
  p.acted = true;
  p.actedBet = s.curBet;
  s.last = { id, text };
  progress(s, now);
  return true;
}

function progress(s: TS, now: number) {
  const b0 = s.board.length; // cards out before an all-in run-out
  for (;;) {
    const live = alive(s);
    if (live.length === 1) { finish(s, now, false, b0); return; }
    const actors = live.filter(p => !p.allIn);
    const matched = actors.every(p => p.bet === s.curBet);
    const done = matched && (actors.length <= 1 || actors.every(p => p.acted));
    if (!done) {
      const from = s.players.findIndex(p => p.id === s.turn);
      const i = nextIdx(s, from, p => canAct(p) && (!p.acted || p.bet < s.curBet));
      s.turn = s.players[i].id;
      s.deadline = now + (s.players[i].away ? 5 : turnSecs(s.cfg)) * 1000;
      return;
    }
    if (s.street === 3) { finish(s, now, true, b0); return; }
    s.street++;
    for (const p of s.players) { p.bet = 0; p.acted = false; p.actedBet = 0; }
    s.curBet = 0; s.minRaise = s.bb;
    const k = s.street === 1 ? 3 : 1;
    for (let i = 0; i < k; i++) s.board.push(s.deck.pop()!);
    if (actors.length <= 1) continue; // everyone else is all-in: run the board out
    const first = nextIdx(s, s.btn, canAct);
    s.turn = s.players[(first - 1 + s.players.length) % s.players.length].id;
  }
}

function finish(s: TS, now: number, showdown: boolean, b0: number) {
  const live = alive(s);
  const won: Record<string, Win> = {};
  const give = (p: TP, amount: number, name: string) => { p.stack += amount; (won[p.id] ||= { id: p.id, amount: 0, name }).amount += amount; };
  if (!showdown) give(live[0], s.pot, '');
  else {
    while (s.board.length < 5) s.board.push(s.deck.pop()!);
    const score: Record<string, number> = {};
    s.hands = {};
    for (const p of live) {
      const b = best5([...p.cards!, ...s.board]);
      score[p.id] = b.score; s.shown[p.id] = p.cards!; s.hands[p.id] = { name: scoreName(b.score), best: b.cards };
    }
    const levels = [...new Set(live.map(p => p.total))].sort((a, b) => a - b);
    let prev = 0;
    const order = (p: TP) => (s.players.indexOf(p) - s.btn - 1 + s.players.length) % s.players.length;
    for (const L of levels) {
      const amount = s.players.reduce((sum, p) => sum + Math.max(0, Math.min(p.total, L) - prev), 0);
      prev = L;
      if (!amount) continue;
      const elig = live.filter(p => p.total >= L);
      const best = Math.max(...elig.map(p => score[p.id]));
      const winners = elig.filter(p => score[p.id] === best).sort((a, b) => order(a) - order(b));
      const share = Math.floor(amount / winners.length);
      let rest = amount - share * winners.length;
      for (const w of winners) { give(w, share + (rest > 0 ? 1 : 0), scoreName(best)); if (rest > 0) rest--; }
    }
    // chips nobody could match go back to their owner
    const top = Math.max(...s.players.map(p => p.total));
    const over = s.players.reduce((sum, p) => sum + Math.max(0, p.total - prev), 0);
    if (over > 0) (s.players.find(x => x.total === top && !x.folded) || live[0]).stack += over;
  }
  s.winners = Object.values(won).sort((a, b) => b.amount - a.amount);
  s.potWon = s.pot; s.runFrom = Math.min(b0, s.board.length); s.showAt = now;
  s.pot = 0; s.turn = null; s.phase = 'show';
  s.nextAt = now + showTimes(s.runFrom, showdown).endAt * 1000;
}

/** After the showdown pause: mark busted players and decide whether the game goes on. */
export function endHand(s: TS) {
  for (const p of s.players) { p.inHand = false; p.bet = 0; if (p.stack === 0 && !p.pending && !canRebuy(s, p) && !p.out) { p.out = true; p.bust = s.handNo; } }
  s.phase = 'lobby';
  const stillIn = s.players.filter(p => !p.out);
  if (s.handNo > 0 && stillIn.length <= 1) s.phase = 'over';
}
export function rebuy(s: TS, id: string): boolean {
  const p = s.players.find(x => x.id === id);
  if (!p || !canRebuy(s, p)) return false;
  p.stack = s.cfg.stack; p.buyIns++; p.out = false;
  if (s.phase === 'over') s.phase = 'lobby';
  return true;
}
/** The manager hands out extra chips. Mid-hand they wait until the hand is over. */
export function gift(s: TS, id: string, amount: number): boolean {
  const p = s.players.find(x => x.id === id);
  if (!p || !(amount > 0) || amount > 1e7 || s.cfg.buyIn) return false;
  amount = Math.floor(amount);
  if (s.phase === 'hand' && p.inHand) p.pending += amount; else { p.stack += amount; p.gifts += amount; }
  p.out = false;
  if (s.phase === 'over') s.phase = 'lobby';
  return true;
}
export function timeoutAction(s: TS): TAction {
  const p = s.players.find(x => x.id === s.turn);
  return p && s.curBet - p.bet <= 0 ? { type: 'check' } : { type: 'fold' };
}

/** What everyone may see: no deck, and hole cards only once they are shown. */
export interface PV extends Omit<TP, 'cards'> { has: boolean }
export interface View extends Omit<TS, 'deck' | 'players'> { players: PV[]; levelEnds: number; at: number }
export function publicView(s: TS, now: number): View {
  const { deck: _deck, players, ...rest } = s;
  return { ...rest, at: now, levelEnds: levelEndsAt(s), players: players.map(({ cards: _c, ...p }) => ({ ...p, has: p.inHand && !p.folded })) };
}

/** Buy-in tables: enter (or leave) before the first hand. */
export function payIn(s: TS, id: string, on: boolean): boolean {
  const p = s.players.find(x => x.id === id);
  if (!p || !s.cfg.buyIn || s.handNo > 0 || s.phase !== 'lobby') return false;
  p.paid = on; p.out = !on;
  return true;
}
/** Final places and coin prizes of a buy-in table: 1 paid place up to 4 entries, 2 up to 6, 3 from 7. */
export function prizes(s: TS): { id: string; place: number; amount: number }[] {
  const ent = s.players.filter(p => p.paid);
  if (!s.cfg.buyIn || ent.length < 2) return [];
  const pool = s.cfg.buyIn * ent.length;
  const split = ent.length <= 4 ? [1] : ent.length <= 6 ? [0.7, 0.3] : [0.5, 0.3, 0.2];
  // still in beats knocked out; among the knocked out, later beats earlier
  const order = [...ent].sort((a, b) => b.stack - a.stack || (b.bust ?? 1e9) - (a.bust ?? 1e9));
  const out = split.map((f, i) => ({ id: order[i].id, place: i + 1, amount: Math.floor(pool * f) }));
  out[0].amount += pool - out.reduce((t, x) => t + x.amount, 0);
  return out;
}

/** A turn ran out: after two in a row the player sits out until they tap back in. */
export function noteTimeout(s: TS, id: string) {
  const p = s.players.find(x => x.id === id);
  if (!p) return;
  p.missed = (p.missed ?? 0) + 1;
  if (p.missed >= 2 && !p.sitOut) p.sitOut = p.away ? 'away' : 'idle';
}
/** Back at the table: dealt in from the next hand. */
export function sitIn(s: TS, id: string): boolean {
  const p = s.players.find(x => x.id === id);
  if (!p || !p.sitOut) return false;
  p.sitOut = undefined; p.missed = 0;
  return true;
}
/** Players who will be dealt the next hand. */
export const activeCount = (s: TS) => s.players.filter(p => p.stack > 0 && !p.out && !p.sitOut).length;
