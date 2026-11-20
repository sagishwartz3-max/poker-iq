import { isRed, RN, SUITS } from '../engine/cards';

/**
 * My two cards, face up and upright in front of my seat, slightly fanned like a hand held at the table.
 * The name of my hand is shown on my seat's plate. At the showdown the cards that make the winning hand light up and the others fade.
 */
export function PeekCards({ cards, hand, folded, hl }: { cards: number[]; hand: string; folded?: boolean; hl?: (c: number) => '' | 'hl' | 'lo' }) {
  return <div className={`peek-cards hero-cards ${folded ? 'is-folded' : ''}`} role="img"
    aria-label={`הקלפים שלך: ${cards.map(c => RN[c >> 2] + SUITS[c & 3]).join(', ')}. ${folded ? 'Fold · ' : ''}${hand}`}>
    {cards.map((c, i) => <span key={i} className={`card3d hero-card ${isRed(c) ? 'red' : ''} ${hl?.(c) ?? ''}`} aria-hidden="true">
      <span className="face"><span className="rk">{RN[c >> 2]}</span><span className="su">{SUITS[c & 3]}</span><span className="big">{SUITS[c & 3]}</span></span>
    </span>)}
  </div>;
}
