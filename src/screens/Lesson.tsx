import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { KLEVELS } from '../game/path';
import { gain } from '../game/progress';
import { sfx } from '../game/sound';
import { TIPS } from '../game/tips';
import { track } from '../net/supabase';
import { useApp, type PlayArgs } from '../ui/ctx';
import { I } from '../ui/Icons';
import { Rich } from '../ui/Rich';

/** One knowledge level's lessons: tip by tip, each with an example, a rule of thumb and a check question. */
export function Lesson({ args }: { args: PlayArgs }) {
  const { P, update, go, sync, toast } = useApp();
  const L = Math.max(0, Math.min(KLEVELS.length - 1, args.level ?? 0));
  const tips = TIPS[L];
  const first = Math.max(0, tips.findIndex(t => !P.tips?.[t.id]));
  const [i, setI] = useState(first < 0 ? 0 : first);
  const [picked, setPicked] = useState<number | null>(null);
  const [right, setRight] = useState(0);
  const [answered, setAnswered] = useState(0);
  const t = tips[i];
  const back = args.back ?? 'path';

  const answer = (k: number) => {
    if (picked != null) return;
    setPicked(k); setAnswered(n => n + 1);
    const ok = k === t.q.a;
    if (ok) { sfx.good(); setRight(r => r + 1); } else sfx.bad();
    const fresh = !P.tips?.[t.id];
    update(p => { p.tips = { ...(p.tips || {}), [t.id]: 1 }; if (ok && fresh) gain(p, 10); });
    sync();
  };
  const next = () => {
    if (i < tips.length - 1) { setI(i + 1); setPicked(null); return; }
    track(P, 'lesson_done', { level: L, right, of: answered });
    toast(`סיימת את שיעורי "${KLEVELS[L].name}"${right ? ` · ${right} תשובות נכונות` : ''}`);
    go(back);
  };

  return (
    <div className="screen lesson">
      <div className="play-top">
        <button className="icon-btn" onClick={() => go(back)} aria-label="יציאה">{I.x}</button>
        <div className="play-title"><b>שיעורים: {KLEVELS[L].name}</b><span>טיפ {i + 1} מתוך {tips.length}</span></div>
      </div>
      <div className="segs">{tips.map((x, k) => <i key={x.id} className={k < i || (k === i && picked != null) ? 'g' : k === i ? 'now' : ''} />)}</div>
      <AnimatePresence mode="wait">
        <motion.div key={t.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.22 }}>
          <h2 className="h-lg lesson-title">{t.title}</h2>
          <div className="glass lesson-card"><Rich text={t.body} /></div>
          <div className="box lesson-ex"><div className="box-t">דוגמה מהשולחן</div><Rich text={t.ex} /></div>
          <div className="box rule"><div className="box-t">💡 כלל אצבע</div><Rich text={t.rule} /></div>
          <div className="glass lesson-q">
            <b>בדוק את עצמך: <Rich text={t.q.q} /></b>
            <div className="lesson-opts">
              {t.q.opts.map((o, k) => {
                const cls = picked == null ? '' : k === t.q.a ? 'ok' : k === picked ? 'no' : 'off';
                return <button key={k} className={`lesson-opt ${cls}`} onClick={() => answer(k)} disabled={picked != null}><Rich text={o} /></button>;
              })}
            </div>
            {picked != null && <motion.p className={`lesson-why ${picked === t.q.a ? 'ok' : 'no'}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
              {picked === t.q.a ? '✓ נכון. ' : '✗ לא בדיוק. '}<Rich text={t.q.why} />
            </motion.p>}
          </div>
        </motion.div>
      </AnimatePresence>
      <div className="modal-actions" style={{ paddingBottom: 28 }}>
        <button className="btn gold wide" disabled={picked == null} onClick={next}>{picked == null ? 'ענה כדי להמשיך' : i < tips.length - 1 ? 'לטיפ הבא' : 'סיום השיעור'}</button>
      </div>
    </div>
  );
}
