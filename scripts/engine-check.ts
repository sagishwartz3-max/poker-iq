import { mulberry32, RN, SUITS } from '../src/engine/cards';
import { makeScenario, explain, type Kind } from '../src/engine/scenarios';
const kinds: Kind[] = ['open','vsOpen','bbLimp','vs3bet','cbet','leadOOP','facingBet','checkRaised'];
const card = (c:number)=>RN[c>>2]+SUITS[c&3];
const rng = mulberry32(42);
const counts: Record<string, Record<string, number>> = {};
let t0 = Date.now();
for (const k of kinds) {
  counts[k] = {};
  for (let i = 0; i < 40; i++) {
    const s = makeScenario({ kinds: [k], streets: [3,4,5], opp: [1,3], cands: 5 }, rng);
    counts[k][s.correct] = (counts[k][s.correct]||0)+1;
    if (s.hero.some(c => s.board.includes(c))) throw new Error('dup card');
    if (!s.buttons.some(b=>b.action===s.correct)) throw new Error('correct not in buttons '+k);
    const e = explain(s, s.correct === 'fold' ? 'call' : 'fold');
    if (i === 0) console.log(`\n[${k}] ${s.heroPos} ${s.hero.map(card).join(' ')} | ${s.board.map(card).join(' ')} pot=${s.pot} call=${s.toCall} eq=${s.eq.toFixed(2)} -> ${s.correct}\n  ${e.summary}\n  - ${e.why.join('\n  - ')}\n  ! ${e.mistake ?? ''}`);
  }
}
console.log('\ncorrect-action mix per kind:', JSON.stringify(counts));
console.log('ms per spot:', ((Date.now()-t0)/320).toFixed(0));
// determinism check (needed for duels and the daily challenge)
const a = makeScenario({ kinds, cands: 3 }, mulberry32(7)), b = makeScenario({ kinds, cands: 3 }, mulberry32(7));
console.log('deterministic:', JSON.stringify(a) === JSON.stringify(b));
