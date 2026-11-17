import assert from 'node:assert/strict';
import { best5, mulberry32, RN, scoreName } from '../src/engine/cards';
import { act, DEFAULT_CFG, endHand, gift, mayRaise, newTable, publicView, seat, showTimes, startHand, timeoutAction } from '../src/engine/holdem';

const s = newTable('TEST', 'a', { ...DEFAULT_CFG, rebuys: 0 });
for (const id of ['a','b','c']) seat(s, id, id);
assert(startHand(s, mulberry32(7), 1000));
assert.equal(new Set(s.players.flatMap(p => p.cards!)).size, 6);
const v = publicView(s, 1000);
assert(!('deck' in v));
assert(v.players.every(p => !('cards' in p)));
const snapshot = JSON.stringify(s);
assert.equal(act(s, 'intruder', { type: 'fold' }, 1001), false);
assert.equal(act(s, s.turn!, { type: 'raise', to: Infinity }, 1001), false);
assert.equal(act(s, s.turn!, { type: 'raise', to: NaN }, 1001), false);
assert.equal(JSON.stringify(s), snapshot);
s.paused = true;
assert.equal(act(s, s.turn!, timeoutAction(s), 1002), false);
s.paused = false;

// A has called 100; B's remaining stack can raise only to 150.
// A must call/fold, but cannot reraise without a full 100-chip increase.
s.curBet = 150; s.minRaise = 100; s.turn = 'a'; s.pot = 400;
for (const p of s.players) {
  p.bet = p.id === 'a' ? 100 : 150; p.total = p.bet;
  p.acted = true; p.actedBet = p.id === 'a' ? 100 : 150;
  p.stack = p.id === 'b' ? 0 : 1000; p.allIn = p.id === 'b';
}
assert.equal(mayRaise(s, s.players[0]), false);
assert.equal(act(s, 'a', { type: 'raise', to: 250 }, 1003), false);
assert(act(s, 'a', { type: 'call' }, 1003));
assert.equal(s.street, 1);
assert.equal(s.board.length, 3);
assert.equal(mayRaise({ curBet: 200, minRaise: 100 }, { bet: 100, stack: 900, acted: true, actedBet: 100 }), true);

// Heads-up button posts small blind and acts first preflop.
const h = newTable('HU', 'a', DEFAULT_CFG);
seat(h, 'a', 'a'); seat(h, 'b', 'b');
startHand(h, mulberry32(2), 1000);
assert.equal(h.turn, h.players[h.btn].id);
assert.equal(h.players[h.btn].bet, h.sb);
assert(act(h, h.turn!, { type: 'call' }, 1100));
assert(act(h, h.turn!, { type: 'check' }, 1200));
assert.equal(h.street, 1);
assert.equal(h.turn, h.players[1 - h.btn].id);

// Gifts during a hand are pending; no extra chips can be wagered mid-hand.
const p = h.players[0], before = p.stack;
assert(gift(h, p.id, 300));
assert.equal(p.stack, before); assert.equal(p.pending, 300);
assert(!gift(h, p.id, Infinity));
while (h.phase === 'hand') assert(act(h, h.turn!, timeoutAction(h), 1300));
endHand(h);
assert(startHand(h, mulberry32(3), 1400));
assert.equal(p.pending, 0);
assert.equal(p.gifts, 300);
console.log('OK: privacy, invalid actions, pause, short all-in reopening, heads-up order, pending gifts');

// Showdown story: best five cards, readable names, and an all-in run-out that is dealt street by street.
{
  const c = (r: string, su: number) => RN.indexOf(r) * 4 + su; // su: 0♠ 1♥ 2♦ 3♣
  const b = best5([c('A', 1), c('K', 1), c('2', 1), c('7', 1), c('9', 0), c('Q', 1), c('3', 2)]);
  assert.equal(b.score >> 20, 5); assert.equal(scoreName(b.score), 'צבע, A גבוה');
  assert(b.cards.every(x => (x & 3) === 1) && b.cards.length === 5);
  assert.equal(scoreName(best5([c('8', 0), c('8', 1), c('K', 2), c('K', 3), c('8', 2), c('2', 0), c('4', 1)]).score), 'פול האוס: 8 על K');
  assert.equal(scoreName(best5([c('A', 0), c('2', 1), c('3', 2), c('4', 3), c('5', 2), c('9', 0), c('J', 1)]).score), 'רצף עד 5');
  const t = newTable('S', 'a', DEFAULT_CFG); seat(t, 'a', 'a'); seat(t, 'b', 'b');
  startHand(t, mulberry32(9), 1000);
  assert(act(t, t.turn!, { type: 'raise', to: 99999 }, 1100));
  assert(act(t, t.turn!, { type: 'call' }, 1200));
  assert.equal(t.phase, 'show'); assert.equal(t.runFrom, 0); assert.equal(t.board.length, 5);
  assert(t.hands!.a && t.hands!.b && t.potWon === 2 * DEFAULT_CFG.stack);
  const tm = showTimes(t.runFrom!, true);
  assert(tm.cardAt(0) > 0 && tm.cardAt(3) > tm.cardAt(2) && tm.cardAt(4) > tm.cardAt(3) && tm.resolveAt > tm.cardAt(4));
  assert.equal(t.nextAt, 1200 + tm.endAt * 1000);
  console.log('OK: showdown names, best five, staged run-out');
}
