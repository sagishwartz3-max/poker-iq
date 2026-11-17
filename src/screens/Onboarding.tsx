import { motion } from 'framer-motion';
import { useState } from 'react';
import { Card } from '../ui/Card';
import { useApp } from '../ui/ctx';
import { track } from '../net/supabase';

export function Onboarding() {
  const { P, update, sync, go } = useApp();
  const [nick, setNick] = useState('');
  const cards = [8 * 4, 9 * 4 + 1, 10 * 4 + 2, 11 * 4 + 3, 12 * 4];
  return (
    <div className="screen full">
      <div className="onb">
        <div className="fan" aria-hidden>
          {cards.map((c, k) => (
            <motion.div key={c} style={{ position: 'absolute', left: '50%', top: 30, marginLeft: -46, transformOrigin: '50% 150%' }}
              initial={{ rotate: 0, y: 80, opacity: 0 }} animate={{ rotate: (k - 2) * 13, y: Math.abs(k - 2) * 6, opacity: 1 }} transition={{ delay: 0.15 * k, type: 'spring', stiffness: 120, damping: 14 }}>
              <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 3, repeat: Infinity, delay: k * 0.2 }}>
                <Card c={c} size={92} flat />
              </motion.div>
            </motion.div>
          ))}
        </div>
        <motion.div className="logo shine" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}>POKER IQ</motion.div>
        <motion.p className="muted" style={{ fontSize: 16, margin: '6px 0 22px' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}>
          למד לקבל את ההחלטה הנכונה בכל יד.<br />שלבים, אתגר יומי וקרבות חיים מול חברים.
        </motion.p>
        <motion.div className="glass" style={{ padding: 18, borderRadius: 26 }} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.15 }}>
          <div className="field">
            <label htmlFor="onbNick">איך יקראו לך בשולחן?</label>
            <input id="onbNick" className="input" maxLength={18} value={nick} onChange={e => setNick(e.target.value)} placeholder="הכינוי שלך" autoComplete="nickname" />
          </div>
          <button className="btn gold wide" disabled={!nick.trim()} onClick={() => { update(p => { p.nick = nick.trim().slice(0, 18); p.onboarded = true; }); setTimeout(sync, 50); let ref = ''; try { ref = document.referrer ? new URL(document.referrer).hostname : ''; } catch { /* odd referrer */ } track(P, 'onboard', { ref }); go('play', { mode: 'stage', w: 0, l: 0 }); }}>בוא נתחיל</button>
          <p className="muted" style={{ fontSize: 12, margin: '10px 0 0' }}>לגילאי 18+. משחק אימון בלי כסף אמיתי. <a href="./privacy.html" target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>פרטיות ותנאים</a></p>
        </motion.div>
      </div>
    </div>
  );
}
