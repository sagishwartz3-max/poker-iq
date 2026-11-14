import { chenOf, deal, draws, equity, madeHand, pick, randInt, type Draw, type Made, type Rng } from './cards';

export type Action = 'fold' | 'check' | 'call' | 'raise';
export type Pos = 'UTG' | 'HJ' | 'CO' | 'BTN' | 'SB' | 'BB';
export type Kind = 'open' | 'vsOpen' | 'bbLimp' | 'vs3bet' | 'cbet' | 'leadOOP' | 'facingBet' | 'checkRaised';
export type Street = 0 | 3 | 4 | 5;

export const PRE_ORDER: Pos[] = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
export const POST_ORDER: Pos[] = ['SB', 'BB', 'UTG', 'HJ', 'CO', 'BTN'];
export const POS_NAME: Record<Pos, string> = {
  UTG: 'עמדה ראשונה', HJ: 'הייג׳ק', CO: 'קאטאוף', BTN: 'כפתור', SB: 'סמול בליינד', BB: 'ביג בליינד'
};
export const ACT_NAME: Record<Action, string> = { fold: 'פולד', check: 'צ׳ק', call: 'קול', raise: 'רייז' };
const STREET_TERM: Record<Street, string> = { 0: '{{preflop}}', 3: '{{flop}}', 4: '{{turn}}', 5: '{{river}}' };
export const STREET_NAME: Record<Street, string> = { 0: 'לפני הפלופ', 3: 'פלופ', 4: 'טרן', 5: 'ריבר' };

const OPEN_THR: Record<Pos, number> = { UTG: 8, HJ: 7, CO: 6, BTN: 5, SB: 6, BB: 99 };
const RT_F = [0, 0.64, 0.48, 0.4, 0.35, 0.31];
const RT_N = [0, 0.58, 0.42, 0.34, 0.29, 0.25];

export interface Seat { pos: Pos; state: 'folded' | 'in' | 'hero' | 'waiting'; chips?: number; tag?: string; aggressor?: boolean }
export interface Step { pos: Pos | 'you'; text: string; kind: 'fold' | 'call' | 'raise' | 'check' | 'street' }
export interface Btn { action: Action; label: string; sub: string }

export interface Scenario {
  kind: Kind; street: Street; hero: number[]; board: number[]; heroPos: Pos; seats: Seat[]; history: Step[];
  pot: number; toCall: number; buttons: Btn[];
  n: number; thr: number[]; post?: number[]; ip: boolean; R: number;
  eq: number; eff: number; need: number; raiseThr: number; fair: number;
  correct: Action; ok: Action[]; dist: number;
  draw: Draw | null; made: Made;
  meta: Record<string, number | string>;
}

export interface GenCfg { kinds: Kind[]; streets?: (3 | 4 | 5)[]; opp?: [number, number]; draw?: boolean; cands?: number }

/* ---------------- helpers ---------------- */
function seatsFrom(heroPos: Pos, m: Partial<Record<Pos, Partial<Seat>>>): Seat[] {
  return PRE_ORDER.map(p => ({ pos: p, state: p === heroPos ? 'hero' : 'folded', ...(m[p] || {}) }) as Seat);
}
function decideFacing(s: Scenario) {
  const e = (s.eff = s.eq * s.R);
  s.fair = 1 / (s.n + 1);
  s.need = s.toCall / (s.pot + s.toCall);
  s.raiseThr = Math.max(RT_F[Math.min(5, s.n)], s.need + 0.1);
  s.correct = e >= s.raiseThr ? 'raise' : e >= s.need ? 'call' : 'fold';
  const ok = new Set<Action>([s.correct]);
  if (Math.abs(e - s.need) < 0.03) { ok.add('call'); ok.add('fold'); }
  if (Math.abs(e - s.raiseThr) < 0.03) { ok.add('raise'); ok.add('call'); }
  s.ok = [...ok];
  s.dist = Math.min(Math.abs(e - s.need), Math.abs(e - s.raiseThr));
}
function decideFree(s: Scenario, adj = 0) {
  const e = (s.eff = s.eq * s.R);
  s.fair = 1 / (s.n + 1);
  s.need = 0;
  s.raiseThr = RT_N[Math.min(5, s.n)] + adj;
  s.correct = e >= s.raiseThr ? 'raise' : 'check';
  const ok = new Set<Action>([s.correct]);
  if (Math.abs(e - s.raiseThr) < 0.03) { ok.add('raise'); ok.add('check'); }
  s.ok = [...ok];
  s.dist = Math.abs(e - s.raiseThr);
}
const blank = (): Omit<Scenario, 'kind' | 'street' | 'hero' | 'board' | 'heroPos' | 'seats' | 'history' | 'pot' | 'toCall' | 'buttons' | 'n' | 'thr' | 'ip' | 'R' | 'made'> => ({
  eq: 0, eff: 0, need: 0, raiseThr: 0, fair: 0.5, correct: 'fold', ok: ['fold'], dist: 1, draw: null, meta: {}
});
const even = (x: number) => Math.max(2, Math.round(x / 2) * 2);
const facingBtns = (call: number, raiseTo: number, raiseName = 'רייז'): Btn[] => [
  { action: 'fold', label: 'פולד', sub: 'לוותר' },
  { action: 'call', label: `קול ${call}`, sub: 'להשוות' },
  { action: 'raise', label: raiseName, sub: `ל-${raiseTo}` }
];
const freeBtns = (bet: number, betName = 'הימור'): Btn[] => [
  { action: 'check', label: 'צ׳ק', sub: 'בלי לשים' },
  { action: 'raise', label: betName, sub: `${bet}` }
];

