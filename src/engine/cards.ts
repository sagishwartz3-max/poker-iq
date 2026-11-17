// Card math: cards are integers 0..51. rank = c >> 2 (0 = deuce .. 12 = ace), suit = c & 3.
export const SUITS = ['♠', '♥', '♦', '♣'] as const;
export const RN = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
export const RANK_HE = ['שתיים', 'שלוש', 'ארבע', 'חמש', 'שש', 'שבע', 'שמונה', 'תשע', 'עשר', 'נסיך', 'מלכה', 'מלך', 'אס'];
export type Rng = () => number;

export const rankOf = (c: number) => c >> 2;
export const suitOf = (c: number) => c & 3;
export const isRed = (c: number) => (c & 3) === 1 || (c & 3) === 2;

export function mulberry32(seed: number): Rng {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashStr(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export const randInt = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
export const pick = <T,>(rng: Rng, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];

const CNT = new Int8Array(13);
export function straightHigh(m: number) {
  for (let h = 12; h >= 4; h--) if (((m >> (h - 4)) & 31) === 31) return h;
  if ((m & 0x100f) === 0x100f) return 3; // wheel A-2-3-4-5
  return -1;
}
function topBits(m: number, k: number) {
  let v = 0, c = 0;
  for (let r = 12; r >= 0 && c < k; r--) if ((m >> r) & 1) { v = (v << 4) | r; c++; }
  while (c < k) { v <<= 4; c++; }
  return v;
}
/** Score of the best 5-card hand among cs (any length 2..7). Higher wins. Category = score >> 20. */
export function evalCards(cs: number[], n = cs.length) {
  CNT.fill(0);
  let mask = 0;
  const sc = [0, 0, 0, 0], sm = [0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    const c = cs[i], r = c >> 2, s = c & 3;
    CNT[r]++; sc[s]++; sm[s] |= 1 << r; mask |= 1 << r;
  }
  for (let s = 0; s < 4; s++) if (sc[s] >= 5) {
    const sf = straightHigh(sm[s]);
    if (sf >= 0) return (8 << 20) | sf;
    return (5 << 20) | topBits(sm[s], 5);
  }
  let q = -1, t1 = -1, t2 = -1, p1 = -1, p2 = -1;
  for (let r = 12; r >= 0; r--) {
    const k = CNT[r];
    if (k === 4) q = r;
    else if (k === 3) { if (t1 < 0) t1 = r; else if (t2 < 0) t2 = r; }
    else if (k === 2) { if (p1 < 0) p1 = r; else if (p2 < 0) p2 = r; }
  }
  if (q >= 0) return (7 << 20) | (q << 4) | topBits(mask & ~(1 << q), 1);
  if (t1 >= 0 && (t2 >= 0 || p1 >= 0)) return (6 << 20) | (t1 << 4) | Math.max(t2, p1);
  const st = straightHigh(mask);
  if (st >= 0) return (4 << 20) | st;
  if (t1 >= 0) return (3 << 20) | (t1 << 8) | topBits(mask & ~(1 << t1), 2);
  if (p1 >= 0 && p2 >= 0) return (2 << 20) | (p1 << 8) | (p2 << 4) | topBits(mask & ~(1 << p1) & ~(1 << p2), 1);
  if (p1 >= 0) return (1 << 20) | (p1 << 12) | topBits(mask & ~(1 << p1), 3);
  return topBits(mask, 5);
}

/** Chen formula: a quick 2-card strength score (roughly -1 .. 20). */
export function chen(r1: number, r2: number, suited: boolean) {
  const hi = Math.max(r1, r2), lo = Math.min(r1, r2);
  const pts = (r: number) => (r === 12 ? 10 : r === 11 ? 8 : r === 10 ? 7 : r === 9 ? 6 : (r + 2) / 2);
  let s = pts(hi);
  if (hi === lo) return Math.max(5, Math.ceil(s * 2));
  if (suited) s += 2;
  const g = hi - lo - 1;
  s -= g === 0 ? 0 : g === 1 ? 1 : g === 2 ? 2 : g === 3 ? 4 : 5;
  if (g <= 1 && hi < 10) s += 1;
  return Math.ceil(s);
}
export const CHEN = new Int8Array(52 * 52);
for (let a = 0; a < 52; a++) for (let b = 0; b < 52; b++) CHEN[a * 52 + b] = chen(a >> 2, b >> 2, (a & 3) === (b & 3));
export const chenOf = (h: number[]) => CHEN[h[0] * 52 + h[1]];

/**
 * Monte Carlo equity of `hero` against opponents. Each opponent holds a hand whose Chen score is at
 * least thr[k] (a simple "range"). Deterministic for a given rng sequence.
 */
/**
 * How much an opponent's two cards "connect" with the current board:
 * 0 nothing, 1 weak pair or gutshot, 2 top pair / overpair / strong draw, 3 two pair or better.
 */
export function connectLevel(a: number, b: number, board: number[], boardScore: number, topB: number) {
  const s = evalCards([a, b, ...board]);
  const cat = s >> 20, bcat = boardScore >> 20;
  if (cat > bcat && (cat - bcat >= 2 || cat >= 4)) return 3;
  let lvl = 0;
  if (cat > bcat) {
    const ra = a >> 2, rb = b >> 2;
    lvl = (ra === rb && ra > topB) || ra === topB || rb === topB ? 2 : 1;
  }
  if (lvl < 2 && board.length < 5) {
    const all = [a, b, ...board];
    const sc = [0, 0, 0, 0];
    for (const c of all) sc[c & 3]++;
    if (cat < 5 && (sc[a & 3] === 4 || sc[b & 3] === 4)) lvl = 2;
    else if (cat < 4) {
      let m = 0; for (const c of all) m |= 1 << (c >> 2);
      let k = 0; for (let r = 0; r < 13; r++) if (!((m >> r) & 1) && straightHigh(m | (1 << r)) >= 0) k++;
      if (k >= 2) lvl = 2; else if (k === 1 && lvl < 1) lvl = 1;
    }
  }
  return lvl;
}

export function equity(hero: number[], board: number[], thr: number[], iters: number, rng: Rng, post?: number[]) {
  const used = new Set([...hero, ...board]);
  const buf: number[] = [];
  for (let c = 0; c < 52; c++) if (!used.has(c)) buf.push(c);
  const L = buf.length, n = thr.length;
  const h = new Array<number>(7), o = new Array<number>(7), opp = new Array<number>(n * 2);
  let win = 0, top = L;
  const take = () => { const j = (rng() * top) | 0; const c = buf[j]; buf[j] = buf[top - 1]; buf[top - 1] = c; top--; return c; };
  h[0] = hero[0]; h[1] = hero[1];
  for (let i = 0; i < board.length; i++) h[2 + i] = board[i];
  const bScore = board.length >= 3 ? evalCards(board) : 0;
  const topB = board.reduce((m, c) => Math.max(m, c >> 2), -1);
  const needPost = !!post && board.length >= 3 && post.some(x => x > 0);
  for (let it = 0; it < iters; it++) {
    top = L;
    for (let k = 0; k < n; k++) {
      let a = 0, b = 0, tries = 0;
      const pl = needPost ? post![k] || 0 : 0;
      for (;;) {
        a = take(); b = take();
        if (++tries > 40) break;
        if ((pl === 0 || connectLevel(a, b, board, bScore, topB) >= pl) && (CHEN[a * 52 + b] >= thr[k] || pl > 0 && tries > 12)) break;
        top += 2;
      }
      opp[2 * k] = a; opp[2 * k + 1] = b;
    }
    for (let i = board.length; i < 5; i++) h[2 + i] = take();
    const hs = evalCards(h, 7);
    let best = -1, ties = 0;
    for (let k = 0; k < n; k++) {
      o[0] = opp[2 * k]; o[1] = opp[2 * k + 1];
      for (let i = 2; i < 7; i++) o[i] = h[i];
      const s = evalCards(o, 7);
      if (s > best) { best = s; ties = 1; } else if (s === best) ties++;
    }
    if (hs > best) win += 1; else if (hs === best) win += 1 / (ties + 1);
  }
  return win / iters;
}

export function deal(rng: Rng, k: number) {
  const d: number[] = [];
  for (let c = 0; c < 52; c++) d.push(c);
  for (let i = 0; i < k; i++) { const j = i + ((rng() * (52 - i)) | 0); [d[i], d[j]] = [d[j], d[i]]; }
  return d.slice(0, k);
}

const strMask = (cards: number[]) => cards.reduce((m, c) => m | (1 << (c >> 2)), 0);
function straightOuts(m: number) { let k = 0; for (let r = 0; r < 13; r++) if (!((m >> r) & 1) && straightHigh(m | (1 << r)) >= 0) k++; return k; }

export interface Draw { fd: boolean; sd: 0 | 1 | 2; outs: number; term: string; plain: string }
export function draws(hero: number[], board: number[]): Draw | null {
  if (board.length < 3 || board.length > 4) return null;
  const all = [...hero, ...board];
  const cat = evalCards(all) >> 20;
  let fd = false, sd: 0 | 1 | 2 = 0;
  if (cat < 5) {
    const sc = [0, 0, 0, 0];
    for (const c of all) sc[c & 3]++;
    for (let x = 0; x < 4; x++) if (sc[x] === 4 && (suitOf(hero[0]) === x || suitOf(hero[1]) === x)) fd = true;
  }
  if (cat < 4) {
    const ka = straightOuts(strMask(all)), kb = straightOuts(strMask(board));
    if (ka > kb) sd = ka >= 2 ? 2 : 1;
  }
  if (!fd && !sd) return null;
  const outs = (fd ? 9 : 0) + (sd === 2 ? 8 : sd === 1 ? 4 : 0) - (fd && sd ? 2 : 0);
  const term = fd ? 'flushdraw' : sd === 2 ? 'oesd' : 'gutshot';
  const plain = fd && sd ? 'דרואו לצבע וגם לרצף' : fd ? 'דרואו לצבע' : sd === 2 ? 'דרואו לרצף פתוח' : 'דרואו לרצף פנימי';
  return { fd, sd, outs, term, plain };
}

export const CAT_NAMES = ['קלף גבוה', 'זוג', 'שני זוגות', 'שלישייה', 'רצף', 'צבע', 'פול האוס', 'רביעייה', 'רצף בצבע'];

export interface Made { cat: number; name: string; strength: 0 | 1 | 2 | 3 | 4; term?: string }
/** A plain-language description of what the hero holds right now. strength: 0 nothing .. 4 monster. */
export function madeHand(hero: number[], board: number[]): Made {
  const [a, b] = [rankOf(hero[0]), rankOf(hero[1])];
  if (board.length === 0) {
    const hi = Math.max(a, b), lo = Math.min(a, b), su = suitOf(hero[0]) === suitOf(hero[1]);
    const c = chenOf(hero);
    const strength = (c >= 10 ? 4 : c >= 8 ? 3 : c >= 6 ? 2 : c >= 4 ? 1 : 0) as Made['strength'];
    if (a === b) return { cat: 1, name: `זוג ${RN[a]} ביד`, strength, term: 'pocketpair' };
    return { cat: 0, name: `${RN[hi]}-${RN[lo]} ${su ? 'באותו צבע' : 'בצבעים שונים'}`, strength, term: su ? 'suited' : undefined };
  }
  const all = [...hero, ...board];
  const s = evalCards(all);
  const cat = s >> 20;
  const boardScore = evalCards(board);
  const boardCat = boardScore >> 20;
  const bRanks = board.map(rankOf).sort((x, y) => y - x);
  const topB = bRanks[0];
  if (cat >= 4) return { cat, name: CAT_NAMES[cat], strength: boardScore === s ? 1 : 4, term: cat === 4 ? 'straight' : cat === 5 ? 'flush' : undefined };
  if (cat === 3) {
    if (a === b && bRanks.includes(a)) return { cat, name: `סט של ${RN[a]}`, strength: 4, term: 'set' };
    if (boardCat === 3) return { cat, name: 'שלישייה על השולחן', strength: 1 };
    return { cat, name: `שלישייה של ${RN[(s >> 8) & 15]}`, strength: 3 };
  }
  if (cat === 2) {
    if (boardCat === 2) return { cat, name: 'שני הזוגות על השולחן', strength: 1 };
    if (boardCat === 1) {
      // one pair is on the board for everyone: what really counts is the pair the hero made
      const boardPair = bRanks.find((r, i) => bRanks.indexOf(r) !== i)!;
      const mine = a === b ? a : bRanks.includes(a) && a !== boardPair ? a : bRanks.includes(b) && b !== boardPair ? b : -1;
      if (mine >= 0) {
        const top = a === b ? a > topB : mine === topB;
        return { cat, name: `זוג ${RN[mine]} (ועוד זוג על השולחן)`, strength: top ? 2 : 1, term: top ? 'toppair' : undefined };
      }
    }
    return { cat, name: 'שני זוגות', strength: 3 };
  }
  if (cat === 1) {
    const p = (s >> 12) & 15;
    if (boardCat === 1 && a !== p && b !== p) return { cat, name: 'הזוג על השולחן, לא שלך', strength: 0 };
    if (a === b && a > topB) return { cat, name: `אובר-פייר ${RN[a]}`, strength: 3, term: 'overpair' };
    if (p === topB) {
      const kicker = a === p ? b : a;
      return { cat, name: `זוג עליון (${RN[p]})`, strength: kicker >= 10 || a === b ? 3 : 2, term: 'toppair' };
    }
    if (a === b) return { cat, name: `זוג ${RN[a]} מתחת לשולחן`, strength: 1 };
    return { cat, name: p >= bRanks[1] ? `זוג אמצעי (${RN[p]})` : `זוג נמוך (${RN[p]})`, strength: 1 };
  }
  return { cat, name: `קלף גבוה ${RN[Math.max(a, b)]}`, strength: 0 };
}

/** The five cards that make the best hand out of 5..7, and their score. */
export function best5(cs: number[]): { score: number; cards: number[] } {
  let score = -1, cards = cs.slice(0, 5);
  const n = cs.length, idx = [0, 1, 2, 3, 4];
  const walk = (k: number, from: number) => {
    if (k === 5) { const five = idx.map(i => cs[i]); const sc = evalCards(five); if (sc > score) { score = sc; cards = five; } return; }
    for (let i = from; i <= n - (5 - k); i++) { idx[k] = i; walk(k + 1, i + 1); }
  };
  walk(0, 0);
  return { score, cards };
}

/** "צבע, A גבוה", "שני זוגות: K ו-8", "פול האוס: 8 על K" … from an evalCards score. */
export function scoreName(s: number): string {
  const cat = s >> 20, r = (sh: number) => RN[(s >> sh) & 15];
  switch (cat) {
    case 8: return ((s & 15) === 12 ? 'רויאל פלאש' : `רצף בצבע עד ${RN[s & 15]}`);
    case 7: return `רביעייה של ${r(4)}`;
    case 6: return `פול האוס: ${r(4)} על ${r(0)}`;
    case 5: return `צבע, ${r(16)} גבוה`;
    case 4: return `רצף עד ${RN[s & 15]}`;
    case 3: return `שלישייה של ${r(8)}`;
    case 2: return `שני זוגות: ${r(8)} ו-${r(4)}`;
    case 1: return `זוג ${r(12)}`;
    default: return `קלף גבוה ${r(16)}`;
  }
}
