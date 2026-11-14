import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { ACT_NAME, explain, POS_NAME, type Action, type Scenario } from '../engine/scenarios';
import { sfx } from '../game/sound';
import { Card } from './Card';
import { useApp } from './ctx';
import { Rich } from './Rich';
import { Table } from './Table';

export function Spot({ s, k, onAct, picked, locked }: { s: Scenario; k: string; onAct: (a: Action) => void; picked?: Action | 'timeout' | null; locked?: boolean }) {
  const { term } = useApp();
  const summary = useMemo(() => explain(s, 'fold').summary, [s]);
  return (
    <div>
      <Table s={s} revealKey={k} />
      <div className="history">
        {s.history.map((h, i) => (
          <motion.div key={k + i} className={`step ${h.kind}`} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.08 * i }}>
            {h.pos !== 'you' && <b>{h.pos}</b>}<span>{h.pos === 'you' && h.kind !== 'street' ? `אתה: ${h.text}` : h.text}</span>
          </motion.div>
        ))}
      </div>
      <motion.div key={k + 'sum'} className="glass situation" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Rich text={summary} />
      </motion.div>
      <div className="hero-zone">
        <div className="hero-cards">
          <Card key={k + 'h0'} c={s.hero[0]} hero tilt delay={0.1} />
          <Card key={k + 'h1'} c={s.hero[1]} hero tilt delay={0.2} />
        </div>
        <div className="hero-meta">
          <span className="chip big gold">{s.made.term ? <Rich text={`{{${s.made.term}|${s.made.name}}}`} /> : s.made.name}</span>
          <button className="chip" onClick={() => term(s.heroPos)}>{POS_NAME[s.heroPos]} ({s.heroPos})</button>
          {s.street > 0 && <button className="chip" onClick={() => term('position')}>{s.ip ? 'עם מיקום ✓' : 'בלי מיקום'}</button>}
          {s.toCall > 0 && <span className="chip">לשלם: <b className="num">{s.toCall}</b></span>}
        </div>
      </div>
      <div className="actions">
        {s.buttons.map(b => (
          <motion.button key={k + b.action} className={`act ${b.action} ${picked === b.action ? 'picked' : ''}`} disabled={locked}
            whileTap={{ scale: 0.93 }} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 22, delay: 0.35 }}
            onClick={() => { sfx.tap(); onAct(b.action); }} aria-label={`${ACT_NAME[b.action]} ${b.sub}`}>
            {b.label}<small>{b.sub}</small>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