/* ---------------- preflop templates ---------------- */
function genOpen(rng: Rng): Scenario {
  const heroPos = pick(rng, ['UTG', 'HJ', 'CO', 'BTN', 'SB'] as Pos[]);
  const thr = OPEN_THR[heroPos];
  let hero = deal(rng, 2);
  for (let t = 0; t < 40; t++) { hero = deal(rng, 2); if (Math.abs(chenOf(hero) - thr) <= 2 || rng() < 0.25) break; }
  const hi = PRE_ORDER.indexOf(heroPos);
  const m: Partial<Record<Pos, Partial<Seat>>> = {};
  const history: Step[] = [];
  PRE_ORDER.forEach((p, i) => {
    if (i < hi) { m[p] = { state: 'folded' }; history.push({ pos: p, text: 'פולד', kind: 'fold' }); }
    else if (i > hi) m[p] = { state: 'waiting' };
  });
  m.SB = { ...(m.SB || {}), chips: 1 }; m.BB = { ...(m.BB || {}), chips: 2 };
  if (heroPos === 'SB') m.SB = { state: 'hero', chips: 1 };
  history.push({ pos: 'you', text: 'תורך', kind: 'street' });
  const c = chenOf(hero);
  const s: Scenario = {
    ...blank(), kind: 'open', street: 0, hero, board: [], heroPos, seats: seatsFrom(heroPos, m), history,
    pot: 3, toCall: heroPos === 'SB' ? 1 : 2,
    buttons: [
      { action: 'fold', label: 'פולד', sub: 'לוותר' },
      { action: 'call', label: heroPos === 'SB' ? 'להשלים' : 'לימפ', sub: heroPos === 'SB' ? '1' : '2' },
      { action: 'raise', label: 'רייז', sub: heroPos === 'SB' ? 'ל-7' : 'ל-6' }
    ],
    n: 5 - hi, thr: [], ip: heroPos === 'BTN', R: 1, made: madeHand(hero, [])
  };
  s.correct = c >= thr ? 'raise' : 'fold';
  const ok = new Set<Action>([s.correct]);
  if (c === thr || c === thr - 1) { ok.add('raise'); ok.add('fold'); }
  s.ok = [...ok];
  s.dist = Math.abs(c - thr + 0.5) / 12;
  s.meta = { chen: c, openThr: thr, behind: 5 - hi };
  return s;
}

function genVsOpen(rng: Rng, cfg: GenCfg, iters: number): Scenario {
  const heroIdx = randInt(rng, 1, 5);
  const heroPos = PRE_ORDER[heroIdx];
  const opIdx = randInt(rng, 0, heroIdx - 1);
  const opPos = PRE_ORDER[opIdx];
  const maxOpp = cfg.opp ? cfg.opp[1] : 2;
  const callers: Pos[] = [];
  for (let i = opIdx + 1; i < heroIdx; i++) if (callers.length + 1 < maxOpp && rng() < 0.22) callers.push(PRE_ORDER[i]);
  let hero = deal(rng, 2);
  for (let t = 0; t < 30; t++) { hero = deal(rng, 2); if (chenOf(hero) >= 3 || rng() < 0.3) break; }
  // re-deal hero so it avoids no conflicts (equity excludes hero cards; villains are sampled inside equity)
  const m: Partial<Record<Pos, Partial<Seat>>> = {};
  const history: Step[] = [];
  PRE_ORDER.forEach((p, i) => {
    if (i === heroIdx) return;
    if (i === opIdx) { m[p] = { state: 'in', chips: 6, tag: 'רייז 6', aggressor: true }; history.push({ pos: p, text: 'רייז ל-6', kind: 'raise' }); }
    else if (callers.includes(p)) { m[p] = { state: 'in', chips: 6, tag: 'קול' }; history.push({ pos: p, text: 'קול', kind: 'call' }); }
    else if (i < heroIdx) { m[p] = { state: 'folded' }; history.push({ pos: p, text: 'פולד', kind: 'fold' }); }
    else m[p] = { state: 'waiting', chips: p === 'SB' ? 1 : p === 'BB' ? 2 : undefined };
  });
  const paid = heroPos === 'SB' ? 1 : heroPos === 'BB' ? 2 : 0;
  if (paid) m[heroPos] = { state: 'hero', chips: paid };
  history.push({ pos: 'you', text: 'תורך', kind: 'street' });
  const deadBlinds = (heroPos === 'SB' ? 0 : 1) + (heroPos === 'BB' ? 0 : 2);
  const pot = 6 * (1 + callers.length) + deadBlinds + paid - (opPos === 'SB' ? 1 : 0) - (opPos === 'BB' ? 2 : 0);
  const toCall = 6 - paid;
  const n = 1 + callers.length;
  const ip = heroPos !== 'SB' && heroPos !== 'BB';
  const raiseTo = 18 + 6 * callers.length;
  const s: Scenario = {
    ...blank(), kind: 'vsOpen', street: 0, hero, board: [], heroPos, seats: seatsFrom(heroPos, m), history,
    pot, toCall, buttons: facingBtns(toCall, raiseTo, '3-בט'),
    n, thr: [OPEN_THR[opPos], ...callers.map(() => 5)], ip, R: ip ? 1 : 0.88, made: madeHand(hero, [])
  };
  s.eq = equity(hero, [], s.thr, iters, rng);
  decideFacing(s);
  s.meta = { opPos, callers: callers.length, paid, opIdx };
  return s;
}

