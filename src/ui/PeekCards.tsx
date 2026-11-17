import { isRed, RN, SUITS } from '../engine/cards';

/**
 * My two cards, always face up in front of me (the hold-to-peek gesture was removed: on phones the hand covered the cards).
 * At the showdown the cards that make the winning hand light up and the others fade.
 */
export function PeekCards({ cards, hand, folded, hl }: { cards: number[]; hand: string; folded?: boolean; hl?: (c: number) => '' | 'hl' | 'lo' }) {
  return <div className={`peek-cards is-revealed ${folded ? 'is-folded' : ''}`} role="img"
    aria-label={`הקלפים שלך: ${cards.map(c => RN[c >> 2] + SUITS[c & 3]).join(', ')}. ${hand}`}>
    <span className="peek-hint">{folded ? `Fold · ${hand}` : hand}</span>
    <span className="peek-pair" aria-hidden="true">{cards.map((c, i) => <span key={i} className={`peek-card ${isRed(c) ? 'red' : ''} ${hl?.(c) ?? ''}`}>
      <span className="peek-back"><span>♠</span></span>
      <span className="peek-face"><b>{RN[c >> 2]}</b><i>{SUITS[c & 3]}</i><span>{SUITS[c & 3]}</span></span>
    </span>)}</span>
  </div>;
}
