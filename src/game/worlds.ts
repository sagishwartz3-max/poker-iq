import type { GenCfg, Kind } from '../engine/scenarios';

export interface World {
  name: string; sub: string; kinds: Kind[]; streets?: (3 | 4 | 5)[]; opp?: [number, number]; draw?: boolean;
  timer?: number[]; lesson: string[]; hue: number;
}

export const WORLDS: World[] = [
  { name: 'צעדים ראשונים', sub: 'כולם ויתרו ועכשיו תורך. נכנסים או לא?', kinds: ['open'], hue: 152,
    lesson: ['ב{{preflop}} יש לך רק שני קלפים. ההחלטה הראשונה: לשחק או לוותר.', 'ה{{position|עמדה}} שלך קובעת הרבה. מ{{UTG|עמדה ראשונה}} כל השולחן אחריך, אז משחקים רק ידיים חזקות. מה{{BTN|כפתור}} אפשר לשחק הרבה יותר.', 'כשנכנסים, עושים {{raise}} ולא {{limp}}.'] },
  { name: 'מול העלאה', sub: 'מישהו העלה לפניך. מה עושים?', kinds: ['vsOpen', 'vsOpen', 'bbLimp'], opp: [1, 2], hue: 200,
    lesson: ['כשמישהו עושה {{raise}}, יש לו בדרך כלל יד טובה. צריך יד טובה יותר כדי להמשיך.', 'שלוש אפשרויות: {{fold}}, {{call}} כדי לראות פלופ, או {{threebet}} עם ידיים חזקות מאוד.', 'ב{{BB|ביג בליינד}} כבר שמת כסף, אז להשוות זול יותר.'] },
  { name: 'הפלופ', sub: 'שלושה קלפים על השולחן', kinds: ['cbet', 'leadOOP', 'facingBet'], streets: [3], opp: [1, 1], hue: 45,
    lesson: ['ב{{flop}} נפתחים 3 קלפים משותפים. עכשיו בודקים: פגעתי? יש לי {{draw}}?', 'כשמישהו מהמר, משווים בין מה שתשלם לבין גודל הקופה. זה נקרא {{potodds}}.', 'אם העלית לפני הפלופ, יש לך {{initiative|יוזמה}}, ולרוב כדאי להמשיך להמר ({{cbet}}).'] },
  { name: 'טרן וריבר', sub: 'פחות קלפים לבוא, פחות מקום לטעויות', kinds: ['cbet', 'leadOOP', 'facingBet'], streets: [4, 5], opp: [1, 2], hue: 18,
    lesson: ['ב{{turn}} נשאר רק קלף אחד לבוא, אז {{draw}} שווה בערך חצי ממה שהיה שווה בפלופ.', 'ב{{river}} כבר אין קלפים: או שיש לך את היד, או שאין.', 'הימור גדול בריבר מגיע בדרך כלל מיד חזקה.'] },
  { name: 'דרואים', sub: 'אאוטים וחוק 2 ו-4', kinds: ['facingBet'], streets: [3, 4], opp: [1, 2], draw: true, hue: 280,
    lesson: ['{{outs}} הם הקלפים שישלימו לך את היד.', '{{rule24}}: בפלופ תכפיל את מספר האאוטים ב-4, ובטרן ב-2.', '{{flushdraw}} = 9 אאוטים, {{oesd}} = 8, {{gutshot}} = 4.'] },
  { name: 'פרו נגד השעון', sub: 'הכול ביחד, עם שעון', kinds: ['open', 'vsOpen', 'bbLimp', 'vs3bet', 'cbet', 'leadOOP', 'facingBet', 'checkRaised'], opp: [1, 4], timer: [20, 15, 10], hue: 0,
    lesson: ['עכשיו הכול ביחד, ויש שעון.', 'אין זמן לחשב עד הסוף. תשאל את עצמך: איפה אני יושב? כמה היד שלי חזקה? כמה עולה לי להמשיך?'] },
  { name: 'שולחן לוחץ', sub: 'העולם האחרון: 3-בט, צ׳ק-רייז ושולחנות מלאים', kinds: ['vs3bet', 'checkRaised', 'facingBet', 'vsOpen'], streets: [3, 4, 5], opp: [2, 4], hue: 330,
    lesson: ['{{threebet}} ו{{checkraise}} הם מהלכים שמראים כוח. צריך יד טובה כדי להמשיך מולם.', 'ב{{multiway}} כל יד שווה פחות, כי יותר אנשים יכולים לנצח אותך.', 'הכסף שכבר שמת בקופה כבר לא שלך. כל החלטה נמדדת רק לפי הכסף הבא.'] }
];

export const HANDS_PER_ROUND = 10;
export const stageCfg = (w: number, l: number): GenCfg => {
  const W = WORLDS[w];
  return { kinds: W.kinds, streets: W.streets, opp: W.opp, draw: W.draw, cands: 1 + 2 * Math.min(3, l + (w >= 3 ? 1 : 0)) };
};
const ALL_KINDS = WORLDS[5].kinds;
export const DAILY_CFG: GenCfg = { kinds: ALL_KINDS, opp: [1, 3], cands: 5 };
export const DUEL_CFG: GenCfg = { kinds: ALL_KINDS, opp: [1, 3], cands: 3 };

export const LEVELS = [0, 800, 2000, 3800, 6000, 9000, 13000, 18000, 24000, 31000];
export const LEVEL_NAMES = ['מתחיל', 'דג קטן', 'שחקן בית', 'קורא קלפים', 'גריינדר', 'כריש צעיר', 'רג׳ מנוסה', 'מקצוען', 'כריש', 'אגדת השולחן'];
export const levelOf = (xp: number) => { let i = 0; while (i < LEVELS.length - 1 && xp >= LEVELS[i + 1]) i++; return i; };

const PRE: GenCfg['kinds'] = ['open', 'vsOpen', 'bbLimp', 'vs3bet'];
const POST: GenCfg['kinds'] = ['cbet', 'leadOOP', 'facingBet', 'checkRaised'];
/** Targeted practice for one leak-map skill. `keep` filters spots the generator cannot target directly. */
export function drillCfg(key: string): { cfg: GenCfg; keep?: (s: import('../engine/scenarios').Scenario) => boolean } {
  const [t, v] = key.split(':');
  if (t === 'k') return { cfg: { kinds: [v as GenCfg['kinds'][number]], opp: [1, 3], cands: 3 } };
  if (t === 's') return v === '0' ? { cfg: { kinds: PRE, opp: [1, 3], cands: 3 } } : { cfg: { kinds: POST, streets: [Number(v) as 3 | 4 | 5], opp: [1, 3], cands: 3 } };
  if (t === 'p') return { cfg: { kinds: POST, opp: [1, 2], cands: 3 }, keep: s => s.ip === (v === 'ip') };
  if (t === 'n') return { cfg: { kinds: ['facingBet', 'cbet', 'vsOpen', 'bbLimp'], opp: [3, 5], cands: 3 }, keep: s => s.n >= 3 };
  return { cfg: { kinds: ['facingBet'], streets: [3, 4], opp: [1, 2], draw: true, cands: 3 } };
}