function genBBLimp(rng: Rng, cfg: GenCfg, iters: number): Scenario {
  const maxOpp = cfg.opp ? Math.min(4, cfg.opp[1]) : 3;
  const k = randInt(rng, 1, Math.max(1, maxOpp));
  const pool: Pos[] = ['UTG', 'HJ', 'CO', 'BTN', 'SB'];
  const limpers = new Set<Pos>();
  while (limpers.size < k) limpers.add(pick(rng, pool));
  const hero = deal(rng, 2);
  const m: Partial<Record<Pos, Partial<Seat>>> = { BB: { state: 'hero', chips: 2 } };
  const history: Step[] = [];
  PRE_ORDER.forEach(p => {
    if (p === 'BB') return;
    if (limpers.has(p)) { m[p] = { state: 'in', chips: 2, tag: 'לימפ' }; history.push({ pos: p, text: p === 'SB' ? 'השלים' : 'לימפ', kind: 'call' }); }
    else { m[p] = { state: 'folded', chips: p === 'SB' ? 1 : undefined }; history.push({ pos: p, text: 'פולד', kind: 'fold' }); }
  });
  history.push({ pos: 'you', text: 'תורך', kind: 'street' });
  const pot = 2 + 2 * k + (limpers.has('SB') ? 0 : 1);
  const s: Scenario = {
    ...blank(), kind: 'bbLimp', street: 0, hero, board: [], heroPos: 'BB', seats: seatsFrom('BB', m), history,
    pot, toCall: 0, buttons: freeBtns(8 + 2 * k, 'רייז'),
    n: k, thr: Array(k).fill(2), ip: false, R: 0.88, made: madeHand(hero, [])
  };
  s.eq = equity(hero, [], s.thr, iters, rng);
  decideFree(s, -0.07);
  s.meta = { limpers: k };
  return s;
}

function genVs3bet(rng: Rng, iters: number): Scenario {
  const heroIdx = randInt(rng, 0, 3);
  const heroPos = PRE_ORDER[heroIdx];
  const vIdx = randInt(rng, heroIdx + 1, 5);
  const vPos = PRE_ORDER[vIdx];
  let hero = deal(rng, 2);
  for (let t = 0; t < 60; t++) { hero = deal(rng, 2); if (chenOf(hero) >= OPEN_THR[heroPos]) break; }
  const blindV = vPos === 'SB' || vPos === 'BB';
  const three = blindV ? 20 : 18;
  const m: Partial<Record<Pos, Partial<Seat>>> = {};
  const history: Step[] = [];
  PRE_ORDER.forEach((p, i) => {
    if (i < heroIdx) { m[p] = { state: 'folded' }; history.push({ pos: p, text: 'פולד', kind: 'fold' }); }
  });
  history.push({ pos: 'you', text: 'רייז ל-6', kind: 'raise' });
  PRE_ORDER.forEach((p, i) => {
    if (i <= heroIdx) return;
    if (i === vIdx) { m[p] = { state: 'in', chips: three, tag: `3-בט ${three}`, aggressor: true }; history.push({ pos: p, text: `3-בט ל-${three}`, kind: 'raise' }); }
    else { m[p] = { state: 'folded', chips: p === 'SB' ? 1 : p === 'BB' ? 2 : undefined }; history.push({ pos: p, text: 'פולד', kind: 'fold' }); }
  });
  m[heroPos] = { state: 'hero', chips: 6 };
  history.push({ pos: 'you', text: 'תורך', kind: 'street' });
  const pot = 6 + three + 3 - (vPos === 'SB' ? 1 : vPos === 'BB' ? 2 : 0);
  const toCall = three - 6;
  const s: Scenario = {
    ...blank(), kind: 'vs3bet', street: 0, hero, board: [], heroPos, seats: seatsFrom(heroPos, m), history,
    pot, toCall, buttons: facingBtns(toCall, 48, '4-בט'),
    n: 1, thr: [10], ip: blindV, R: blindV ? 0.95 : 0.82, made: madeHand(hero, [])
  };
  s.eq = equity(hero, [], s.thr, iters, rng);
  decideFacing(s);
  s.meta = { vPos, three };
  return s;
}

