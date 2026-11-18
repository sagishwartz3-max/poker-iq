import { AnimatePresence, animate, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { mulberry32 } from '../engine/cards';
import { explain, grade, makeScenario, type Action, type Scenario } from '../engine/scenarios';
import { DIAG_KEYS, estimate, HARD, iqScore, KLEVELS, POTENTIAL, TOP, type Diag } from '../game/path';
import { recordSkill, rememberMistake, today } from '../game/progress';
import { sfx } from '../game/sound';
import { drillCfg } from '../game/worlds';
import { track } from '../net/supabase';
import { useApp } from '../ui/ctx';
import { Feedback } from '../ui/Feedback';
import { I } from '../ui/Icons';
import { Rich } from '../ui/Rich';
import { Spot } from '../ui/Spot';

type Phase = 'intro' | 'q' | 'primer' | 'test' | 'calc' | 'result';
const fmt = (n: number) => n.toLocaleString('he-IL');

const QS: { key: 'exp' | 'freq' | 'hard' | 'goal' | 'mins'; title: (a: Partial<Diag>) => string; sub?: string; multi?: boolean; opts: [string | number, string][] }[] = [
  { key: 'exp', title: () => 'כמה ניסיון יש לך בפוקר?', opts: [[0, 'אף פעם לא שיחקתי'], [1, 'מכיר את החוקים'], [2, 'משחק עם חברים'], [3, 'משחק הרבה, גם אונליין']] },
  { key: 'freq', title: a => (a.exp === 0 ? 'כמה היית רוצה לשחק?' : 'כמה פעמים אתה משחק?'), opts: [[0, 'פעם בחודש או פחות'], [1, 'כמה פעמים בחודש'], [2, 'כל שבוע'], [3, 'כמעט כל יום']] },
  { key: 'hard', title: () => 'מה הכי קשה לך?', sub: 'אפשר לבחור כמה', multi: true, opts: HARD.map(([k, t]) => [k, t] as [string, string]) },
  { key: 'goal', title: () => 'מה המטרה שלך?', opts: [['friends', 'לנצח את החברים במשחק הבית'], ['understand', 'להבין באמת את המשחק'], ['top', 'להגיע לרמה הכי גבוהה'], ['fun', 'בשביל הכיף והאתגר']] },
  { key: 'mins', title: () => 'כמה זמן ביום בא לך להשקיע?', sub: 'אפשר לשנות אחר כך', opts: [[3, '3 דקות'], [5, '5 דקות'], [10, '10 דקות'], [15, '15 דקות']] }
];

/** Count up a number once it is on screen. */
function CountUp({ to, dur = 1.4 }: { to: number; dur?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const c = animate(0, to, { duration: dur, ease: 'easeOut', onUpdate: v => { if (ref.current) ref.current.textContent = fmt(Math.round(v)); } });
    return () => c.stop();
  }, [to, dur]);
  return <span ref={ref} className="num">0</span>;
}

/** Half-circle gauge: where you are now, and the top of the path. */
function Gauge({ now }: { now: number }) {
  const arc = (v: number) => { const a = Math.PI * (1 - v / 100); return `${100 + 80 * Math.cos(a)} ${100 - 80 * Math.sin(a)}`; };
  return <svg viewBox="0 0 200 116" className="iq-gauge" aria-hidden="true">
    <path d={`M20 100 A80 80 0 0 1 180 100`} className="g-track" />
    <path d={`M20 100 A80 80 0 0 1 ${arc(POTENTIAL)}`} className="g-pot" />
    <motion.path d={`M20 100 A80 80 0 0 1 ${arc(now)}`} className="g-now" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.4, ease: 'easeOut' }} />
  </svg>;
}

