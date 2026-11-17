import { draws, equity, madeHand, mulberry32 } from './cards';
import { RT_F, RT_N } from './scenarios';
import { WORLDS } from '../game/worlds';

/** What the learning-mode helper knows about one decision at the friends' table. */
export interface TableAdvice {
  eq: number; need: number; raiseThr: number; n: number; toCall: number; pot: number;
  best: 'fold' | 'check' | 'call' | 'raise'; ok: string[]; made: string; draw: string | null;
  /** board cards out (0 = before the flop), outs of the draw, and whether a real raise was made before the flop */
  street: number; outs: number; raised: boolean;
}
export type TGrade = 'g' | 'c' | 'b';

/**
 * Same rule as the training spots: win often enough to pay the price -> continue; win clearly more -> raise.
 * Opponents are modelled as reasonable hands (Chen ≥ 2), so the numbers stay honest at a friends' table.
 */
export function tableAdvice(hero: number[], board: number[], nOpp: number, pot: number, toCall: number, seed: number, bb = 0, curBet = 0): TableAdvice {
  const n = Math.max(1, Math.min(8, nOpp));
  const eq = equity(hero, board, Array(n).fill(2), 1400, mulberry32(seed));
  const k = Math.min(5, n);
  const made = madeHand(hero, board).name;
  const d = board.length >= 3 && board.length < 5 ? draws(hero, board) : null;
  const extra = { street: board.length, outs: d?.outs ?? 0, raised: board.length === 0 && curBet > bb };
  if (toCall > 0) {
    const need = toCall / (pot + toCall);
    const raiseThr = Math.max(RT_F[k], need + 0.1);
    const best = eq >= raiseThr ? 'raise' : eq >= need ? 'call' : 'fold';
    const ok = new Set<string>([best]);
    if (Math.abs(eq - need) < 0.03) { ok.add('call'); ok.add('fold'); }
    if (Math.abs(eq - raiseThr) < 0.03) { ok.add('raise'); ok.add('call'); }
    return { eq, need, raiseThr, n, toCall, pot, best, ok: [...ok], made, draw: d?.plain ?? null, ...extra };
  }
  const raiseThr = RT_N[k];
  const best = eq >= raiseThr ? 'raise' : 'check';
  const ok = new Set<string>([best]);
  if (Math.abs(eq - raiseThr) < 0.03) { ok.add('raise'); ok.add('check'); }
  return { eq, need: 0, raiseThr, n, toCall, pot, best, ok: [...ok], made, draw: d?.plain ?? null, ...extra };
}

export function gradeTable(a: TableAdvice, action: 'fold' | 'check' | 'call' | 'raise'): TGrade {
  if (action === a.best) return 'g';
  if (a.ok.includes(action)) return 'c';
  return 'b';
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const NAME = { fold: 'Fold', check: 'Check', call: 'Call', raise: 'Raise' } as const;
/** With nothing to call, raising is a bet. */
const nm = (a: keyof typeof NAME, adv: TableAdvice) => (a === 'raise' && adv.toCall === 0 ? 'Bet' : NAME[a]);

/** Which lesson of the app this spot practises: world index, lesson line, and the leak-map skill keys it counts for. */
export function spotLesson(a: TableAdvice): { w: number; line: number; skills: string[] } {
  const st = a.street, sk = [`s:${st === 0 ? 0 : st}`];
  if (a.n >= 3 && (st > 0 || a.raised)) sk.push('n:multi');
  if (st === 0) { sk.push(a.raised ? 'k:vsOpen' : 'k:open'); return a.raised ? { w: 1, line: 0, skills: sk } : { w: 0, line: 1, skills: sk }; }
  if (a.toCall > 0) sk.push('k:facingBet');
  if (a.draw && st < 5) { sk.push('d:draw'); return { w: 4, line: 1, skills: sk }; }
  if (a.n >= 3) return { w: 6, line: 1, skills: sk };
  if (st === 5) return { w: 3, line: a.toCall > 0 ? 2 : 1, skills: sk };
  if (st === 4) return { w: 3, line: 0, skills: sk };
  return { w: 2, line: a.toCall > 0 ? 1 : 0, skills: sk };
}

/**
 * Before the decision: the lesson from the app that fits this spot, and a question that makes the player work it out.
 * Never the answer itself: that comes after the decision, or when the player asks for it.
 */
export function thinkText(a: TableAdvice): { from: string; lesson: string; ask: string } {
  const L = spotLesson(a), W = WORLDS[L.w];
  const vs = a.n === 1 ? 'יריב אחד' : `${a.n} יריבים`;
  let ask: string;
  if (a.draw && a.street > 0 && a.street < 5)
    ask = `יש לך ${a.draw}. כמה {{outs}} יש לך, וכמה זה באחוזים לפי {{rule24}}?${a.toCall > 0 ? ` צריך לנצח ${pct(a.need)} כדי ש-Call ישתלם.` : ''}`;
  else if (a.toCall > 0 && a.street > 0)
    ask = `תשלם ${a.toCall} לקופה של ${a.pot}, אז צריך לנצח לפחות ${pct(a.need)} ({{potodds}}). היד שלך מנצחת יותר מזה מול ${vs}?`;
  else if (a.street === 0)
    ask = a.raised ? `מישהו העלה. היד שלך טובה מספיק כדי להמשיך מול ${vs}?` : `${vs} עוד בפנים. נכנסים עם היד הזאת, או שזו יד לוותר עליה?`;
  else
    ask = `אף אחד לא הימר. היד שלך מספיק חזקה כדי להמר בשביל {{valuebet|ערך}}, או ש-Check בחינם?`;
  return { from: W.name, lesson: W.lesson[L.line] ?? W.lesson[0], ask };
}

/** The worked answer, shown only on request or after acting. */
export function answerText(a: TableAdvice): string {
  const math = a.draw && a.street > 0 && a.street < 5 ? `${a.outs} אאוטים × ${a.street === 3 ? 4 : 2} ≈ ${Math.min(99, a.outs * (a.street === 3 ? 4 : 2))}%. ` : '';
  const why = a.toCall > 0 ? `היד מנצחת בערך ${pct(a.eq)}, וצריך ${pct(a.need)}` : `היד מנצחת בערך ${pct(a.eq)}`;
  return `${math}${why}. התשובה: ${nm(a.best, a)}`;
}

/** Why a past decision was right or wrong, in a few words. */
export function reviewText(a: TableAdvice, action: keyof typeof NAME, g: TGrade): string {
  const base = `${nm(action, a)}${a.toCall > 0 ? ` (מול ${a.toCall} לשלם)` : ''}`;
  if (g === 'g') return `${base}: נכון. ${a.toCall > 0 ? `היה לך ${pct(a.eq)}, היית צריך ${pct(a.need)}` : `היה לך ${pct(a.eq)}`}`;
  if (g === 'c') return `${base}: סביר, ההחלטה הייתה על הגבול (${pct(a.eq)})`;
  return `${base}: עדיף היה ${nm(a.best, a)}. ${a.toCall > 0 ? `היה לך ${pct(a.eq)} והיית צריך ${pct(a.need)}` : `היה לך ${pct(a.eq)}`}`;
}
