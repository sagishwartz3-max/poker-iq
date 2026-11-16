import { mulberry32 } from '../src/engine/cards';
import { act, endHand, gift, newTable, rebuy, seat, startHand, canRebuy, mayRaise, type TS } from '../src/engine/holdem';
const rng = mulberry32(2026);
let hands = 0, showdowns = 0, splits = 0, allins = 0, games = 0, maxActs = 0;
for (let g = 0; g < 400; g++) {
  const n = 2 + Math.floor(rng() * 8);
  const s: TS = newTable('T', 'p0', { stack: 1000 + Math.floor(rng() * 3) * 500, levelMin: rng() < 0.5 ? 1 : 0, rebuys: Math.floor(rng() * 3), turnSec: 30 });
  for (let i = 0; i < n; i++) seat(s, 'p' + i, 'P' + i);
  let now = 1e6, bank = () => s.players.reduce((a, p) => a + p.stack + p.pending, 0) + s.pot;
  let expected = bank();
  for (let h = 0; h < 300; h++) {
    now += 20000;
    if (!startHand(s, rng, now)) { const r = s.players.find(p => canRebuy(s, p)); if (r && rng() < 0.9) { rebuy(s, r.id); expected += s.cfg.stack; continue; } break; }
    hands++;
    if (bank() !== expected) throw new Error('chips changed at deal');
    let acts = 0;
    while (s.phase === 'hand') {
      if (++acts > 400) throw new Error('hand does not end');
      const p = s.players.find(x => x.id === s.turn)!;
      if (!p || p.folded || p.allIn || !p.inHand) throw new Error('bad turn');
      const toCall = s.curBet - p.bet, r = rng();
      let ok: boolean;
      if (r < 0.12 && toCall > 0) ok = act(s, p.id, { type: 'fold' }, now);
      else if (r < 0.62 || !mayRaise(s, p)) ok = act(s, p.id, toCall > 0 ? { type: 'call' } : { type: 'check' }, now);
      else if (r < 0.95) ok = act(s, p.id, { type: 'raise', to: s.curBet + s.minRaise + Math.floor(rng() * 4) * s.bb }, now);
      else { ok = act(s, p.id, { type: 'raise', to: 1e9 }, now); allins++; }
      if (!ok) throw new Error('legal action rejected ' + JSON.stringify({ r, toCall, cur: s.curBet, min: s.minRaise, bet: p.bet, stack: p.stack }));
      if (act(s, 'nobody', { type: 'fold' }, now)) throw new Error('accepted action from wrong player');
      if (rng() < 0.01) { const t = s.players[Math.floor(rng() * n)]; gift(s, t.id, 300); expected += 300; }
      if (bank() !== expected) throw new Error('chips changed mid-hand');
    }
    maxActs = Math.max(maxActs, acts);
    if (Object.keys(s.shown).length) showdowns++;
    if (s.winners.length > 1) splits++;
    if (s.players.some(p => p.stack < 0)) throw new Error('negative stack');
    if (s.winners.reduce((a, w) => a + w.amount, 0) <= 0) throw new Error('nobody won');
    endHand(s);
    if (bank() !== expected) throw new Error('chips changed at end');
    if (s.phase === 'over') break;
  }
  games++;
}
console.log(JSON.stringify({ games, hands, showdowns, splits, allins, maxActs }), 'OK: chips always conserved');
