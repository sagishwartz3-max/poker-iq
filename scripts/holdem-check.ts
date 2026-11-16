import assert from 'node:assert/strict';
import { mulberry32 } from '../src/engine/cards';
import { act, DEFAULT_CFG, endHand, gift, mayRaise, newTable, publicView, seat, startHand, timeoutAction } from '../src/engine/holdem';

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
