import { dueMistakes, nodeId, SKILLS, type Progress } from './progress';
import { grade, makeScenario, type Scenario } from '../engine/scenarios';
import { drillCfg, WORLDS } from './worlds';
import { TIPS, tipsDone } from './tips';

/**
 * The personal learning path: nine knowledge levels from "first hand" to "master".
 * A level is reached by passing its checkpoint (8 of 10 good decisions in that skill).
 * The diagnostic decides where the path starts and what each step is for.
 */
export interface KLevel { name: string; sub: string; skills: string[]; w: number; test: string; lesson: string[] }
export const KLEVELS: KLevel[] = [
  { name: 'יסודות', sub: 'עם אילו ידיים נכנסים, ולמה העמדה קובעת', skills: ['k:open'], w: 0, test: 'k:open', lesson: WORLDS[0].lesson },
  { name: 'מול העלאה', sub: 'מתי ממשיכים כשמישהו העלה לפניך', skills: ['k:vsOpen', 'k:bbLimp'], w: 1, test: 'k:vsOpen', lesson: WORLDS[1].lesson },
  { name: 'הפלופ', sub: 'פגעתי? להמשיך להמר?', skills: ['k:cbet', 's:3'], w: 2, test: 's:3', lesson: WORLDS[2].lesson },
  { name: 'סיכויים ודרואו', sub: 'אאוטים, חוק 2 ו-4 וסיכויי קופה', skills: ['d:draw'], w: 4, test: 'd:draw', lesson: WORLDS[4].lesson },
  { name: 'טרן וריבר', sub: 'פחות קלפים לבוא, החלטות גדולות יותר', skills: ['s:4', 's:5'], w: 3, test: 's:5', lesson: WORLDS[3].lesson },
  { name: 'מיקום', sub: 'לשחק עם מיקום ובלי מיקום', skills: ['p:ip', 'p:oop', 'k:leadOOP'], w: -1, test: 'p:oop',
    lesson: ['עם {{position|מיקום}} אתה פועל אחרון: רואה מה כולם עשו לפני שאתה מחליט. זה שווה הרבה.', 'בלי מיקום משחקים יד צרה יותר, ולעיתים קרובות {{check}} כשהיד בינונית.', 'אותה יד שווה יותר על ה{{BTN|כפתור}} מאשר בעמדה ראשונה.'] },
  { name: 'שולחן מלא', sub: 'כשיש הרבה יריבים בקופה', skills: ['n:multi'], w: 6, test: 'n:multi', lesson: [WORLDS[6].lesson[1], 'מול 3 יריבים ומעלה, יד שהייתה טובה מול אחד הופכת לבינונית.', 'מהמרים בשביל {{valuebet|ערך}} רק עם ידיים חזקות באמת.'] },
  { name: 'שולחן לוחץ', sub: '3-בט וצ׳ק-רייז', skills: ['k:vs3bet', 'k:checkRaised'], w: 6, test: 'k:vs3bet', lesson: [WORLDS[6].lesson[0], WORLDS[6].lesson[2]] },
  { name: 'מאסטר', sub: 'הכול ביחד, נגד השעון', skills: Object.keys(SKILLS).filter(k => !k.startsWith('a:')), w: 5, test: 'a:all', lesson: WORLDS[5].lesson }
];
export const TOP = KLEVELS.length; // 9

/** The diagnostic: one hand per level 1..8, in the same order (the master level has no own hand). */
export const DIAG_KEYS = KLEVELS.slice(0, 8).map(l => l.test);

export interface Diag {
  at: string;
  /** 0 never played · 1 knows the rules · 2 home games · 3 plays a lot / online */
  exp: number;
  /** 0 monthly or less · 1 a few times a month · 2 weekly · 3 almost daily */
  freq: number;
  hard: string[];
  goal: string;
  mins: number;
  items: ('g' | 'c' | 'b')[];
}
export const HARD: [string, string, number[]][] = [
  ['pre', 'לדעת עם אילו ידיים להיכנס', [0, 1]],
  ['post', 'מה לעשות אחרי הפלופ', [2, 4]],
  ['fold', 'מתי לוותר על יד', [1, 2, 4]],
  ['raise', 'מתי להעלות ולהמר', [0, 7]],
  ['odds', 'לחשב סיכויים', [3]],
  ['pos', 'איפה אני יושב ולמה זה משנה', [5]]
];

