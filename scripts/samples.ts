import { mulberry32, RN, SUITS } from '../src/engine/cards';
import { makeScenario, explain, ACT_NAME } from '../src/engine/scenarios';
import { stageCfg } from '../src/game/worlds';
const card = (c: number) => RN[c >> 2] + SUITS[c & 3];
const strip = (t: string) => t.replace(/\{\{(\w+)\|?([^}]*)\}\}/g, (_, k, l) => l || k);
const rng = mulberry32(31337);
for (const [w, l] of [[2, 2], [3, 1], [3, 2], [4, 1], [5, 0], [5, 1], [5, 2], [6, 2]]) {
  for (let i = 0; i < 2; i++) {
    const s = makeScenario(stageCfg(w, l), rng);
    const e = explain(s, s.correct);
    console.log(`\n[W${w + 1}.${l + 1} ${s.kind}] ${s.heroPos} ${s.ip ? 'IP' : 'OOP'} | ${s.hero.map(card).join(' ')} | ${s.board.map(card).join(' ') || '-'} | pot ${s.pot} call ${s.toCall} | eq ${(s.eq * 100).toFixed(0)}% need ${(s.need * 100).toFixed(0)}% → ${ACT_NAME[s.correct]}`);
    console.log('  ' + strip(e.summary));
    e.why.forEach(x => console.log('  • ' + strip(x)));
  }
}
