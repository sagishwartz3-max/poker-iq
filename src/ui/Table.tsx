import { motion } from 'framer-motion';
import { PRE_ORDER, type Scenario } from '../engine/scenarios';
import { Card } from './Card';

const CENTER = { x: 50, y: 47 };
function seatXY(rel: number) {
  const a = ((90 + 60 * rel) * Math.PI) / 180;
  return { x: 50 + 45 * Math.cos(a), y: 50 + 41 * Math.sin(a) };
}
const lerp = (a: { x: number; y: number }, b: { x: number; y: number }, t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

export function Table({ s, revealKey }: { s: Scenario; revealKey: string }) {
  const hi = PRE_ORDER.indexOf(s.heroPos);
  const btnRel = (PRE_ORDER.indexOf('BTN') - hi + 6) % 6;
  const dpos = lerp(seatXY(btnRel), CENTER, 0.3);
  return (
    <div className="stage">
      <div className="table">
        <div className="felt">
          <div className="felt-logo">POKER IQ</div>
          <div className="board">
            {[0, 1, 2, 3, 4].map(i => <Card key={revealKey + i} c={s.board[i]} delay={0.25 + i * 0.09} size={40} />)}
          </div>
          <motion.div className="pot" key={revealKey + 'pot'} style={{ x: '-50%', y: '-50%', rotateX: -30 }} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.5 }}>
            <span className="chipstack"><i style={{ top: 10 }} /><i style={{ top: 5 }} /><i style={{ top: 0 }} /></span>
            <span>קופה <b className="num">{s.pot}</b></span>
          </motion.div>
        </div>
      </div>
      {s.seats.map(seat => {
        const rel = (PRE_ORDER.indexOf(seat.pos) - hi + 6) % 6;
        const p = seatXY(rel);
        const isHero = seat.state === 'hero';
        const showBacks = seat.state === 'in';
        const chipAt = seat.chips ? lerp(p, CENTER, 0.42) : null;
        return (
          <div key={seat.pos}>
            <motion.div
              className={`seat ${seat.state === 'folded' ? 'folded' : ''} ${isHero ? 'hero' : ''} ${seat.aggressor ? 'aggr' : ''}`}
              style={{ left: `${p.x}%`, top: `${p.y}%`, x: '-50%', y: '-50%' }}
              initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.05 * rel, type: 'spring', stiffness: 260, damping: 20 }}
            >
              {showBacks && <div className="backs"><i /><i /></div>}
              <div className="seat-disc">{isHero ? 'אתה' : seat.pos}</div>
              {isHero ? <span className="seat-tag hot">{seat.pos}</span> : seat.tag ? <span className={`seat-tag ${seat.aggressor ? 'hot' : ''}`}>{seat.tag}</span> : null}
            </motion.div>
            {chipAt && !isHero && (
              <motion.div className="seat" style={{ left: `${chipAt.x}%`, top: `${chipAt.y}%`, zIndex: 2, x: '-50%', y: '-50%' }}
                initial={{ left: `${p.x}%`, top: `${p.y}%`, opacity: 0 }} animate={{ left: `${chipAt.x}%`, top: `${chipAt.y}%`, opacity: 1 }} transition={{ delay: 0.45, duration: 0.5 }}>
                <span className="chipstack"><i style={{ top: 5 }} /><i style={{ top: 0 }} /></span>
              </motion.div>
            )}
          </div>
        );
      })}
      <motion.div className="dealer" style={{ left: `${dpos.x + 7}%`, top: `${dpos.y}%`, x: '-50%', y: '-50%' }} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.3 }}>D</motion.div>
    </div>
  );
}
