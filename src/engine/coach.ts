import { draws, equity, madeHand, mulberry32 } from './cards';
import { RT_F, RT_N } from './scenarios';

/** What the learning-mode helper knows about one decision at the friends' table. */
export interface TableAdvice {
  eq: number; need: number; raiseThr: number; n: number; toCall: number; pot: number;
  best: 'fold' | 'check' | 'call' | 'raise'; ok: string[]; made: string; draw: string | null;
}
export type TGrade = 'g' | 'c' | 'b';

/**
 * Same rule as the training spots: win often enough to pay the price -> continue; win clearly more -> raise.
 * Opponents are modelled as reasonable hands (Chen ≥ 2), so the numbers stay honest at a friends' table.
 */
export function tableAdvice(hero: number[], board: number[], nOpp: number, pot: number, toCall: number, seed: number): TableAdvice {
  const n = Math.max(1, Math.min(8, nOpp));
  const eq = equity(hero, board, Array(n).fill(2), 1400, mulberry32(seed));
  const k = Math.min(5, n);
  const made = madeHand(hero, board).name;
  const d = board.length >= 3 && board.length < 5 ? draws(hero, board) : null;
  if (toCall > 0) {
    const need = toCall / (pot + toCall);
    const raiseThr = Math.max(RT_F[k], need + 0.1);
    const best = eq >= raiseThr ? 'raise' : eq >= need ? 'call' : 'fold';
    const ok = new Set<string>([best]);
    if (Math.abs(eq - need) < 0.03) { ok.add('call'); ok.add('fold'); }
    if (Math.abs(eq - raiseThr) < 0.03) { ok.add('raise'); ok.add('call'); }
    return { eq, need, raiseThr, n, toCall, pot, best, ok: [...ok], made, draw: d?.plain ?? null };
  }
  const raiseThr = RT_N[k];
  const best = eq >= raiseThr ? 'raise' : 'check';
  const ok = new Set<string>([best]);
  if (Math.abs(eq - raiseThr) < 0.03) { ok.add('raise'); ok.add('check'); }
  return { eq, need: 0, raiseThr, n, toCall, pot, best, ok: [...ok], made, draw: d?.plain ?? null };
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

/** One or two short Hebrew sentences, with tappable glossary words. */
export function adviceText(a: TableAdvice): { line: string; tip: string } {
  const vs = a.n === 1 ? 'מול יריב אחד' : `מול ${a.n} יריבים`;
  const line = `${a.made}${a.draw ? ` + ${a.draw}` : ''} · מנצחת בערך ${pct(a.eq)} ${vs} ({{equity}})`;
  if (a.toCall > 0) {
    const verdict = a.best === 'raise' ? `חזק מספיק כדי להעלות: ${NAME.raise}` : a.best === 'call' ? `משתלם להשוות: ${NAME.call}` : `יקר מדי בשביל היד הזאת: ${NAME.fold}`;
    return { line, tip: `כדי לשלם ${a.toCall} צריך לנצח לפחות ${pct(a.need)} ({{potodds}}). ${verdict}` };
  }
  return { line, tip: a.best === 'raise' ? `אף אחד לא הימר, והיד שלך טובה: כדאי Bet כדי לבנות קופה` : `אין מה לשלם. היד לא חזקה מספיק להימור: ${NAME.check} זה בחינם` };
}

/** Why a past decision was right or wrong, in a few words. */
export function reviewText(a: TableAdvice, action: keyof typeof NAME, g: TGrade): string {
  const base = `${nm(action, a)}${a.toCall > 0 ? ` (שילמת ${a.toCall})` : ''}`;
  if (g === 'g') return `${base}: נכון. ${a.toCall > 0 ? `היה לך ${pct(a.eq)}, היית צריך ${pct(a.need)}` : `היה לך ${pct(a.eq)}`}`;
  if (g === 'c') return `${base}: סביר, ההחלטה הייתה על הגבול (${pct(a.eq)})`;
  return `${base}: עדיף היה ${nm(a.best, a)}. ${a.toCall > 0 ? `היה לך ${pct(a.eq)} והיית צריך ${pct(a.need)}` : `היה לך ${pct(a.eq)}`}`;
}
