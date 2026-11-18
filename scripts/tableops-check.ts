import assert from 'node:assert/strict';
import { mulberry32 } from '../src/engine/cards';
import { DEFAULT_CFG, newTable, publicView, type TS } from '../src/engine/holdem';
import { applyCmd, IDLE_END_MS } from '../src/engine/tableops';

const rng = mulberry32(11);
const total = (s: TS) => s.players.reduce((t, p) => t + p.stack + p.bet * 0, 0) + 0;

// Permissions and the waiting room
{
  let now = 1_000_000;
  const s = newTable('T1', 'a', { ...DEFAULT_CFG, rebuys: 0 });
  assert(applyCmd(s, 'a', { t: 'join', nick: 'A' }, now, rng).ok);
  assert(applyCmd(s, 'b', { t: 'join', nick: 'B' }, now, rng).ok);
  assert(!applyCmd(s, 'b', { t: 'cfg', key: 'stack', val: 5000 }, now, rng).ok, 'only the manager changes settings');
  assert(applyCmd(s, 'b', { t: 'suggest', key: 'stack', val: 5000 }, now, rng).ok);
  assert.equal(s.suggest?.length, 1);
  assert(!applyCmd(s, 'b', { t: 'suggest', key: 'stack', val: 777 }, now, rng).ok, 'only listed values');
  assert(applyCmd(s, 'a', { t: 'cfg', key: 'stack', val: 5000 }, now, rng).ok);
  assert(s.players.every(p => p.stack === 5000) && !s.suggest?.length);
  assert(!applyCmd(s, 'b', { t: 'start' }, now, rng).ok, 'only the manager starts');
  assert(applyCmd(s, 'a', { t: 'start' }, now, rng).ok && s.phase === 'hand');
  assert(!applyCmd(s, 'a', { t: 'cfg', key: 'stack', val: 1000 }, now, rng).ok, 'settings are locked once dealt');
  const v = publicView(s, now) as unknown as { deck?: unknown; players: { cards?: unknown }[] };
  assert(!v.deck && v.players.every(p => !p.cards), 'no cards in the public view');
  console.log('OK: manager-only commands, suggestions, settings lock, private cards');
}

// A whole game played only through commands and ticks: chips are conserved and it ends
{
  let now = 2_000_000;
  const s = newTable('T2', 'a', { ...DEFAULT_CFG, rebuys: 0, levelMin: 1, stack: 1000 });
  for (const id of ['a', 'b', 'c', 'd']) applyCmd(s, id, { t: 'join', nick: id.toUpperCase() }, now, rng);
  applyCmd(s, 'a', { t: 'start' }, now, rng);
  const start = s.players.reduce((t, p) => t + p.stack + p.total, 0);
  let steps = 0;
  const r = mulberry32(3);
  while (s.phase !== 'over' && steps++ < 20000) {
    now += 700;
    for (const p of s.players) applyCmd(s, p.id, { t: 'beat', vis: true }, now, rng); // everyone connected
    if (s.phase === 'hand' && s.turn) {
      const p = s.players.find(x => x.id === s.turn)!, owe = s.curBet - p.bet, x = r();
      const a = x < 0.02 ? { type: 'raise' as const, to: p.bet + p.stack } : x < 0.12 && owe < p.stack ? { type: 'raise' as const, to: s.curBet + s.minRaise } : owe > 0 ? (x < 0.4 ? { type: 'fold' as const } : { type: 'call' as const }) : { type: 'check' as const };
      applyCmd(s, p.id, { t: 'act', hand: s.handNo, a }, now, rng);
    } else { now += 7000; applyCmd(s, 'a', { t: 'tick' }, now, rng); }
    const inPlay = s.players.reduce((t, p) => t + p.stack, 0) + (s.phase === 'hand' ? s.pot : 0);
    assert.equal(inPlay, start, 'chips conserved');
  }
  assert.equal(s.phase, 'over', 'the game finishes');
  console.log('OK: full game through commands and ticks, chips conserved, hands', s.handNo);
}

// Connections: away after 15 s, sitting out after 20 more, back on return; empty table closes after 10 minutes
{
  let now = 3_000_000;
  const s = newTable('T3', 'a', DEFAULT_CFG);
  for (const id of ['a', 'b', 'c']) applyCmd(s, id, { t: 'join', nick: id }, now, rng);
  applyCmd(s, 'a', { t: 'start' }, now, rng);
  for (let k = 0; k < 12; k++) { now += 4000; applyCmd(s, 'a', { t: 'beat', vis: true }, now, rng); applyCmd(s, 'b', { t: 'beat', vis: true }, now, rng); }
  const c = s.players.find(p => p.id === 'c')!;
  assert(c.away, 'silent player is away');
  assert.equal(c.sitOut, 'away', 'and sits out');
  applyCmd(s, 'c', { t: 'beat', vis: true }, now, rng);
  assert(!c.away && !c.sitOut, 'back on return');
  applyCmd(s, 'b', { t: 'beat', vis: false }, now, rng);
  assert(s.players.find(p => p.id === 'b')!.away, 'screen off = away at once');
  now += IDLE_END_MS + 1000;
  applyCmd(s, 'zzz', { t: 'tick' }, now, rng);
  assert.equal(s.phase, 'over'); assert(s.endReason);
  console.log('OK: away, sitting out, back in, empty table closes');
}
void total;
