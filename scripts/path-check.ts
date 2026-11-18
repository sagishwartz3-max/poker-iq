import assert from 'node:assert/strict';
import { mulberry32 } from '../src/engine/cards';
import { DIAG_KEYS, KLEVELS } from '../src/game/path';

assert.equal(DIAG_KEYS.length, 8);

// Tapping the same button on every checkpoint hand never passes a level (8 of 10 good needed).
import { grade, type Action } from '../src/engine/scenarios';
import { checkpointHands } from '../src/game/path';
let worst = 0;
for (const L of KLEVELS) for (let seed = 1; seed <= 40; seed++) {
  const hs = checkpointHands(L.test, mulberry32(seed * 97 + L.name.length));
  assert.equal(hs.length, 10);
  for (const a of ['fold', 'check', 'call', 'raise'] as Action[]) {
    const good = hs.filter(s => s.buttons.some(b => b.action === a) && grade(s, a) !== 'b').length;
    worst = Math.max(worst, good);
    assert(good < 8, `${L.name}: always ${a} got ${good}/10`);
  }
}
console.log('OK: no level checkpoint passes by repeating one action (best spam score', worst + '/10)');

// Every tip drill finds its hands quickly (the filter must not starve the generator).
import { makeScenario } from '../src/engine/scenarios';
import { TIP_DRILLS } from '../src/game/tipDrills';
import { ALL_TIPS } from '../src/game/tips';
{
  const rng = mulberry32(5), slow: string[] = [];
  for (const [id, d] of Object.entries(TIP_DRILLS)) {
    assert(ALL_TIPS.some(t => t.id === id), `drill for unknown tip ${id}`);
    let hit = 0, tries = 0;
    while (hit < 10 && tries < 600) { tries++; const s = makeScenario(d.cfg, rng); if (!d.keep || d.keep(s)) hit++; }
    if (tries > 150) slow.push(`${id}:${tries}`);
    assert.equal(hit, 10, `${id} found only ${hit} hands in 600 tries`);
  }
  console.log('OK: every tip drill finds hands', slow.length ? `(slower: ${slow.join(' ')})` : '');
}
