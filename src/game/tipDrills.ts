import type { GenCfg, Kind, Scenario } from '../engine/scenarios';

/**
 * Five hands that practise exactly one lesson tip. `keep` filters generated spots down to the idea the tip teaches
 * (position, weak kickers, top pair, draws, multiway…). Tips the hand engine cannot model (tournament stack sizes)
 * have no drill.
 */
export interface TipDrill { cfg: GenCfg; keep?: (s: Scenario) => boolean }
export const TIP_HANDS = 5;

const PRE: Kind[] = ['open', 'vsOpen', 'bbLimp', 'vs3bet'];
const POST: Kind[] = ['cbet', 'leadOOP', 'facingBet', 'checkRaised'];
const ALL: Kind[] = [...PRE, ...POST];
const ranks = (s: Scenario) => s.hero.map(c => c >> 2);
const raiserPos = (s: Scenario) => s.seats.find(x => x.aggressor)?.pos;

export const TIP_DRILLS: Record<string, TipDrill> = {
  // 1. basics
  'b-fewer': { cfg: { kinds: ['open'], cands: 3 }, keep: s => s.made.strength <= 2 },
  'b-pos': { cfg: { kinds: ['open'], cands: 3 } },
  'b-nolimp': { cfg: { kinds: ['open', 'bbLimp'], cands: 3 } },
  'b-size': { cfg: { kinds: ['open'], cands: 3 } },
  'b-steal': { cfg: { kinds: ['open'], cands: 3 }, keep: s => ['CO', 'BTN', 'SB'].includes(s.heroPos) },
  // 2. facing a raise
  'r-early': { cfg: { kinds: ['vsOpen'], opp: [1, 2], cands: 3 }, keep: s => ['UTG', 'HJ'].includes(raiserPos(s) ?? '') },
  'r-3bet': { cfg: { kinds: ['vsOpen'], opp: [1, 2], cands: 3 } },
  'r-dom': { cfg: { kinds: ['vsOpen'], opp: [1, 2], cands: 3 }, keep: s => ranks(s).includes(12) && Math.min(...ranks(s)) < 9 && ranks(s)[0] !== ranks(s)[1] },
  'r-bb': { cfg: { kinds: ['vsOpen', 'bbLimp'], opp: [1, 2], cands: 3 }, keep: s => s.heroPos === 'BB' },
  // 3. the flop
  'f-texture': { cfg: { kinds: ['cbet', 'facingBet'], streets: [3], opp: [1, 1], cands: 3 } },
  'f-cbet': { cfg: { kinds: ['cbet'], streets: [3], opp: [1, 1], cands: 3 } },
  'f-range': { cfg: { kinds: ['cbet', 'leadOOP'], streets: [3], opp: [1, 1], cands: 3 } },
  'f-toppair': { cfg: { kinds: ['facingBet', 'checkRaised', 'cbet'], streets: [3], opp: [1, 2], cands: 3 }, keep: s => s.made.term === 'toppair' },
  'f-check': { cfg: { kinds: ['cbet'], streets: [3], opp: [2, 3], cands: 3 }, keep: s => s.n >= 2 },
  // 4. odds and draws
  'o-potodds': { cfg: { kinds: ['facingBet'], streets: [3, 4, 5], opp: [1, 2], cands: 3 } },
  'o-outs': { cfg: { kinds: ['facingBet'], streets: [3, 4], opp: [1, 2], draw: true, cands: 3 }, keep: s => !!s.draw },
  'o-implied': { cfg: { kinds: ['vsOpen', 'bbLimp'], opp: [1, 3], cands: 3 }, keep: s => ranks(s)[0] === ranks(s)[1] && ranks(s)[0] < 8 },
  'o-reverse': { cfg: { kinds: ['facingBet'], streets: [3, 4], opp: [1, 2], draw: true, cands: 3 }, keep: s => !!s.draw },
  'o-semi': { cfg: { kinds: ['facingBet', 'cbet'], streets: [3], opp: [1, 1], draw: true, cands: 3 }, keep: s => !!s.draw },
  // 5. turn and river
  'tr-barrel': { cfg: { kinds: ['cbet'], streets: [4], opp: [1, 1], cands: 3 } },
  'tr-polar': { cfg: { kinds: ['cbet', 'leadOOP'], streets: [5], opp: [1, 1], cands: 3 } },
  'tr-thin': { cfg: { kinds: ['cbet', 'leadOOP'], streets: [5], opp: [1, 1], cands: 3 }, keep: s => s.made.strength >= 1 && s.made.strength <= 2 },
  'tr-passive': { cfg: { kinds: ['facingBet'], streets: [5], opp: [1, 1], cands: 3 } },
  'tr-block': { cfg: { kinds: ['facingBet', 'leadOOP'], streets: [5], opp: [1, 1], cands: 3 } },
  // 6. position
  'p-ip': { cfg: { kinds: POST, opp: [1, 1], cands: 3 }, keep: s => s.ip },
  'p-oop': { cfg: { kinds: POST, opp: [1, 1], cands: 3 }, keep: s => !s.ip },
  'p-spr': { cfg: { kinds: ['facingBet', 'checkRaised'], streets: [3], opp: [1, 1], cands: 3 } },
  'p-potcontrol': { cfg: { kinds: ['cbet', 'facingBet', 'leadOOP'], streets: [4, 5], opp: [1, 1], cands: 3 }, keep: s => s.made.strength >= 1 && s.made.strength <= 2 },
  // 7. multiway
  'm-lessbluff': { cfg: { kinds: ['cbet', 'leadOOP'], opp: [3, 4], cands: 3 }, keep: s => s.n >= 3 },
  'm-strong': { cfg: { kinds: ['facingBet'], opp: [3, 5], cands: 3 }, keep: s => s.n >= 3 },
  'm-station': { cfg: { kinds: ['cbet', 'leadOOP'], streets: [4, 5], opp: [1, 1], cands: 3 }, keep: s => s.made.strength >= 2 },
  'm-iso': { cfg: { kinds: ['bbLimp'], opp: [1, 3], cands: 3 } },
  // 8. aggressive tables
  'a-3bet': { cfg: { kinds: ['vsOpen'], opp: [1, 1], cands: 3 } },
  'a-vs3bet': { cfg: { kinds: ['vs3bet'], cands: 3 } },
  'a-cr': { cfg: { kinds: ['checkRaised'], cands: 3 } },
  'a-mdf': { cfg: { kinds: ['facingBet'], opp: [1, 1], cands: 3 } },
  // 9. master: mixed spots that test decisions, not results (tournament tips have no hand drill)
  'x-results': { cfg: { kinds: ALL, opp: [1, 3], cands: 3 } },
  'x-tilt': { cfg: { kinds: ALL, opp: [1, 3], cands: 3 } },
  'x-exploit': { cfg: { kinds: ALL, opp: [1, 3], cands: 3 } }
};
