import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { today } from '../game/progress';
import { sfx } from '../game/sound';
import { useApp } from './ctx';

/** Daily wheel: one free spin a day for game coins (never real money, coins cannot be bought or cashed out). */
const PRIZES = [50, 100, 150, 200, 300, 500, 750, 1000];
const WEIGHT = [20, 20, 18, 15, 12, 8, 4, 3];
const COLORS = ['#1f6f4a', '#c9a227', '#2b4f7a', '#8a3b3b', '#1f6f4a', '#c9a227', '#2b4f7a', '#8a3b3b'];
const SEG = 360 / PRIZES.length;

function draw() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296 * WEIGHT.reduce((a, b) => a + b, 0);
  let acc = 0;
  for (let i = 0; i < WEIGHT.length; i++) { acc += WEIGHT[i]; if (n < acc) return i; }
  return 0;
}

export function WheelCard() {
  const { P, update, sync } = useApp();
  const [open, setOpen] = useState(false);
  const [spin, setSpin] = useState<{ i: number; deg: number } | null>(null);
  const [done, setDone] = useState(false);
  const used = P.wheel === today();
  const go = () => {
    if (used || spin) return;
    const i = draw();
    // the pointer is at the top; land in the middle of segment i after five full turns
    setSpin({ i, deg: 360 * 5 + (360 - (i * SEG + SEG / 2)) });
    // credit right away so closing the app mid-spin keeps the prize
    update(p => { p.wheel = today(); p.coins = (p.coins ?? 0) + PRIZES[i]; }); sync();
    sfx.deal(0);
  };
  if (used && !open) return null;
  return <>
    <motion.button className="glass review-bar wheel-bar" onClick={() => setOpen(true)} whileTap={{ scale: 0.98 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <span style={{ fontSize: 26 }} aria-hidden="true">🎡</span>
      <div><b>הגלגל היומי</b><span>סיבוב אחד בחינם כל יום: עד 1,000 מטבעות לשולחנות עם דמי כניסה</span></div>
      <span className="n">סובב</span>
    </motion.button>
    <AnimatePresence>{open && <>
      <motion.div className="scrim" onClick={() => { if (!spin || done) setOpen(false); }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <motion.div className="glass modal" role="dialog" aria-modal="true" aria-label="הגלגל היומי" initial={{ opacity: 0, scale: .9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .9 }}>
        {(!spin || done) && <button className="icon-btn wheel-x" onClick={() => setOpen(false)} aria-label="סגור">✕</button>}
        <h2 className="h-lg">הגלגל היומי</h2>
        <div className="wheel-wrap">
          <div className="wheel-pin" aria-hidden="true" />
          <motion.svg viewBox="-100 -100 200 200" className="wheel" animate={{ rotate: spin?.deg ?? 0 }} transition={{ duration: 4, ease: [0.15, 0.85, 0.25, 1] }}
            onAnimationComplete={() => { if (spin && !done) { setDone(true); sfx.good(); } }} aria-hidden="true">
            {PRIZES.map((v, i) => {
              const a0 = (i * SEG - 90) * Math.PI / 180, a1 = ((i + 1) * SEG - 90) * Math.PI / 180, am = ((i + .5) * SEG - 90) * Math.PI / 180;
              return <g key={i}>
                <path d={`M0 0 L${96 * Math.cos(a0)} ${96 * Math.sin(a0)} A96 96 0 0 1 ${96 * Math.cos(a1)} ${96 * Math.sin(a1)} Z`} fill={COLORS[i]} stroke="#0b1410" strokeWidth="1.5" />
                <text x={64 * Math.cos(am)} y={64 * Math.sin(am)} transform={`rotate(${(i + .5) * SEG} ${64 * Math.cos(am)} ${64 * Math.sin(am)})`} textAnchor="middle" dominantBaseline="middle" fill="#fff8e1" fontSize="15" fontWeight="800">{v}</text>
              </g>;
            })}
            <circle r="14" fill="#0b1410" stroke="#c9a227" strokeWidth="3" />
          </motion.svg>
        </div>
        <p className="muted" style={{ minHeight: 22, margin: '10px 0 0' }} role="status">
          {done && spin ? <b className="gold-text">זכית ב-{PRIZES[spin.i].toLocaleString('he-IL')} מטבעות! 🪙</b> : spin ? 'מסתובב…' : 'מטבעות משחק בלבד. אי אפשר לקנות או לפדות אותם.'}
        </p>
        <div className="modal-actions">
          {!spin && !used ? <button className="btn gold wide" onClick={go}>סובב</button>
            : <button className="btn wide" disabled={!done} onClick={() => setOpen(false)}>{done ? 'מעולה' : '…'}</button>}
        </div>
      </motion.div>
    </>}</AnimatePresence>
  </>;
}
