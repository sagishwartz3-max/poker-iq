import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { ACT_NAME, explain, type Action, type Scenario } from '../engine/scenarios';
import { I } from './Icons';
import { Rich } from './Rich';

const TITLES = { g: 'נכון!', c: 'כמעט, גם זה סביר', b: 'לא הפעם' };

export function Feedback({ s, chosen, g, pts, onNext, nextLabel, extra, nextDisabled }: {
  s: Scenario; chosen: Action | 'timeout'; g: 'g' | 'c' | 'b'; pts: number; onNext: () => void; nextLabel: string; extra?: React.ReactNode; nextDisabled?: boolean;
}) {
  const ex = useMemo(() => explain(s, chosen), [s, chosen]);
  const [adv, setAdv] = useState(false);
  const cls = g === 'g' ? 'v-good' : g === 'c' ? 'v-close' : 'v-bad';
  return (
    <>
      <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <motion.div className="sheet" role="dialog" aria-label="הסבר" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 260, damping: 30 }}>
        <div className="grab" />
        <div className="verdict">
          <motion.div className={`v-icon ${cls}`} initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 14, delay: 0.1 }}>
            {g === 'b' ? <motion.svg viewBox="0 0 24 24" animate={{ x: [0, -5, 5, -3, 3, 0] }} transition={{ delay: 0.3 }}><path d="M7 7l10 10M17 7 7 17" /></motion.svg>
              : <svg viewBox="0 0 24 24"><motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.25, duration: 0.4 }} /></svg>}
          </motion.div>
          <h3 className={cls}>{chosen === 'timeout' ? 'נגמר הזמן' : TITLES[g]}</h3>
          <motion.span className={`pts num ${cls}`} initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.35 }}>+{pts}</motion.span>
        </div>
        <p className="best">
          {chosen !== 'timeout' && chosen !== s.correct && <>בחרת {ACT_NAME[chosen]}. </>}
          הכי טוב כאן: <b>{ACT_NAME[s.correct]}</b>
        </p>
        {extra}
        <div className="box"><div className="box-t">מה קרה ביד</div><Rich text={ex.summary} /></div>
        <div className="box">
          <div className="box-t">למה {ACT_NAME[s.correct]}?</div>
          <ul className="why">{ex.why.map((w, i) => <motion.li key={i} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + i * 0.07 }}><Rich text={w} /></motion.li>)}</ul>
        </div>
        {ex.mistake && <div className={`box ${g === 'b' ? 'warn' : ''}`}><div className="box-t">{g === 'b' ? 'איפה הטעות' : 'הערה'}</div><Rich text={ex.mistake} /></div>}
        <button className="adv-toggle" onClick={() => setAdv(a => !a)} aria-expanded={adv}>
          <span>למתקדמים: המספרים</span>
          <motion.span animate={{ rotate: adv ? 180 : 0 }} style={{ display: 'inline-flex', width: 18 }}>{I.chevron}</motion.span>
        </button>
        <AnimatePresence initial={false}>
          {adv && (
            <motion.div className="nums" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
              {ex.numbers.map(n => <div key={n.label}><span>{n.label}</span><b className="num">{n.value}</b></div>)}
            </motion.div>
          )}
        </AnimatePresence>
        <button className="btn gold wide" onClick={onNext} disabled={nextDisabled} autoFocus>{nextLabel}</button>
      </motion.div>
    </>
  );
}