/* ---------------- postflop templates ---------------- */
interface PostBase { street: 3 | 4 | 5; hero: number[]; board: number[]; heroPos: Pos; vill: Pos[]; ip: boolean; P: number; draw: Draw | null }
function postBase(rng: Rng, cfg: GenCfg, wantIP: boolean | null, nOpp: number, forceHeroIn?: Pos[]): PostBase {
  const street = pick(rng, cfg.streets || ([3, 4, 5] as const));
  let positions: Pos[] = [];
  let heroPos: Pos = 'BTN', ip = true;
  for (let t = 0; t < 50; t++) {
    const pool = [...POST_ORDER];
    positions = [];
    while (positions.length < nOpp + 1) { const p = pick(rng, pool); pool.splice(pool.indexOf(p), 1); positions.push(p); }
    positions.sort((a, b) => POST_ORDER.indexOf(a) - POST_ORDER.indexOf(b));
    const wIP = wantIP === null ? rng() < 0.5 : wantIP;
    heroPos = wIP ? positions[positions.length - 1] : positions[randInt(rng, 0, positions.length - 2)];
    ip = heroPos === positions[positions.length - 1];
    if (!forceHeroIn || forceHeroIn.includes(heroPos)) break;
  }
  const vill = positions.filter(p => p !== heroPos);
  let hero: number[] = [], board: number[] = [], dr: Draw | null = null;
  for (let t = 0; t < 80; t++) {
    const d = deal(rng, 2 + street);
    hero = d.slice(0, 2); board = d.slice(2);
    dr = draws(hero, board);
    if (cfg.draw && !dr) continue;
    if (!cfg.draw && !dr && madeHand(hero, board).strength === 0 && rng() < 0.6) continue;
    break;
  }
  return { street, hero, board, heroPos, vill, ip, P: even(randInt(rng, 8, 60) * 2), draw: dr };
}
function preHistory(b: PostBase, raiser: Pos | 'you'): Step[] {
  const h: Step[] = [];
  h.push({ pos: raiser, text: 'רייז', kind: 'raise' });
  for (const v of b.vill) if (v !== raiser) h.push({ pos: v, text: 'קול', kind: 'call' });
  if (raiser !== 'you') h.push({ pos: 'you', text: 'קול', kind: 'call' });
  h.push({ pos: 'you', text: STREET_NAME[b.street], kind: 'street' });
  return h;
}

function genCbet(rng: Rng, cfg: GenCfg, iters: number): Scenario {
  const nOpp = randInt(rng, cfg.opp?.[0] ?? 1, Math.min(3, cfg.opp?.[1] ?? 2));
  const b = postBase(rng, cfg, true, nOpp);
  const m: Partial<Record<Pos, Partial<Seat>>> = {};
  b.vill.forEach(v => (m[v] = { state: 'in', tag: 'צ׳ק' }));
  const history = preHistory(b, 'you');
  b.vill.forEach(v => history.push({ pos: v, text: 'צ׳ק', kind: 'check' }));
  history.push({ pos: 'you', text: 'תורך', kind: 'street' });
  const bet = even(b.P * 0.6);
  const s: Scenario = {
    ...blank(), kind: 'cbet', street: b.street, hero: b.hero, board: b.board, heroPos: b.heroPos, seats: seatsFrom(b.heroPos, m), history,
    pot: b.P, toCall: 0, buttons: freeBtns(bet), n: nOpp, thr: Array(nOpp).fill(4), ip: true, R: 1,
    made: madeHand(b.hero, b.board), draw: b.draw
  };
  s.eq = equity(b.hero, b.board, s.thr, iters, rng);
  decideFree(s, -0.04);
  s.meta = { bet };
  return s;
}

function genLeadOOP(rng: Rng, cfg: GenCfg, iters: number): Scenario {
  const b = postBase(rng, cfg, false, 1);
  const v = b.vill[0];
  const m: Partial<Record<Pos, Partial<Seat>>> = { [v]: { state: 'in', tag: 'מחכה', aggressor: true } };
  const history = preHistory(b, v);
  history.push({ pos: 'you', text: 'אתה ראשון', kind: 'street' });
  const bet = even(b.P * 0.6);
  const s: Scenario = {
    ...blank(), kind: 'leadOOP', street: b.street, hero: b.hero, board: b.board, heroPos: b.heroPos, seats: seatsFrom(b.heroPos, m), history,
    pot: b.P, toCall: 0, buttons: freeBtns(bet), n: 1, thr: [5], ip: false, R: b.street === 5 ? 0.95 : 0.88,
    made: madeHand(b.hero, b.board), draw: b.draw
  };
  s.eq = equity(b.hero, b.board, s.thr, iters, rng);
  decideFree(s);
  s.meta = { bet, vPos: v };
  return s;
}