const val = (g: 'g' | 'c' | 'b') => (g === 'g' ? 1 : g === 'c' ? 0.7 : 0);
export const diagAcc = (d?: Diag) => (d && d.items.length ? d.items.reduce((t, g) => t + val(g), 0) / d.items.length : 0.5);
export const passedCount = (p: Progress) => KLEVELS.filter((_, i) => p.passed?.[i]).length;
export const currentLevel = (p: Progress) => { const i = KLEVELS.findIndex((_, k) => !p.passed?.[k]); return i < 0 ? TOP : i; };
/** Got this level's diagnostic hand right: offer the checkpoint first, no lesson needed. */
export const knownFromDiag = (p: Progress, L: number) => !!p.diag && L < 8 && p.diag.items[L] !== undefined && p.diag.items[L] !== 'b';
export const wantsHelp = (p: Progress, L: number) => !!p.diag && HARD.some(([k, , ls]) => p.diag!.hard.includes(k) && ls.includes(L));

const accOf = (p: Progress, k: string) => { const v = p.skills[k]; return v && v[0] ? v[1] / v[0] / 100 : null; };
/** How sure we are about each skill: accuracy with at least 5 hands. */
export function skillAcc(p: Progress, L: number) {
  return KLEVELS[L].skills.filter(k => SKILLS[k]).map(k => ({ key: k, name: SKILLS[k], n: p.skills[k]?.[0] ?? 0, acc: accOf(p, k) }));
}

/**
 * Poker IQ score, 5..99. It starts from the diagnostic and climbs with every knowledge level passed;
 * real accuracy in practice nudges it up or down a little.
 */
export const POTENTIAL = 97;
export function iqScore(p: Progress) {
  const base = Math.round(25 + 50 * diagAcc(p.diag));
  const seen = Object.entries(p.skills).filter(([k, v]) => SKILLS[k] && v[0] >= 5);
  const acc = seen.length ? seen.reduce((t, [, v]) => t + v[1] / v[0] / 100, 0) / seen.length : diagAcc(p.diag);
  return Math.max(5, Math.min(99, Math.round(base + (POTENTIAL - base) * passedCount(p) / TOP + (acc - 0.75) * 10)));
}
export const iqBase = (p: Progress) => Math.round(25 + 50 * diagAcc(p.diag));

/**
 * The "screen time" view of poker mistakes: an honest estimate from the questionnaire and the diagnostic hands.
 * A home-game evening is about 40 real decisions; a costly mistake is worth roughly 3 big blinds.
 */
export const SESSIONS = [12, 36, 52, 150];
export function estimate(d: Diag) {
  const err = 1 - diagAcc(d);
  const perNight = Math.round(40 * err);
  const nights = d.exp === 0 ? 52 : SESSIONS[d.freq] ?? 52;
  const left = TOP; // levels still to go right after the diagnostic
  // about 12 minutes of play per level, plus the same again in practice
  const days = Math.max(7, Math.ceil(left * 12 * 2 / Math.max(2, d.mins)));
  return { err, perNight, perYear: perNight * nights, bbYear: perNight * nights * 3, nights, days, hypothetical: d.exp === 0 };
}

export type Step =
  | { kind: 'lesson'; level: number; title: string; why: string }
  | { kind: 'stage'; w: number; l: number; title: string; why: string }
  | { kind: 'drill'; key: string; title: string; why: string }
  | { kind: 'check'; level: number; title: string; why: string }
  | { kind: 'review'; title: string; why: string };

