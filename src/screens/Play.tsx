import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { hashStr, mulberry32 } from '../engine/cards';
import { grade, makeScenario, type Action, type GenCfg, type Scenario } from '../engine/scenarios';
import { dueMistakes, gain, nodeId, promoteMistake, recordSkill, rememberMistake, SKILLS, today, unlocked, yesterday } from '../game/progress';
import { sfx } from '../game/sound';
import { track } from '../net/supabase';
import { maybeAskReview } from '../native';
import { checkpointHands, KLEVELS, TOP } from '../game/path';
import { TIP_DRILLS, TIP_HANDS } from '../game/tipDrills';
import { ALL_TIPS } from '../game/tips';
import { DAILY_CFG, drillCfg, HANDS_PER_ROUND, LEVEL_NAMES, levelOf, stageCfg, WORLDS } from '../game/worlds';
import { Burst } from '../ui/Burst';
import { useApp, type PlayArgs } from '../ui/ctx';
import { Feedback } from '../ui/Feedback';
import { I } from '../ui/Icons';
import { Rich } from '../ui/Rich';
import { Spot } from '../ui/Spot';

type Phase = 'lesson' | 'decide' | 'feedback' | 'done';

export function Play({ args }: { args: PlayArgs }) {
  const { P, update, go, toast, sync } = useApp();
  const { cfg, title, sub, timer, seed, keep } = useMemo((): { cfg: GenCfg; title: string; sub: string; timer: number; seed: number; keep?: (s: Scenario) => boolean } => {
    if (args.mode === 'drill' && args.tip && TIP_DRILLS[args.tip]) {
      const d = TIP_DRILLS[args.tip], t = ALL_TIPS.find(x => x.id === args.tip)!;
      return { cfg: d.cfg, keep: d.keep, title: `תרגול: ${t.title}`, sub: `${TIP_HANDS} ידיים על הרעיון הזה`, timer: 0, seed: (Math.random() * 2 ** 32) >>> 0 };
    }
    if (args.mode === 'drill') {
      const d = drillCfg(args.drill!);
      return { cfg: d.cfg, keep: d.keep, title: args.level != null ? `מבחן רמה: ${KLEVELS[args.level].name}` : 'אימון ממוקד', sub: args.level != null ? 'צריך 8 החלטות טובות מתוך 10' : SKILLS[args.drill!] || '', timer: 0, seed: (Math.random() * 2 ** 32) >>> 0 };
    }
    if (args.mode === 'stage') {
      const W = WORLDS[args.w!];
      return { cfg: stageCfg(args.w!, args.l!), title: W.name, sub: `שלב ${args.l! + 1} מתוך 3`, timer: W.timer ? W.timer[args.l!] : 0, seed: (Math.random() * 2 ** 32) >>> 0 };
    }
    if (args.mode === 'review') return { cfg: DAILY_CFG, title: 'תיקון טעויות', sub: 'הידיים שטעית בהן', timer: 0, seed: 1 };
    if (args.mode === 'daily') return { cfg: DAILY_CFG, title: 'אתגר יומי', sub: 'אותן ידיים לכולם', timer: 0, seed: hashStr('pokeriq-daily-' + today()) };
    const open = WORLDS.filter((_, w) => unlocked(P, w, 0));
    const c: GenCfg = { kinds: [...new Set(open.flatMap(W => W.kinds))], opp: [1, Math.max(...open.map(W => W.opp?.[1] ?? 1))], cands: 3 };
    return { cfg: c, title: 'אימון חופשי', sub: 'ידיים בלי סוף', timer: 0, seed: (Math.random() * 2 ** 32) >>> 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const rng = useRef(mulberry32(seed));
  const [phase, setPhase] = useState<Phase>(args.mode === 'stage' && !P.lessons[args.w!] ? 'lesson' : 'decide');
  const [i, setI] = useState(0);
  const [s, setS] = useState<Scenario | null>(null);
  const [res, setRes] = useState<('g' | 'c' | 'b')[]>([]);
  const [points, setPoints] = useState(0);
  const [last, setLast] = useState<{ a: Action | 'timeout'; g: 'g' | 'c' | 'b'; pts: number } | null>(null);
  const [burst, setBurst] = useState(0);
  const [result, setResult] = useState<{ stars: number; xp: number; lvUp: number | null } | null>(null);
  const t0 = useRef(0);
  const endless = args.mode === 'free';
  const short = args.mode === 'review' || args.mode === 'drill';
  const checkpoint = args.mode === 'drill' && args.level != null;
  const queue = useRef<Scenario[]>(args.mode === 'review' ? dueMistakes(P).map(m => m.s).sort(() => Math.random() - 0.5).slice(0, HANDS_PER_ROUND)
    : checkpoint ? checkpointHands(args.drill!, mulberry32(seed)) : []);
  const tipT = args.tip ? ALL_TIPS.find(x => x.id === args.tip) : undefined;
  const total = args.mode === 'review' ? queue.current.length : tipT ? TIP_HANDS : HANDS_PER_ROUND;
  const [streak, setStreak] = useState(0);

  const deal = useCallback(() => {
    let sc = args.mode === 'review' || checkpoint ? queue.current[i] : makeScenario(cfg, rng.current);
    if (keep && !checkpoint) for (let t = 0; t < (tipT ? 200 : 30) && sc && !keep(sc); t++) sc = makeScenario(cfg, rng.current);
    if (!sc) return;
    setS(sc); setLast(null); t0.current = performance.now();
    sc.board.forEach((_, k) => sfx.deal(k));
  }, [cfg, i, args.mode, keep, checkpoint]);

  const dailyUsed = useRef(args.mode === 'daily' && P.daily?.date === today());
  useEffect(() => { if (dailyUsed.current) go('daily'); }, [go]);
  useEffect(() => { if (phase === 'decide' && !s && !dailyUsed.current) deal(); }, [phase, s, deal]);

  const answer = useCallback((a: Action | 'timeout') => {
    if (!s || last) return;
    const g = grade(s, a);
    const sec = (performance.now() - t0.current) / 1000;
    let pts = g === 'g' ? 100 : g === 'c' ? 70 : 0;
    if (args.mode === 'daily' && pts) pts += Math.max(0, Math.round(50 - 4 * sec));
    // the aha moment: a new player's first decision and its explanation (funnel step in PostHog)
    if (P.hands === 0) track(P, 'first_decision', { grade: g, mode: args.mode, sec: Math.round(sec) });
    setLast({ a, g, pts });
    setRes(r => { const n = [...r]; n[i] = g; return n; });
    setPoints(p => p + pts);
    update(p => {
      p.hands++; if (g !== 'b') p.correct++;
      // free practice pays as you go, so closing the app never loses what was earned
      if (endless) gain(p, pts * 0.3);
      recordSkill(p, s, g === 'g' ? 100 : g === 'c' ? 70 : 0);
      if (g === 'b') rememberMistake(p, s);
      else if (args.mode === 'review') promoteMistake(p, s);
      if (args.mode === 'daily') {
        if (p.lastDaily !== today()) { p.dailyStreak = p.lastDaily === yesterday() ? p.dailyStreak + 1 : 1; p.lastDaily = today(); }
        const marks = [...res]; marks[i] = g;
        p.daily = { date: today(), score: points + pts, squares: marks.map(x => (x === 'g' ? '🟩' : x === 'c' ? '🟨' : '🟥')).join('') };
      }
    });
    if (args.mode === 'daily' || endless) sync();
    setStreak(x => (g === 'g' ? x + 1 : 0));
    if (g === 'g') { sfx.good(); setBurst(b => b + 1); } else if (g === 'c') sfx.close(); else sfx.bad();
    setPhase('feedback');
  }, [s, last, i, args.mode, update, res, points, sync, endless, P]);

  // per-hand clock for timed stages
  useEffect(() => {
    if (phase !== 'decide' || !timer || !s) return;
    const id = setTimeout(() => answer('timeout'), timer * 1000);
    return () => clearTimeout(id);
  }, [phase, timer, s, answer]);

  const finish = () => {
    const sum = points;
    track(P, `${args.mode}_done`, { w: args.w, l: args.l, drill: args.drill, points: sum, good: res.filter(x => x === 'g').length, of: total });
    if (args.mode === 'daily') {
      const squares = res.map(x => (x === 'g' ? '🟩' : x === 'c' ? '🟨' : '🟥')).join('');
      update(p => {
        p.daily = { date: today(), score: sum, squares };
        gain(p, sum * 0.5);
      });
      sync(); toast(`+${Math.round(sum * 0.5)} XP`);
      if (res.filter(x => x === 'g').length >= 8) maybeAskReview(P.hands);
      go('daily'); return;
    }
    if (args.mode === 'review' || args.mode === 'drill') {
      const good = res.filter(x => x !== 'b').length;
      const xp = good * (args.mode === 'review' ? 20 : 15);
      // a knowledge-level checkpoint: 8 good decisions of 10 opens the next level
      if (args.level != null) {
        const L = args.level, ok = good >= 8;
        update(p => { gain(p, xp + (ok ? 100 : 0)); if (ok) { p.passed = { ...(p.passed || {}), [L]: 1 }; } }); sync();
        track(P, 'level_check', { level: L, good, passed: ok });
        if (ok) { sfx.level(); toast(L + 1 >= TOP ? `🏆 עברת את רמת המאסטר! +${xp + 100} XP` : `🎉 עלית לרמת ידע ${L + 2}: ${KLEVELS[L + 1].name} · +${xp + 100} XP`); maybeAskReview(P.hands); }
        else toast(`${good} מתוך 10. צריך 8 כדי לעבור: עוד תרגול ממוקד ונסה שוב`);
        go('path'); return;
      }
      if (tipT) {
        update(p => { gain(p, xp); p.tipBest = { ...(p.tipBest || {}), [tipT.id]: Math.max(p.tipBest?.[tipT.id] ?? 0, good) }; }); sync();
        track(P, 'tip_drill', { tip: tipT.id, good });
        toast(`${good}/${total} נכונות · +${xp} XP${good >= 4 ? ' · הרעיון נכנס 💡' : ' · שווה לקרוא שוב את הטיפ'}`);
        leaveTo(); return;
      }
      update(p => { gain(p, xp); }); sync();
      toast(args.mode === 'review' ? (good ? `תיקנת ${good} טעויות · +${xp} XP. הן יחזרו בעוד כמה ימים לבדיקה` : 'נסה שוב, ההסבר יעזור')
        : `${good}/${total} נכונות · +${xp} XP`);
      go(args.back ?? (args.mode === 'drill' ? 'profile' : 'home')); return;
    }
    const frac = sum / (HANDS_PER_ROUND * 100);
    const stars = frac >= 0.9 ? 3 : frac >= 0.75 ? 2 : frac >= 0.6 ? 1 : 0;
    const xp = Math.round(sum * (1 + 0.25 * args.w!) * 0.6);
    const before = levelOf(P.xp), after = levelOf(P.xp + xp);
    update(p => { gain(p, xp); const id = nodeId(args.w!, args.l!); if (stars > (p.stars[id] || 0)) p.stars[id] = stars; });
    sync();
    setResult({ stars, xp, lvUp: after > before ? after : null });
    setPhase('done');
    setTimeout(() => (after > before ? sfx.level() : stars ? sfx.good() : sfx.bad()), 300);
    if (stars) setTimeout(() => setBurst(b => b + 1), 500);
    if (stars === 3) maybeAskReview(P.hands);
  };

  const next = () => {
    if (!endless && i >= total - 1) { finish(); return; }
    setI(x => x + 1); setS(null); setPhase('decide');
  };

  // back to where the round came from; a tip practice returns to its lesson
  const leaveTo = () => (args.back === 'lesson' ? go('lesson', { mode: 'free', level: args.tipLevel ?? 0, back: 'path' }) : go(args.back ?? 'home'));
  const quit = () => {
    if (args.mode === 'daily' && res.length) { finish(); return; } // the attempt is used: bank what was played
    if (endless && points) toast(`+${res.reduce((t, g) => t + Math.round((g === 'g' ? 100 : g === 'c' ? 70 : 0) * 0.3), 0)} XP מאימון חופשי`);
    if (args.mode === 'daily') go('daily'); else leaveTo();
  };

  const W = args.mode === 'stage' ? WORLDS[args.w!] : null;
  const nextStage = args.mode === 'stage' ? (args.l! < 2 ? { w: args.w!, l: args.l! + 1 } : args.w! + 1 < WORLDS.length ? { w: args.w! + 1, l: 0 } : null) : null;

  return (
    <div className="screen full">
      <div className="play-top">
        <button className="icon-btn" onClick={quit} aria-label="יציאה">{I.x}</button>
        <div className="play-title"><b>{title}</b><span>{endless ? `יד ${i + 1} · ${res.filter(x => x !== 'b').length} נכונות` : sub}</span></div>
        <motion.div key={points} className="glass score-pill num gold-text" initial={{ scale: 1.3 }} animate={{ scale: 1 }}>{points}</motion.div>
      </div>
      {!endless && <div className="segs">{Array.from({ length: total }, (_, k) => <i key={k} className={res[k] || (k === i ? 'now' : '')} />)}</div>}
      {timer > 0 && phase === 'decide' && s && (
        <div className="timer"><motion.i key={i} initial={{ scaleX: 1 }} animate={{ scaleX: 0 }} transition={{ duration: timer, ease: 'linear' }} /></div>
      )}
      {args.mode === 'daily' && phase === 'decide' && s && (
        <div className="timer"><motion.i key={i} initial={{ scaleX: 1 }} animate={{ scaleX: 0 }} transition={{ duration: 12.5, ease: 'linear' }} style={{ background: 'var(--gold)' }} /></div>
      )}
      {s ? <Spot s={s} k={`${seed}-${i}`} onAct={answer} picked={last?.a} locked={!!last} /> : phase !== 'lesson' && <div className="dealing">מחלק קלפים…</div>}

      <AnimatePresence>
        {phase === 'feedback' && s && last && (
          <Feedback key={'fb' + i} s={s} chosen={last.a} g={last.g} pts={last.pts} onNext={next}
            nextLabel={!endless && i >= total - 1 ? (short ? 'סיום' : 'לתוצאות') : 'יד הבאה'}
            extra={tipT ? <div className="box rule" style={{ marginBottom: 10 }}><div className="box-t">💡 מהשיעור: {tipT.title}</div><Rich text={tipT.rule} /></div> : undefined} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {phase === 'lesson' && W && (
          <>
            <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            <motion.div className="glass modal" initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}>
              <div className="eyebrow">שיעור קצר · עולם {args.w! + 1}</div>
              <h2 className="h-lg" style={{ marginTop: 6 }}>{W.name}</h2>
              <p className="muted" style={{ margin: 0 }}>אפשר ללחוץ על כל מילה מסומנת כדי לראות הסבר.</p>
              <ul className="lesson-list">{W.lesson.map((t, k) => <motion.li key={k} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + k * 0.1 }}><Rich text={t} /></motion.li>)}</ul>
              <div className="modal-actions"><button className="btn gold wide" onClick={() => { update(p => { p.lessons[args.w!] = 1; }); setPhase('decide'); }}>יאללה, לשולחן</button></div>
            </motion.div>
          </>
        )}
        {phase === 'done' && result && (
          <>
            <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
            <motion.div className="glass modal" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 20 }}>
              <h2 className="h-lg">{result.stars ? 'עברת את השלב!' : 'כמעט! נסה שוב'}</h2>
              <div className="stars-big">
                {[0, 1, 2].map(k => (
                  <motion.span key={k} className={k < result.stars ? 'on' : ''} initial={{ scale: 0, rotateY: 180 }} animate={{ scale: 1, rotateY: 0 }} transition={{ delay: 0.3 + k * 0.25, type: 'spring', stiffness: 300, damping: 14 }}>★</motion.span>
                ))}
              </div>
              {!result.stars && <p className="muted" style={{ margin: 0 }}>צריך לפחות 600 נקודות כדי לפתוח את השלב הבא.</p>}
              {result.lvUp != null && (
                <motion.div className="chip gold big" style={{ margin: '8px auto 0' }} initial={{ scale: 0 }} animate={{ scale: [0, 1.2, 1] }} transition={{ delay: 1.1 }}>
                  עלית לדרגה {result.lvUp + 1}: {LEVEL_NAMES[result.lvUp]}
                </motion.div>
              )}
              <div className="res-grid">
                <div className="stat"><span>נקודות</span><b className="num">{points}</b></div>
                <div className="stat"><span>נכונות</span><b className="num">{res.filter(x => x === 'g').length}/{HANDS_PER_ROUND}</b></div>
                <div className="stat"><span>XP</span><b className="num gold-text">+{result.xp}</b></div>
              </div>
              <div className="modal-actions">
                {result.stars > 0 && nextStage && <button className="btn gold wide" onClick={() => go('play', { mode: 'stage', ...nextStage, back: args.back })}>לשלב הבא</button>}
                <button className="btn wide" onClick={() => go('play', { mode: 'stage', w: args.w, l: args.l, back: args.back })}>שוב את השלב</button>
                {args.back === 'path' ? <button className="btn wide" onClick={() => go('path')}>חזרה למסלול שלי</button>
                  : <button className="btn wide" onClick={() => go('home')}>חזרה למסע</button>}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {streak >= 3 && phase === 'feedback' && (
          <motion.div key={streak} className="streak-chip" style={{ x: '-50%' }} initial={{ scale: 0, y: -10 }} animate={{ scale: [0, 1.25, 1], y: 0 }} exit={{ opacity: 0 }}>🔥 {streak} ברצף!</motion.div>
        )}
      </AnimatePresence>
      <Burst fire={burst} />
    </div>
  );
}