function genFacingBet(rng: Rng, cfg: GenCfg, iters: number): Scenario {
  const nOpp = randInt(rng, cfg.opp?.[0] ?? 1, cfg.opp?.[1] ?? 2);
  const b = postBase(rng, cfg, null, nOpp);
  const bettor = b.ip ? b.vill[0] : b.vill.find(v => POST_ORDER.indexOf(v) > POST_ORDER.indexOf(b.heroPos)) || b.vill[0];
  const frac = pick(rng, [0.33, 0.5, 0.75, 1, 1.5]);
  const bet = even(b.P * frac);
  const m: Partial<Record<Pos, Partial<Seat>>> = {};
  b.vill.forEach(v => (m[v] = v === bettor ? { state: 'in', chips: bet, tag: `הימור ${bet}`, aggressor: true } : { state: 'in', tag: 'בקופה' }));
  const history = preHistory(b, bettor);
  if (!b.ip) history.push({ pos: 'you', text: 'צ׳ק', kind: 'check' });
  b.vill.forEach(v => { if (v === bettor) history.push({ pos: v, text: `הימור ${bet}`, kind: 'raise' }); else if (b.ip && POST_ORDER.indexOf(v) < POST_ORDER.indexOf(bettor)) history.push({ pos: v, text: 'צ׳ק', kind: 'check' }); });
  history.push({ pos: 'you', text: 'תורך', kind: 'street' });
  const bigRiver = b.street === 5 && frac >= 0.75;
  const s: Scenario = {
    ...blank(), kind: 'facingBet', street: b.street, hero: b.hero, board: b.board, heroPos: b.heroPos, seats: seatsFrom(b.heroPos, m), history,
    pot: b.P + bet, toCall: bet, buttons: facingBtns(bet, even(bet * 3)),
    n: nOpp, thr: [bigRiver ? 6 : 5, ...Array(nOpp - 1).fill(4)], ip: b.ip, R: b.ip ? 1 : b.street === 5 ? 0.95 : 0.88,
    made: madeHand(b.hero, b.board), draw: b.draw
  };
  s.post = [b.street === 5 ? (bigRiver ? 2 : 1) : frac >= 0.75 ? 2 : 1, ...Array(nOpp - 1).fill(0)];
  s.eq = equity(b.hero, b.board, s.thr, iters, rng, s.post);
  decideFacing(s);
  s.meta = { bet, frac, bettor, potBefore: b.P };
  return s;
}

function genCheckRaised(rng: Rng, cfg: GenCfg, iters: number): Scenario {
  const c2 = { ...cfg, streets: (cfg.streets || [3, 4]).filter(x => x !== 5) as (3 | 4)[] };
  if (!c2.streets.length) c2.streets = [3];
  const b = postBase(rng, c2, true, 1);
  const v = b.vill[0];
  const bet = even(b.P * 0.6), raise = even(bet * 3);
  const m: Partial<Record<Pos, Partial<Seat>>> = { [v]: { state: 'in', chips: raise, tag: `צ׳ק-רייז ${raise}`, aggressor: true } };
  m[b.heroPos] = { state: 'hero', chips: bet };
  const history = preHistory(b, 'you');
  history.push({ pos: v, text: 'צ׳ק', kind: 'check' }, { pos: 'you', text: `הימור ${bet}`, kind: 'raise' }, { pos: v, text: `רייז ל-${raise}`, kind: 'raise' }, { pos: 'you', text: 'תורך', kind: 'street' });
  const s: Scenario = {
    ...blank(), kind: 'checkRaised', street: b.street, hero: b.hero, board: b.board, heroPos: b.heroPos, seats: seatsFrom(b.heroPos, m), history,
    pot: b.P + bet + raise, toCall: raise - bet, buttons: facingBtns(raise - bet, 0, 'אול-אין').map(x => (x.action === 'raise' ? { ...x, sub: 'הכול' } : x)),
    n: 1, thr: [4], ip: true, R: 1, made: madeHand(b.hero, b.board), draw: b.draw
  };
  s.post = [2];
  s.eq = equity(b.hero, b.board, s.thr, iters, rng, s.post);
  decideFacing(s);
  s.meta = { bet, raise, vPos: v };
  return s;
}

function rawScenario(cfg: GenCfg, rng: Rng, iters: number): Scenario {
  const kind = pick(rng, cfg.kinds);
  switch (kind) {
    case 'open': return genOpen(rng);
    case 'vsOpen': return genVsOpen(rng, cfg, iters);
    case 'bbLimp': return genBBLimp(rng, cfg, iters);
    case 'vs3bet': return genVs3bet(rng, iters);
    case 'cbet': return genCbet(rng, cfg, iters);
    case 'leadOOP': return genLeadOOP(rng, cfg, iters);
    case 'checkRaised': return genCheckRaised(rng, cfg, iters);
    default: return genFacingBet(rng, cfg, iters);
  }
}

/** Builds one training spot. With cands > 1 it prefers spots close to (but not on) a decision line: harder. */
export function makeScenario(cfg: GenCfg, rng: Rng): Scenario {
  const K = Math.max(1, cfg.cands || 1);
  const list: Scenario[] = [];
  for (let i = 0; i < K; i++) list.push(rawScenario(cfg, rng, K > 1 ? 700 : 2200));
  let s = list[0];
  if (K > 1) {
    const clear = list.filter(x => x.dist > 0.04);
    const pool = clear.length ? clear : list;
    const acts = [...new Set(pool.map(x => x.correct))];
    const target = pick(rng, acts);
    const pref = pool.filter(x => x.correct === target).sort((a, b) => a.dist - b.dist);
    s = pref[0];
  }
  if (s.kind !== 'open' && K > 1) {
    s.eq = equity(s.hero, s.board, s.thr, 2600, rng, s.post);
    if (s.toCall > 0) decideFacing(s); else decideFree(s, s.kind === 'cbet' ? -0.04 : s.kind === 'bbLimp' ? -0.07 : 0);
  }
  return s;
}