/** What to do next on the path, at most three steps, each with the reason it is there for this player. */
export function nextSteps(p: Progress): Step[] {
  const L = currentLevel(p);
  if (L >= TOP) {
    const due = dueMistakes(p).length;
    return [
      ...(due ? [{ kind: 'review' as const, title: `חזרה על ${due} טעויות`, why: 'מאסטר שומר על החדות: הטעויות חוזרות עד שהן נעלמות' }] : []),
      { kind: 'drill', key: weakest(p, 8), title: `אימון: ${SKILLS[weakest(p, 8)]}`, why: 'התחום שהכי פחות מדויק אצלך כרגע' }
    ];
  }
  const K = KLEVELS[L], steps: Step[] = [];
  const known = knownFromDiag(p, L);
  const nT = TIPS[L].length, dT = tipsDone(p.tips, L);
  if (dT < nT) steps.push({ kind: 'lesson', level: L, title: `שיעורים: ${K.name} (${dT}/${nT})`, why: known ? 'גם אם אתה כבר יודע: הטיפים שמפרידים בין טוב למצוין' : 'הרעיונות החשובים ברמה הזאת, עם שאלה קצרה אחרי כל אחד' });
  if (!known && K.w >= 0) {
    const l = [0, 1, 2].find(x => !(p.stars[nodeId(K.w, x)] > 0));
    if (l !== undefined) steps.push({ kind: 'stage', w: K.w, l, title: `שיעור: ${WORLDS[K.w].name} · שלב ${l + 1}`,
      why: p.diag && p.diag.items[L] === 'b' ? 'באבחון טעית ביד מהסוג הזה. מתחילים מהבסיס' : 'שיעור קצר ו-10 ידיים לתרגול' });
  }
  const wk = weakest(p, L);
  steps.push({ kind: 'drill', key: wk, title: `אימון ממוקד: ${SKILLS[wk]}`, why: wantsHelp(p, L) ? 'סימנת שזה קשה לך: עוד תרגול בדיוק כאן' : 'התחום הכי חלש אצלך ברמה הזאת' });
  steps.push({ kind: 'check', level: L, title: `מבחן רמה: ${K.name}`, why: known ? 'באבחון ענית נכון ביד כזאת: אפשר לנסות לעבור ישר' : '8 החלטות טובות מתוך 10 ואתה עולה רמה' });
  const due = dueMistakes(p).length;
  const ordered = known ? [steps.find(s => s.kind === 'check')!, ...steps.filter(s => s.kind !== 'check')] : steps;
  // the level test always stays on the list; a review of old mistakes comes after it
  if (due >= 3) ordered.push({ kind: 'review', title: `חזרה על ${due} טעויות`, why: 'ידיים שטעית בהן חוזרות עד שהן נכנסות לראש' });
  return ordered.slice(0, 5);
}

function weakest(p: Progress, L: number) {
  const list = skillAcc(p, L);
  // untested first, then lowest accuracy
  list.sort((a, b) => (a.n >= 5 ? 1 : 0) - (b.n >= 5 ? 1 : 0) || (a.acc ?? 0) - (b.acc ?? 0));
  return list[0]?.key ?? KLEVELS[Math.min(L, 7)].test;
}

/**
 * Ten checkpoint hands with a balanced mix of right answers, so a level can't be passed by tapping
 * the same button every time: no action is right in more than 4 of them (5 where only two actions occur).
 */
export function checkpointHands(key: string, rng: () => number): Scenario[] {
  const d = drillCfg(key);
  const pool: Scenario[] = [];
  for (let t = 0; t < 160; t++) {
    let s = makeScenario(d.cfg, rng);
    for (let k = 0; k < 30 && d.keep && !d.keep(s); k++) s = makeScenario(d.cfg, rng);
    pool.push(s);
  }
  const kinds = new Set(pool.map(s => s.correct)).size;
  const cap = kinds <= 2 ? 5 : 4, count: Record<string, number> = {}, out: Scenario[] = [];
  // a test needs clear answers: skip borderline hands where a second action also counts
  const clear = (s: Scenario) => s.buttons.every(b => b.action === s.correct || grade(s, b.action) === 'b');
  for (const s of pool) {
    if (!clear(s) || (count[s.correct] || 0) >= cap) continue;
    count[s.correct] = (count[s.correct] || 0) + 1; out.push(s);
    if (out.length === 10) break;
  }
  for (const s of pool) { if (out.length >= 10) break; if (!out.includes(s)) out.push(s); }
  // shuffle so the mix is not grouped
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
