import { motion } from 'framer-motion';
import { useState } from 'react';
import { currentLevel, iqScore, KLEVELS, knownFromDiag, nextSteps, POTENTIAL, skillAcc, TOP, wantsHelp, type Step } from '../game/path';
import { useApp } from '../ui/ctx';
import { I } from '../ui/Icons';
import { Rich } from '../ui/Rich';
import { TIPS } from '../game/tips';

/** The personal path: knowledge level, Poker IQ, today's steps and the ladder up to master. */
export function Path() {
  const { P, go } = useApp();
  const L = currentLevel(P);
  const iq = iqScore(P);
  const steps = nextSteps(P);
  const [open, setOpen] = useState<number | null>(L < TOP ? L : null);
  const run = (s: Step) => {
    if (s.kind === 'stage') go('play', { mode: 'stage', w: s.w, l: s.l, back: 'path' });
    else if (s.kind === 'drill') go('play', { mode: 'drill', drill: s.key, back: 'path' });
    else if (s.kind === 'check') go('play', { mode: 'drill', drill: KLEVELS[s.level].test, level: s.level, back: 'path' });
    else if (s.kind === 'lesson') go('lesson', { mode: 'free', level: s.level, back: 'path' });
    else go('play', { mode: 'review', back: 'path' });
  };
  const icon = (s: Step) => (s.kind === 'lesson' ? '💡' : s.kind === 'stage' ? '📘' : s.kind === 'drill' ? '🎯' : s.kind === 'check' ? '🏁' : '🔁');
  return (
    <div className="screen">
      <div className="play-top" style={{ marginBottom: 10 }}>
        <button className="icon-btn" onClick={() => go('home')} aria-label="חזרה">{I.back}</button>
        <div className="play-title"><b>המסלול שלי</b><span>{L >= TOP ? 'הגעת לרמה הכי גבוהה' : `רמת ידע ${L + 1} מתוך ${TOP}: ${KLEVELS[L].name}`}</span></div>
      </div>

      {!P.diag && <button className="glass review-bar" onClick={() => go('diagnose')}><span style={{ fontSize: 26 }}>🧠</span><div><b>אבחון אישי של 2 דקות</b><span>כדי שהמסלול יתאים בדיוק לך</span></div><span className="n">התחל</span></button>}

      <motion.div className="glass path-head" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div><div className="eyebrow">Poker IQ</div><b className="num path-iq">{iq}</b><small> / {POTENTIAL}</small></div>
        <div className="path-bar" aria-label={`${Math.min(L, TOP)} מתוך ${TOP} רמות`}>
          {KLEVELS.map((_, k) => <i key={k} className={P.passed?.[k] ? 'done' : k === L ? 'now' : ''} />)}
        </div>
        <span className="muted" style={{ fontSize: 13 }}>{L >= TOP ? 'מאסטר. עכשיו שומרים על החדות.' : `עוד ${TOP - L} רמות עד מאסטר`}</span>
      </motion.div>

      <div className="sec-title"><h2 className="h-md">{L >= TOP ? 'להמשיך להשתפר' : 'הצעדים הבאים שלך'}</h2></div>
      <div className="path-steps">
        {steps.map((s, k) => (
          <motion.button key={k} className={`glass path-step ${k === 0 ? 'first' : ''}`} onClick={() => run(s)} whileTap={{ scale: 0.98 }} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * k }}>
            <span className="ps-icon" aria-hidden="true">{icon(s)}</span>
            <div><b>{s.title}</b><span>{s.why}</span></div>
            <span className="ps-go">{k === 0 ? 'התחל' : I.back}</span>
          </motion.button>
        ))}
      </div>

      <div className="sec-title"><h2 className="h-md">רמות הידע</h2></div>
      <ol className="path-ladder">
        {KLEVELS.map((K, k) => {
          const done = !!P.passed?.[k], now = k === L, locked = k > L;
          const sk = skillAcc(P, k);
          return (
            <li key={k} className={`glass ${done ? 'done' : ''} ${now ? 'now' : ''} ${locked ? 'locked' : ''}`}>
              <button className="pl-head" onClick={() => setOpen(open === k ? null : k)} aria-expanded={open === k}>
                <span className="pl-num">{done ? '✓' : k + 1}</span>
                <div><b>{K.name}</b><span>{K.sub}</span></div>
                <span className="pl-tag">{done ? 'עברת' : now ? 'עכשיו' : knownFromDiag(P, k) ? 'כנראה כבר יודע' : wantsHelp(P, k) ? 'ביקשת לחזק' : ''}</span>
              </button>
              {open === k && (
                <motion.div className="pl-body" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                  <ul className="lesson-list">{K.lesson.map((t, j) => <li key={j}><Rich text={t} /></li>)}</ul>
                  <div className="pl-tips">
                    {TIPS[k].map(t => <span key={t.id} className={P.tips?.[t.id] ? 'done' : ''}>{P.tips?.[t.id] ? '✓' : '💡'} {t.title}</span>)}
                  </div>
                  <button className="btn wide" onClick={() => go('lesson', { mode: 'free', level: k, back: 'path' })}>שיעורי הרמה ({TIPS[k].filter(t => P.tips?.[t.id]).length}/{TIPS[k].length})</button>
                  {k < 8 && <div className="pl-skills">
                    {sk.map(x => <div key={x.key} className="pl-skill"><span>{x.name}</span>
                      <i><b style={{ width: `${x.acc == null ? 0 : Math.round(x.acc * 100)}%` }} /></i>
                      <em className="num">{x.n ? `${Math.round((x.acc ?? 0) * 100)}% · ${x.n}` : 'עוד לא'}</em></div>)}
                  </div>}
                  {!locked && !done && <button className="btn gold wide" onClick={() => go('play', { mode: 'drill', drill: K.test, level: k, back: 'path' })}>מבחן רמה: 10 ידיים, צריך 8</button>}
                  {done && <button className="btn wide" onClick={() => go('play', { mode: 'drill', drill: K.test, back: 'path' })}>לתרגל שוב</button>}
                </motion.div>
              )}
            </li>
          );
        })}
      </ol>
      {P.diag && <button className="btn wide ghost" style={{ margin: '14px 0 90px' }} onClick={() => go('diagnose')}>לעשות את האבחון מחדש</button>}
    </div>
  );
}