export function grade(s: Scenario, a: Action | 'timeout'): 'g' | 'c' | 'b' {
  if (a === s.correct) return 'g';
  if (a !== 'timeout' && s.ok.includes(a)) return 'c';
  return 'b';
}

/* ---------------- plain-language explanations ---------------- */
const posTok = (p: Pos) => `{{${p}|${POS_NAME[p]}}}`;
const STRENGTH = ['חלשה', 'בינונית', 'טובה', 'חזקה', 'חזקה מאוד'];

/** "about 1 in 3" style wording for a probability. */
export function inWords(p: number) {
  const opts: [number, string][] = [
    [0.05, 'כמעט אף פעם'], [0.1, 'בערך פעם אחת מכל 10'], [0.125, 'בערך פעם אחת מכל 8'], [1 / 6, 'בערך פעם אחת מכל 6'],
    [0.2, 'בערך פעם אחת מכל 5'], [0.25, 'בערך פעם אחת מכל 4'], [1 / 3, 'בערך פעם אחת מכל 3'], [0.4, 'בערך 2 מכל 5 פעמים'],
    [0.5, 'בערך חצי מהפעמים'], [0.6, 'בערך 3 מכל 5 פעמים'], [2 / 3, 'בערך 2 מכל 3 פעמים'], [0.75, 'בערך 3 מכל 4 פעמים'],
    [0.8, 'בערך 4 מכל 5 פעמים'], [0.9, 'כמעט תמיד (9 מכל 10)']
  ];
  let best = opts[0];
  for (const o of opts) if (Math.abs(o[0] - p) < Math.abs(best[0] - p)) best = o;
  return best[1];
}
const pct = (x: number) => `${Math.round(x * 100)}%`;

export interface Explanation { summary: string; why: string[]; mistake?: string; numbers: { label: string; value: string }[] }

