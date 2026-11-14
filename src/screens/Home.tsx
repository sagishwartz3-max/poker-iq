import { motion } from 'framer-motion';
import { dueMistakes, nodeId, today, unlocked } from '../game/progress';
import { LEVELS, LEVEL_NAMES, levelOf, WORLDS } from '../game/worlds';
import { useApp } from '../ui/ctx';
import { I } from '../ui/Icons';

export function Header() {
  const { P, go } = useApp();
  const lv = levelOf(P.xp), lo = LEVELS[lv], hi = LEVELS[lv + 1];
  const pctv = hi ? ((P.xp - lo) / (hi - lo)) * 100 : 100;
  return (
    <div className="top">
      <button className="avatar" onClick={() => go('profile')} aria-label="פרופיל">{(P.nick || '?').slice(0, 1)}</button>
      <div className="top-info">
        <div className="top-name">{P.nick}</div>
        <div className="top-lv">רמה {lv + 1} · {LEVEL_NAMES[lv]} · <span className="num">{P.xp.toLocaleString('he-IL')} XP</span></div>
        <div className="xpbar"><motion.i initial={{ width: 0 }} animate={{ width: `${pctv}%` }} transition={{ duration: 1, ease: 'easeOut' }} /></div>
      </div>
      {P.dailyStreak > 0 && <div className="glass streak" title="ימים ברצף באתגר היומי"><span className="fire">🔥</span><span className="num">{P.dailyStreak}</span></div>}
    </div>
  );
}

export function Home() {
  const { P, go } = useApp();
  const dailyDone = P.daily?.date === today();
  let nextFound = false;
  const total = Object.values(P.stars).reduce((a, b) => a + b, 0);
  const due = dueMistakes(P).length;
  return (
    <div className="screen">
      <Header />
      <div className="hero-cta">
        <motion.button className="glass cta daily" onClick={() => go('daily')} whileTap={{ scale: 0.97 }} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="mini-cards" aria-hidden>
            {[['A', '♠', 0], ['K', '♥', 1], ['Q', '♦', 1]].map(([r, su, red], k) => (
              <motion.div key={k} className={`mc ${red ? 'r' : ''}`} initial={{ rotate: 0, y: 30, opacity: 0 }} animate={{ rotate: (k - 1) * 16, y: 0, opacity: 1 }} transition={{ delay: 0.2 + k * 0.1, type: 'spring', stiffness: 140 }}>
                {r}<br />{su}
              </motion.div>
            ))}
          </div>
          <span className={`badge ${dailyDone ? '' : 'live'}`}>{dailyDone ? `${P.daily!.score} נק׳ היום` : 'חדש היום'}</span>
          <span className="cta-t">אתגר יומי</span>
          <span className="cta-s">10 ידיים, אותן ידיים לכל העולם. מי הכי חד?</span>
        </motion.button>
        <motion.button className="glass cta duel" onClick={() => go('duel')} whileTap={{ scale: 0.97 }} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}>
          <span className="cta-art">⚔️</span>
          <span className="cta-t">ראש בראש</span>
          <span className="cta-s">קרב חי מול חבר</span>
        </motion.button>
        <motion.button className="glass cta free" onClick={() => go('play', { mode: 'free' })} whileTap={{ scale: 0.97 }} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
          <span className="cta-art">♾️</span>
          <span className="cta-t">אימון חופשי</span>
          <span className="cta-s">ידיים בלי סוף</span>
        </motion.button>
      </div>
      {due > 0 && (
        <motion.button className="glass review-bar" onClick={() => go('play', { mode: 'review' })} whileTap={{ scale: 0.98 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <span style={{ fontSize: 26 }}>🎯</span>
          <div><b>חזרה על טעויות</b><span>ידיים שטעית בהן חוזרות אחרי יום, 3 ימים ושבוע, עד שהן נכנסות לראש</span></div>
          <span className="n num">{due}</span>
        </motion.button>
      )}
      <div className="sec-title"><h2 className="h-md">המסע</h2><span className="muted num">{total} / {WORLDS.length * 9} ★</span></div>
      <div className="worlds">
        {WORLDS.map((W, w) => {
          const open = unlocked(P, w, 0);
          const ws = [0, 1, 2].reduce((a, l) => a + (P.stars[nodeId(w, l)] || 0), 0);
          return (
            <motion.div key={w} className={`glass world ${open ? '' : 'locked'}`} initial={{ opacity: 0, y: 30, rotateX: -12 }} whileInView={{ opacity: 1, y: 0, rotateX: 0 }} viewport={{ once: true, margin: '-30px' }} transition={{ type: 'spring', stiffness: 120, damping: 18 }}>
              <div className="world-glow" style={{ background: `hsl(${W.hue} 80% 55%)` }} />
              <div className="world-head">
                <div className="world-num" style={{ color: `hsl(${W.hue} 90% 80%)` }}>{w + 1}</div>
                <div><h3>{W.name}</h3><p>{W.sub}</p></div>
                <div className="world-stars num">{ws}/9 ★</div>
              </div>
              <div className="nodes">
                {[0, 1, 2].map(l => {
                  const st = P.stars[nodeId(w, l)] || 0, u = unlocked(P, w, l);
                  const isNext = u && !st && !nextFound; if (isNext) nextFound = true;
                  return (
                    <motion.button key={l} className="node" disabled={!u} whileTap={u ? { scale: 0.9 } : undefined} onClick={() => go('play', { mode: 'stage', w, l })} aria-label={`עולם ${w + 1} שלב ${l + 1}`}>
                      <div className={`orb ${st ? 'done' : isNext ? 'next' : ''}`}>{u ? l + 1 : I.lock}</div>
                      <div className="node-stars">{[0, 1, 2].map(k => <span key={k} className={k < st ? '' : 'off'}>★</span>)}</div>
                      <div className="node-l">{W.timer ? `${W.timer[l]} שניות` : `שלב ${l + 1}`}</div>
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
