// Automated playtest: variety, difficulty curve per skill level, label noise, speed.
import { chenOf, equity, mulberry32, RN } from '../src/engine/cards';
import { makeScenario, grade, explain, type Action, type Scenario } from '../src/engine/scenarios';
import { WORLDS, stageCfg } from '../src/game/worlds';

const N = Number(process.argv[2] || 200);
const pick = <T,>(a: T[], r: () => number) => a[Math.floor(r() * a.length)];
const handClass = (h: number[]) => { const a = h[0] >> 2, b = h[1] >> 2, hi = Math.max(a, b), lo = Math.min(a, b); return RN[hi] + RN[lo] + (a === b ? '' : (h[0] & 3) === (h[1] & 3) ? 's' : 'o'); };
const has = (s: Scenario, a: Action) => s.buttons.some(b => b.action === a);

// --- simulated players ---
type Bot = (s: Scenario, r: () => number) => Action;
const random: Bot = (s, r) => pick(s.buttons.map(b => b.action), r);
// Novice: only looks at own hand strength. Ignores price, position, opponents.
const novice: Bot = s => {
  const st = s.made.strength;
  if (s.toCall > 0) return st >= 3 ? 'raise' : st >= 1 ? 'call' : 'fold';
  if (s.kind === 'open') return st >= 2 ? 'raise' : st >= 1 ? 'call' : 'fold';
  return st >= 3 ? 'raise' : 'check';
};
// Learner: hand strength + position + pot odds with the rule of 2/4 (what the game teaches).
const learner: Bot = s => {
  const st = s.made.strength;
  if (s.kind === 'open') { const need = { UTG: 4, HJ: 3, CO: 3, BTN: 2, SB: 3, BB: 9 }[s.heroPos]; return st >= need ? 'raise' : 'fold'; }
  let est = [0.15, 0.3, 0.45, 0.62, 0.8][st];
  if (s.street > 0 && s.draw) est = Math.max(est, (s.draw.outs * (s.street === 3 ? 4 : 2)) / 100);
  est = est / Math.sqrt(s.n) * (s.ip ? 1 : 0.9);
  if (s.toCall > 0) { const need = s.toCall / (s.pot + s.toCall); return est > need + 0.25 && st >= 3 ? 'raise' : est >= need ? 'call' : 'fold'; }
  return est >= 0.5 ? 'raise' : 'check';
};
const oracle: Bot = s => s.correct;
const bots: Record<string, Bot> = { random, novice, learner, oracle };

const out: string[] = [];
const log = (x: string) => { out.push(x); console.log(x); };
const pts = (g: string) => (g === 'g' ? 100 : g === 'c' ? 70 : 0);

log(`# Playtest — ${N} spots per stage\n`);
const allClasses = new Set<string>();
const sitKeys = new Set<string>();
let tGen = 0, nGen = 0;
for (let w = 0; w < WORLDS.length; w++) {
  for (let l = 0; l < 3; l++) {
    const cfg = stageCfg(w, l);
    const rng = mulberry32(1000 * w + l + 7);
    const br = mulberry32(99);
    const kinds: Record<string, number> = {}, corr: Record<string, number> = {}, streets: Record<string, number> = {}, pos: Record<string, number> = {};
    const score: Record<string, number> = { random: 0, novice: 0, learner: 0, oracle: 0 };
    let partial = 0; const classes = new Set<string>(); const sums = new Set<string>();
    for (let i = 0; i < N; i++) {
      const t = performance.now(); const s = makeScenario(cfg, rng); tGen += performance.now() - t; nGen++;
      kinds[s.kind] = (kinds[s.kind] || 0) + 1; corr[s.correct] = (corr[s.correct] || 0) + 1;
      streets[s.street] = (streets[s.street] || 0) + 1; pos[s.heroPos] = (pos[s.heroPos] || 0) + 1;
      if (s.ok.length > 1) partial++;
      classes.add(handClass(s.hero)); allClasses.add(handClass(s.hero));
      sitKeys.add(`${s.kind}|${s.heroPos}|${s.street}|${s.n}|${s.correct}`);
      sums.add(explain(s, s.correct).why.join('|'));
      for (const [k, b] of Object.entries(bots)) { const a = b(s, br); score[k] += pts(grade(s, has(s, a) ? a : s.buttons[0].action)); }
    }
    const fmt = (o: Record<string, number>) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round((v / N) * 100)}%`).join(', ');
    const avg = (k: string) => Math.round(score[k] / N);
    log(`## World ${w + 1} "${WORLDS[w].name}" · stage ${l + 1}`);
    log(`- correct answer mix: ${fmt(corr)} | borderline (2 answers accepted): ${Math.round((partial / N) * 100)}%`);
    log(`- kinds: ${fmt(kinds)} | streets: ${fmt(streets)} | positions: ${fmt(pos)}`);
    log(`- distinct hand classes: ${classes.size}/169 | distinct explanations: ${sums.size}/${N}`);
    log(`- avg points per hand (of 100) → random ${avg('random')}, novice ${avg('novice')}, learner ${avg('learner')}, oracle ${avg('oracle')}`);
    log(`- stars a bot would get (≥60 pass): novice ${avg('novice') >= 90 ? 3 : avg('novice') >= 75 ? 2 : avg('novice') >= 60 ? 1 : 0}★, learner ${avg('learner') >= 90 ? 3 : avg('learner') >= 75 ? 2 : avg('learner') >= 60 ? 1 : 0}★\n`);
  }
}
log(`Distinct hand classes overall: ${allClasses.size}/169. Distinct situation types (kind×position×street×players×answer): ${sitKeys.size}`);
log(`Average generation time per hand (desktop Node): ${(tGen / nGen).toFixed(1)} ms → est. phone ×4: ${((tGen / nGen) * 4).toFixed(0)} ms`);

// --- label noise: does the "right answer" flip if we re-run the Monte Carlo with another seed? ---
let flips = 0, checked = 0;
const nr = mulberry32(5);
for (let i = 0; i < 300; i++) {
  const s = makeScenario({ kinds: ['vsOpen', 'cbet', 'facingBet', 'leadOOP', 'checkRaised', 'bbLimp', 'vs3bet'], opp: [1, 3], cands: 1 }, nr);
  const eq2 = equity(s.hero, s.board, s.thr, 2200, mulberry32(i + 777), s.post);
  const e2 = eq2 * s.R;
  let c2: Action;
  if (s.toCall > 0) c2 = e2 >= s.raiseThr ? 'raise' : e2 >= s.need ? 'call' : 'fold'; else c2 = e2 >= s.raiseThr ? 'raise' : 'check';
  checked++; if (c2 !== s.correct && !s.ok.includes(c2)) flips++;
}
log(`Label noise: in ${flips}/${checked} spots (${((flips / checked) * 100).toFixed(1)}%) a second simulation would mark a different answer as wrong.`);
require('fs').writeFileSync('/tmp/claude-0/-home-user-ninety-days/bf269362-c279-5cae-8d1c-ee9ccfa88651/scratchpad/playtest-report.md', out.join('\n'));