export function explain(s: Scenario, chosen: Action | 'timeout'): Explanation {
  const why: string[] = [];
  let summary = '';
  const st = STREET_TERM[s.street];
  const hand = s.made.term ? `{{${s.made.term}|${s.made.name}}}` : s.made.name;
  const sw = STRENGTH[s.made.strength];
  const vs = s.n === 1 ? 'יריב אחד' : `${s.n} יריבים`;
  const oddsLines = () => {
    why.push(`אתה צריך לשים ${s.toCall} כדי לזכות בקופה של ${s.pot + s.toCall}. בשביל שזה ישתלם, צריך לנצח לפחות ${inWords(s.need)} ({{potodds}}).`);
    why.push(`היד שלך מנצחת ${inWords(s.eff)} מול ${vs}.`);
  };
  const posLine = () => {
    if (s.street === 0) return;
    why.push(s.ip
      ? `אתה פועל אחרון בסיבוב, כלומר יש לך {{position|מיקום}}: אתה רואה מה היריב עשה לפני שאתה מחליט.`
      : `אתה פועל ראשון (בלי {{position|מיקום}}), אז קשה יותר לשחק את היד. זה מוריד קצת מהערך שלה.`);
  };
  const drawLine = () => {
    if (!s.draw) return;
    const mult = s.street === 3 ? 4 : 2;
    why.push(`יש לך {{${s.draw.term}|${s.draw.plain}}}: עוד ${s.draw.outs} קלפים בחפיסה ({{outs}}) ישלימו לך את היד. לפי {{rule24}}: ${s.draw.outs}×${mult} ≈ ${Math.min(95, s.draw.outs * mult)}%.`);
  };

  switch (s.kind) {
    case 'open': {
      const behind = Number(s.meta.behind);
      summary = `כולם לפניך עשו {{fold}}. אתה ב${posTok(s.heroPos)}, ו${behind >= 4 ? `עוד ${behind} שחקנים אחריך` : behind === 1 ? 'רק הביג בליינד אחריך' : `רק ${behind} שחקנים אחריך`}.`;
      if (s.correct === 'raise') {
        why.push(`יש לך ${hand}, יד ${sw}. מהעמדה הזו זה מספיק כדי להיכנס ליד.`);
        why.push(`נכנסים עם {{raise}} ולא עם {{limp}}: ככה לוקחים {{initiative|יוזמה}}, ולפעמים כולם מוותרים ואתה זוכה ב{{blinds|בליינדים}} מיד.`);
        if (behind >= 4) why.push('ככל שיש פחות שחקנים אחריך, אפשר לשחק יותר ידיים. מעמדה מוקדמת נכנסים רק עם ידיים טובות.');
      } else {
        why.push(`יש לך ${hand}, יד ${sw}. ${behind >= 3 ? `יש אחריך עוד ${behind} שחקנים, וכנראה שלפחות לאחד מהם יש יד טובה יותר.` : 'גם מעמדה טובה, היד הזו חלשה מדי.'}`);
        why.push(Number(s.meta.chen) >= 5 && s.heroPos !== 'BTN' ? 'מה{{BTN|כפתור}}, כשרק הבליינדים אחריך, היה אפשר לשחק אותה.' : 'לוותר כאן לא עולה לך כלום. שחקנים טובים מוותרים על רוב הידיים לפני הפלופ.');
      }
      break;
    }
    case 'vsOpen': {
      const op = s.meta.opPos as Pos;
      const callers = Number(s.meta.callers);
      summary = `שחקן ב${posTok(op)} עשה {{raise}} ל-6${callers ? ` ועוד ${callers === 1 ? 'שחקן אחד' : callers + ' שחקנים'} עשו {{call}}` : ''}. אתה ב${posTok(s.heroPos)}.`;
      why.push(`יש לך ${hand}, יד ${sw}.${Number(s.meta.opIdx) <= 1 ? ' מי שמעלה מעמדה מוקדמת מחזיק בדרך כלל יד חזקה.' : ''}`);
      oddsLines();
      if (s.correct === 'raise') why.push('זה הרבה יותר ממה שצריך, אז עושים {{threebet}}: מעלים שוב כשאתה כנראה מוביל.');
      else if (s.correct === 'call') why.push('זה מספיק כדי להשוות, אבל לא מספיק חזק כדי להעלות שוב.');
      else why.push('זה פחות ממה שצריך, ולכן לאורך זמן הקריאה הזו מפסידה כסף.');
      if (s.heroPos === 'BB') why.push('כבר שמת 2 ב{{BB|ביג בליינד}}, ולכן ההשוואה זולה יותר. מצד שני, אחרי הפלופ תפעל ראשון.');
      else if (s.heroPos === 'SB') why.push('אחרי הפלופ תפעל ראשון ({{position|בלי מיקום}}), וזה מוריד מהערך של היד.');
      else why.push('בונוס: אחרי הפלופ תפעל אחרי מי שהעלה, כלומר יש לך {{position|מיקום}}.');
      break;
    }
    case 'bbLimp': {
      const k = Number(s.meta.limpers);
      summary = `אתה ב{{BB|ביג בליינד}}. ${k === 1 ? 'שחקן אחד עשה' : `${k} שחקנים עשו`} {{limp}}: רק השוו, ואף אחד לא העלה.`;
      if (s.correct === 'raise') {
        why.push(`יש לך ${hand}, יד ${sw}, והיא מנצחת ${inWords(s.eff)} מול ${vs}.`);
        why.push('מי שעושה לימפ מחזיק בדרך כלל יד בינונית. רייז מעניש אותם ובונה קופה גדולה כשאתה מוביל.');
      } else {
        why.push(`יש לך ${hand}, יד ${sw}. היא לא מספיק חזקה כדי להעלות מול ${vs}.`);
        why.push('החדשות הטובות: אפשר לעשות {{check}} ולראות {{flop}} בחינם, בלי לשים עוד כסף.');
      }
      break;
    }
    case 'vs3bet': {
      summary = `עשית {{raise}} מ${posTok(s.heroPos)}, ושחקן ב${posTok(s.meta.vPos as Pos)} החזיר {{threebet}} ל-${s.meta.three}.`;
      why.push(`יש לך ${hand}. 3-בט מגיע בדרך כלל עם ידיים חזקות מאוד, כמו זוגות גבוהים או אס-מלך.`);
      oddsLines();
      if (s.correct === 'raise') why.push('היד שלך מספיק חזקה כדי להעלות שוב ({{fourbet}}).');
      else if (s.correct === 'call') why.push('זה מספיק כדי להשוות ולראות פלופ, אבל לא כדי להעלות שוב.');
      else why.push('מול טווח הידיים ({{range}}) החזק שלו, היד שלך לא מחזיקה. אל תתאהב ביד רק בגלל שהעלית.');
      break;
    }
    case 'cbet': {
      summary = `לפני הפלופ עשית {{raise}}, ו${s.n === 1 ? 'שחקן אחד השווה' : `${s.n} שחקנים השוו`}. ב${st} ${s.n === 1 ? 'הוא עשה' : 'כולם עשו'} {{check}} אליך.`;
      why.push(`יש לך ${hand}${s.draw ? ` ו${s.draw.plain}` : ''}. ${s.correct === 'raise' ? `זה מנצח ${inWords(s.eff)} מול ${vs}.` : `זה מנצח רק ${inWords(s.eff)} מול ${vs}.`}`);
      drawLine();
      if (s.correct === 'raise') why.push(`עדיין יש לך {{initiative|יוזמה}}, אז הימור כאן ({{cbet}}) מרוויח: ידיים חלשות יותר ישלמו לך או יוותרו.`);
      else why.push(s.street === 5 ? 'בריבר כבר אין קלפים לבוא. אם תהמר, רק ידיים שמנצחות אותך ישלמו. עדיף {{check}} ולראות.' : `${s.n >= 2 ? 'מול כמה יריבים, יש סיכוי טוב שמישהו פגע. ' : ''}{{check}} נותן לך לראות עוד קלף בחינם.`);
      break;
    }
    case 'leadOOP': {
      summary = `לפני הפלופ השווית רייז של שחקן ב${posTok(s.meta.vPos as Pos)}. עכשיו ב${st} אתה ראשון לפעול.`;
      why.push(`יש לך ${hand}${s.draw ? ` ו${s.draw.plain}` : ''}, והיד מנצחת ${inWords(s.eff)}.`);
      drawLine();
      posLine();
      if (s.correct === 'raise') why.push('היד חזקה מספיק כדי להמר בעצמך. {{valuebet|הימור ערך}}: תן לו לשלם לך.');
      else why.push('כשאתה פועל ראשון בלי יד חזקה, {{check}} הוא הבחירה הבטוחה. תראה מה היריב עושה ותחליט אחר כך.');
      break;
    }
    case 'checkRaised': {
      summary = `הימרת ${s.meta.bet} ב${st}, והיריב עשה {{checkraise}} ל-${s.meta.raise}.`;
      why.push(`יש לך ${hand}${s.draw ? ` ו${s.draw.plain}` : ''}. צ׳ק-רייז מראה בדרך כלל יד חזקה מאוד.`);
      drawLine();
      oddsLines();
      if (s.correct === 'raise') why.push('היד שלך כל כך חזקה שכדאי לשים הכול ({{allin}}).');
      else if (s.correct === 'call') why.push('יש מספיק ערך כדי להשוות, אבל לא כדי להעלות שוב.');
      else why.push('לוותר אחרי שהימרת זה לא כישלון: הכסף שכבר שמת כבר לא שלך. ההחלטה היא רק לגבי הכסף הבא.');
      break;
    }
    default: {
      const potBefore = Number(s.meta.potBefore);
      summary = `${s.ip ? 'היריב' : 'עשית {{check}}, והיריב'} הימר ${s.toCall} לתוך קופה של ${potBefore} ב${st}.${s.n > 1 ? ` עוד ${s.n - 1} שחקנים ביד ({{multiway}}).` : ''}`;
      why.push(`יש לך ${hand}, יד ${sw}.${s.street === 5 ? ' בריבר אין יותר קלפים: או שהיד שלך מנצחת או שלא.' : ''}`);
      drawLine();
      oddsLines();
      if (s.correct === 'raise') why.push('זה הרבה מעבר למה שצריך, אז מעלים: היד שלך כנראה מובילה, ורוצים שיותר כסף ייכנס לקופה.');
      else if (s.correct === 'call') why.push('זה מספיק כדי להשוות, אבל לא מספיק חזק כדי להעלות.');
      else why.push('זה פחות ממה שצריך, ולכן קריאה כאן מפסידה כסף לאורך זמן.');
      posLine();
    }
  }

  let mistake: string | undefined;
  if (chosen === 'timeout') mistake = 'נגמר הזמן. בשולחן אמיתי זה נחשב פולד.';
  else if (chosen !== s.correct && !s.ok.includes(chosen)) {
    const key = `${chosen}>${s.correct}`;
    const M: Record<string, string> = {
      'fold>call': 'ויתרת על יד ששווה להמשיך איתה. הקופה גדולה ביחס למה שצריך לשים.',
      'fold>raise': 'ויתרת על יד חזקה! עם ידיים כאלה מרוויחים את רוב הכסף.',
      'call>fold': 'להשוות כאן עולה יותר ממה שהיד שווה. לאורך זמן זה מפסיד.',
      'call>raise': 'השוואה לא נוראית, אבל השארת כסף על השולחן: עם יד כזו מעלים ובונים קופה.',
      'raise>call': 'היד טובה, אבל לא מספיק כדי להעלות. אחרי העלאה נשארות ביד בעיקר ידיים שמנצחות אותך.',
      'raise>fold': 'העלאה עם יד חלשה היא בלוף יקר. היריב כנראה מחזיק יד טובה.',
      'check>raise': 'פספסת הזדמנות להרוויח: יד חזקה רוצה שיכניסו כסף לקופה.',
      'raise>check': 'להמר כאן זה מסוכן: בעיקר ידיים טובות יותר ישלמו לך.'
    };
    mistake = M[key] || (chosen === 'call' && s.kind === 'open' ? '{{limp}} כמעט אף פעם לא הבחירה הנכונה: או שהיד שווה רייז, או שהיא שווה פולד.' : undefined);
    if (s.kind === 'open' && chosen === 'call') mistake = '{{limp}} כמעט אף פעם לא הבחירה הנכונה: או שהיד שווה רייז, או שהיא שווה פולד.';
  } else if (chosen !== s.correct) {
    mistake = `ההחלטה הייתה ממש על הגבול, אז גם ${ACT_NAME[chosen as Action]} מקבל ניקוד חלקי.`;
  }

  const numbers: { label: string; value: string }[] = [];
  if (s.kind === 'open') {
    numbers.push({ label: 'ציון היד (נוסחת צ׳ן)', value: String(s.meta.chen) });
    numbers.push({ label: `מינימום לפתיחה מ-${s.heroPos}`, value: String(s.meta.openThr) });
  } else {
    numbers.push({ label: 'אקוויטי', value: pct(s.eq) });
    if (s.R < 1) numbers.push({ label: 'אחרי מיקום', value: `${pct(s.eff)} (×${s.R})` });
    if (s.toCall > 0) numbers.push({ label: 'נדרש לקול', value: `${s.toCall}÷${s.pot + s.toCall} = ${pct(s.need)}` });
    numbers.push({ label: s.toCall > 0 ? 'סף לרייז' : 'סף להימור', value: pct(s.raiseThr) });
    numbers.push({ label: 'חלק הוגן', value: pct(s.fair) });
  }
  return { summary, why, mistake, numbers };
}