export function Diagnose() {
  const { P, update, go, sync } = useApp();
  const [phase, setPhase] = useState<Phase>('intro');
  const [qi, setQi] = useState(0);
  const [ans, setAns] = useState<Partial<Diag>>({ hard: [] });
  const [i, setI] = useState(0);
  const [items, setItems] = useState<('g' | 'c' | 'b')[]>([]);
  const [last, setLast] = useState<{ a: Action | 'timeout'; g: 'g' | 'c' | 'b' } | null>(null);
  // eight hands, one per knowledge level, generated once for this diagnostic
  const hands = useMemo(() => {
    const rng = mulberry32((Math.random() * 2 ** 32) >>> 0);
    return DIAG_KEYS.map(k => {
      const d = drillCfg(k);
      let s = makeScenario(d.cfg, rng);
      for (let t = 0; t < 30 && d.keep && !d.keep(s); t++) s = makeScenario(d.cfg, rng);
      return s;
    });
  }, []);
  useEffect(() => { track(P, 'diag_start', { again: !!P.diag }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const q = QS[qi];
  const pick = (v: string | number) => {
    if (q.multi) { setAns(a => { const h = a.hard || []; return { ...a, hard: h.includes(v as string) ? h.filter(x => x !== v) : [...h, v as string] }; }); return; }
    const next = { ...ans, [q.key]: v };
    setAns(next);
    setTimeout(() => advance(next), 180);
  };
  const advance = (a = ans) => {
    if (qi < QS.length - 1) { setQi(qi + 1); return; }
    setPhase(a.exp === 0 ? 'primer' : 'test');
  };

  const answer = (act: Action | 'timeout') => {
    const s = hands[i];
    if (last) return;
    const g = grade(s, act);
    setLast({ a: act, g });
    setItems(x => { const n = [...x]; n[i] = g; return n; });
    update(p => { p.hands++; if (g !== 'b') p.correct++; recordSkill(p, s, g === 'g' ? 100 : g === 'c' ? 70 : 0); if (g === 'b') rememberMistake(p, s); });
    if (g === 'g') sfx.good(); else if (g === 'c') sfx.close(); else sfx.bad();
  };
  const next = () => {
    if (i < hands.length - 1) { setI(i + 1); setLast(null); return; }
    const diag: Diag = { at: today(), exp: ans.exp ?? 1, freq: ans.freq ?? 1, hard: ans.hard ?? [], goal: (ans.goal as string) ?? 'understand', mins: ans.mins ?? 5, items: [...items] };
    update(p => { p.diag = diag; });
    sync();
    track(P, 'diag_done', { right: items.filter(x => x !== 'b').length, exp: diag.exp, freq: diag.freq, goal: diag.goal, mins: diag.mins, hard: diag.hard.join(',') });
    setPhase('calc'); setLast(null);
    setTimeout(() => { setPhase('result'); sfx.level(); }, 2300);
  };

  /* ---------- intro ---------- */
  if (phase === 'intro') return (
    <div className="screen diag">
      <div className="play-top">
        <button className="icon-btn" onClick={() => go('home')} aria-label="אחר כך">{I.x}</button>
        <div className="play-title"><b>האבחון שלך</b><span>2-3 דקות</span></div>
      </div>
      <motion.div className="diag-hero" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <div className="diag-emoji" aria-hidden="true">🧠</div>
        <h1 className="h-xl">בוא נבנה לך מסלול אישי</h1>
        <p className="muted">5 שאלות קצרות ו-8 ידיים. בסוף תראה איפה אתה עומד היום, כמה טעויות עולות לך, ולאן אפשר להגיע אם תלמד.</p>
        <ul className="diag-list">
          <li><b>1</b>שאלון קצר עליך</li>
          <li><b>2</b>8 ידיים, עם הסבר אחרי כל אחת</li>
          <li><b>3</b>ציון, פוטנציאל ומסלול שיעורים מותאם</li>
        </ul>
      </motion.div>
      <div className="modal-actions">
        <button className="btn gold wide" onClick={() => setPhase('q')}>יאללה, מתחילים</button>
        <button className="btn wide ghost" onClick={() => go('home')}>אחר כך</button>
      </div>
    </div>
  );

  /* ---------- questionnaire ---------- */
  if (phase === 'q') return (
    <div className="screen diag">
      <div className="play-top">
        <button className="icon-btn" onClick={() => (qi ? setQi(qi - 1) : setPhase('intro'))} aria-label="חזרה">{I.back}</button>
        <div className="play-title"><b>שאלה {qi + 1} מתוך {QS.length}</b><span>עליך</span></div>
      </div>
      <div className="segs">{QS.map((_, k) => <i key={k} className={k < qi ? 'g' : k === qi ? 'now' : ''} />)}</div>
      <AnimatePresence mode="wait">
        <motion.div key={qi} initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: 0.22 }}>
          <h2 className="h-lg diag-q">{q.title(ans)}</h2>
          {q.sub && <p className="muted" style={{ marginTop: -6 }}>{q.sub}</p>}
          <div className="diag-opts">
            {q.opts.map(([v, t]) => {
              const on = q.multi ? (ans.hard || []).includes(v as string) : ans[q.key] === v;
              return <motion.button key={String(v)} whileTap={{ scale: 0.97 }} className={`glass diag-opt ${on ? 'on' : ''}`} onClick={() => pick(v)} aria-pressed={on}>{t}</motion.button>;
            })}
          </div>
          {q.multi && <button className="btn gold wide" style={{ marginTop: 16 }} onClick={() => advance()}>{(ans.hard || []).length ? 'המשך' : 'לא יודע עדיין, המשך'}</button>}
        </motion.div>
      </AnimatePresence>
    </div>
  );

  /* ---------- a word before the first hand, for players who never played ---------- */
  if (phase === 'primer') return (
    <div className="screen diag">
      <div className="play-top"><div className="play-title"><b>לפני הידיים</b><span>חצי דקה</span></div></div>
      <motion.div className="glass" style={{ padding: 18, borderRadius: 22 }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <ul className="lesson-list">
          <li><Rich text="בכל יד יש לך 2 קלפים משלך, ועד 5 קלפים משותפים על השולחן. מנצח מי שמרכיב את היד הכי טובה." /></li>
          <li><Rich text="בכל תור יש כמה אפשרויות: לוותר ({{fold}}), להשוות ({{call}}), לא להוסיף כלום ({{check}}) או להעלות ({{raise}})." /></li>
          <li>אין לחץ ואין ציון רע. תבחר מה שנראה לך, ואחרי כל יד יש הסבר פשוט.</li>
        </ul>
      </motion.div>
      <div className="modal-actions"><button className="btn gold wide" onClick={() => setPhase('test')}>הבנתי, לידיים</button></div>
    </div>
  );

  /* ---------- the eight hands ---------- */
  if (phase === 'test') {
    const s: Scenario = hands[i];
    return (
      <div className="screen full">
        <div className="play-top">
          <button className="icon-btn" onClick={() => go('home')} aria-label="יציאה">{I.x}</button>
          <div className="play-title"><b>יד {i + 1} מתוך 8</b><span>בודק: {KLEVELS[i].name}</span></div>
        </div>
        <div className="segs">{hands.map((_, k) => <i key={k} className={items[k] || (k === i ? 'now' : '')} />)}</div>
        <Spot s={s} k={`diag-${i}`} onAct={answer} picked={last?.a} locked={!!last} />
        <AnimatePresence>
          {last && <Feedback key={'fb' + i} s={s} chosen={last.a} g={last.g} pts={last.g === 'g' ? 100 : last.g === 'c' ? 70 : 0} onNext={next}
            nextLabel={i < hands.length - 1 ? 'יד הבאה' : 'לתוצאות האבחון'}
            extra={<p className="muted" style={{ margin: '0 0 8px', fontSize: 13 }}>הדגמה מהאבחון: זה בדיוק מה שהמסלול שלך ילמד ברמת "{KLEVELS[i].name}".</p>} />}
        </AnimatePresence>
      </div>
    );
  }

  /* ---------- analysing ---------- */
  if (phase === 'calc') return (
    <div className="screen diag diag-calc">
      <motion.div className="diag-spinner" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.1, ease: 'linear' }} aria-hidden="true" />
      <h2 className="h-lg">מנתח את ההחלטות שלך…</h2>
      {['בודק את 8 הידיים', 'משווה לרמות הידע', 'בונה מסלול שיעורים'].map((t, k) => (
        <motion.p key={t} className="muted" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 + k * 0.55 }}>✓ {t}</motion.p>
      ))}
    </div>
  );

  /* ---------- the reveal ---------- */
  const d = P.diag!;
  const est = estimate(d);
  const iq = iqScore(P);
  const wrong = KLEVELS.slice(0, 8).map((L, k) => ({ L, k, g: d.items[k] })).filter(x => x.g === 'b');
  const right = KLEVELS.slice(0, 8).map((L, k) => ({ L, k, g: d.items[k] })).filter(x => x.g === 'g');
  const demo = wrong[0] ? { L: wrong[0].L, ex: explain(hands[wrong[0].k], 'fold') } : null;
  const start = KLEVELS.findIndex((_, k) => d.items[k] === 'b');
  const weeks = Math.max(1, Math.round(est.days / 7));
  return (
    <div className="screen diag">
      <div className="play-top"><div className="play-title"><b>האבחון שלך</b><span>{right.length + d.items.filter(x => x === 'c').length} מתוך 8 החלטות טובות</span></div></div>

      <motion.div className="glass diag-card iq-card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
        <div className="eyebrow">ציון Poker IQ</div>
        <div className="iq-wrap"><Gauge now={iq} /><div className="iq-num"><CountUp to={iq} /><small>מתוך 100</small></div></div>
        <p className="iq-line">היום אתה ב-<b className="num">{iq}</b>. בסוף המסלול: <b className="gold-text num">{POTENTIAL}</b>. יש לך <b className="gold-text">+{POTENTIAL - iq} נקודות</b> של פוטנציאל.</p>
      </motion.div>

      <motion.div className="glass diag-card loss-card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
        {est.perNight > 0 ? <>
          <div className="eyebrow">{est.hypothetical ? 'אם תשחק פעם בשבוע' : 'בקצב שבו אתה משחק'}</div>
          <div className="loss-big"><CountUp to={est.perYear} /><span>החלטות יקרות בשנה</span></div>
          <p>בערב משחק רגיל (כ-40 החלטות) אתה צפוי לטעות בערך <b className="num">{est.perNight}</b> פעמים. זה בערך <b className="num">{fmt(est.bbYear)}</b> בליינדים גדולים בשנה שנשארים אצל אחרים על השולחן.</p>
          <p className="loss-fix">המטרה של המסלול: לחתוך את זה בחצי ויותר.</p>
        </> : <>
          <div className="eyebrow">מרשים</div>
          <div className="loss-big"><span>8 מתוך 8 בלי טעויות יקרות</span></div>
          <p>המסלול שלך מתחיל ממבחני רמה מהירים, כדי שתגיע לרמות המתקדמות בלי לבזבז זמן.</p>
        </>}
        <p className="muted tiny">הערכה לפי התשובות שלך ו-8 ידיים. Poker IQ מלמד קבלת החלטות, וזה לא מבטיח רווח בכסף.</p>
      </motion.div>

      <motion.div className="glass diag-card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
        <h3 className="h-md">מה ראינו בידיים שלך</h3>
        <div className="diag-areas">
          {KLEVELS.slice(0, 8).map((L, k) => <div key={k} className={`diag-area ${d.items[k]}`}><span>{d.items[k] === 'g' ? '✓' : d.items[k] === 'c' ? '≈' : '✗'}</span>{L.name}</div>)}
        </div>
        {right.length > 0 && <p className="muted" style={{ fontSize: 14 }}>💪 חזק אצלך: {right.slice(0, 3).map(x => x.L.name).join(', ')}</p>}
        {demo && <div className="box rule" style={{ marginTop: 10 }}>
          <div className="box-t">הכי כדאי לשפר: {demo.L.name}</div>
          <Rich text={demo.ex.rule} />
        </div>}
      </motion.div>

      <motion.div className="glass diag-card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.65 }}>
        <h3 className="h-md">המסלול שלך: {TOP} רמות ידע</h3>
        <ol className="diag-path">
          {KLEVELS.map((L, k) => {
            const known = k < 8 && d.items[k] !== 'b';
            const focus = d.hard.some(h => HARD.find(x => x[0] === h)?.[2].includes(k));
            return <li key={k} className={`${known ? 'known' : ''} ${k === (start < 0 ? 8 : start) ? 'start' : ''}`}>
              <b>{k + 1}</b><span>{L.name}{focus ? ' · ביקשת לחזק' : ''}</span><em>{known ? 'מבחן מהיר' : 'שיעורים + תרגול'}</em>
            </li>;
          })}
        </ol>
        <p style={{ margin: '8px 0 0' }}>ב-<b>{d.mins} דקות</b> ביום: בערך <b className="gold-text">{weeks} שבועות</b> עד רמת מאסטר.</p>
      </motion.div>

      <div className="modal-actions" style={{ paddingBottom: 24 }}>
        <button className="btn gold wide" onClick={() => go('path')}>התחל את המסלול שלי</button>
      </div>
    </div>
  );
}
