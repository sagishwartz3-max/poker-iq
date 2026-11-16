import { useEffect, useState } from 'react';
import { isRed, RN, SUITS } from '../engine/cards';
import { sfx } from '../game/sound';

/** Cards stay face down; holding lifts only their near corners. */
export function PeekCards({ cards, revealed: shownByTable, hand, tall, faceUp }: { cards: number[]; revealed: boolean; hand: string; tall?: boolean; faceUp?: boolean }) {
  const [held, setHeld] = useState(false);
  // faceUp: the player turned peeking off, so their cards simply lie face up
  const revealed = shownByTable || !!faceUp;
  const open = held || revealed;
  const release = () => setHeld(false);
  useEffect(() => {
    const hide = () => setHeld(false);
    window.addEventListener('blur', hide);
    document.addEventListener('visibilitychange', hide);
    return () => { window.removeEventListener('blur', hide); document.removeEventListener('visibilitychange', hide); };
  }, []);
  return <><button type="button" className={`peek-cards ${held && !revealed ? 'is-peeking' : ''} ${revealed ? 'is-revealed' : ''}`}
    aria-label={open ? `הקלפים שלך: ${cards.map(c => RN[c >> 2] + SUITS[c & 3]).join(', ')}` : 'החזק כדי להציץ בקלפים שלך'}
    aria-pressed={open} onPointerDown={e => { if (revealed) return; e.currentTarget.setPointerCapture(e.pointerId); setHeld(true); sfx.deal(0); }}
    onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release} onBlur={release}
    onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!e.repeat && !revealed) { setHeld(true); sfx.deal(0); } } }}
    onKeyUp={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); release(); } }}
    onContextMenu={e => e.preventDefault()}>
    <span className="peek-hint">{open ? hand : 'החזק להצצה'}</span>
    <span className="peek-pair" aria-hidden="true">{cards.map((c, i) => <span key={i} className={`peek-card ${isRed(c) ? 'red' : ''}`}>
      <span className="peek-back"><span>♠</span></span>
      <span className="peek-face"><b>{RN[c >> 2]}</b><i>{SUITS[c & 3]}</i><span>{SUITS[c & 3]}</span></span>
      <span className="peek-fold" />
    </span>)}</span>
  </button><img className={`peek-hand ${held && !revealed ? 'visible' : ''}`} src={tall ? "/table/peek-hand-crop.webp" : "/table/peek-hand.webp"} alt="" aria-hidden="true" /></>;
}
