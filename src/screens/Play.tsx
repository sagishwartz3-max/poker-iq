import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { hashStr, mulberry32 } from '../engine/cards';
import { grade, makeScenario, type Action, type GenCfg, type Scenario } from '../engine/scenarios';
import { dueMistakes, nodeId, promoteMistake, recordSkill, rememberMistake, SKILLS, today, unlocked, yesterday } from '../game/progress';
import { sfx } from '../game/sound';
import { track } from '../net/supabase';
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
    if (args.mode === 'drill') {
      const d = drillCfg(args.drill!);
      return { cfg: d.cfg, keep: d.keep, title: 'אימון ממוקד', sub: SKILLS[args.drill!] || '', timer: 0, seed: (Math.random() * 2 ** 32) >>> 0 };
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
  const queue = useRef<Scenario[]>(args.mode === 'review' ? dueMistakes(P).map(m => m.s).sort(() => Math.random() - 0.5).slice(0, HANDS_PER_ROUND) : []);
  const total = args.mode === 'review' ? queue.current.length : HANDS_PER_ROUND;
  const [streak, setStreak] = useState(0);

  const deal = useCallback(() => {
    let sc = args.mode === 'review' ? queue.current[i] : makeScenario(cfg, rng.current);
    if (keep) for (let t = 0; t < 30 && sc && !keep(sc); t++) sc = makeScenario(cfg, rng.current);
    if (!sc) return;
    setS(sc); setLast(null); t0.current = performance.now();
    sc.board.forEach((_, k) => sfx.deal(k));
  }, [cfg, i, args.mode, keep]);

  const dailyUsed = useRef(args.mode === 'daily' && P.daily?.date === today());
  useEffect(() => { if (dailyUsed.current) go('daily'); }, [go]);
  useEffect(() => { if (phase === 'decide' && !s && !dailyUsed.current) deal(); }, [phase, s, deal]);

  const answer = useCallback((a: Action | 'timeout') => {
    if (!s || last) return;
    const g = grade(s, a);
    const sec = (performance.now() - t0.current) / 1000;
    let pts = g === 'g' ? 100 : g === 'c' ? 70 : 0;
    if (args.mode === 'daily' && pts) pts += Math.max(0, Math.round(50 - 4 * sec));
    setLast({ a, g, pts });
    setRes(r => { const n = [...r]; n[i] = g; return n; });
    setPoints(p => p + pts);
    update(p => {
      p.hands++; if (g !== 'b') p.correct++;
      recordSkill(p, s, g === 'g' ? 100 : g === 'c' ? 70 : 0);
      if (g === 'b') rememberMistake(p, s);
      else if (args.mode === 'review') promoteMistake(p, s);
      if (args.mode === 'daily') {
        if (p.lastDaily !== today()) { p.dailyStreak = p.lastDaily === yesterday() ? p.dailyStreak + 1 : 1; p.lastDaily = today(); }
        const marks = [...res]; marks[i] = g;
        p.daily = { date: today(), score: points + pts, squares: marks.map(x => (x === 'g' ? '🟩' : x === 'c' ? '🟨' : '🟥')).join('') };
      }
    });
    if (args.mode === 'daily') sync();
    setStreak(x => (g === 'g' ? x + 1 : 0));
    if (g === 'g') { sfx.good(); setBurst(b => b + 1); } else if (g === 'c') sfx.close(); else sfx.bad();
    setPhase('feedback');
  }, [s, last, i, args.mode, update, res, points, sync]);

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
        p.xp += Math.round(sum * 0.5);
      });
      sync(); toast(`+${Math.round(sum * 0.5)} XP`); go('daily'); return;
    }
    if (args.mode === 'review' || args.mode === 'drill') {
      const good = res.filter(x => x !== 'b').length;
      const xp = good * (args.mode === 'review' ? 20 : 15);
      update(p => { p.xp += xp; }); sync();
      toast(args.mode === 'review' ? (good ? `תיקנת ${good} טעויות · +${xp} XP. הן יחזרו בעוד כמה ימים לבדיקה` : 'נסה שוב, ההסבר יעזור')
        : `${good}/${total} נכונות · +${xp} XP`);
      go(args.mode === 'drill' ? 'profile' : 'home'); return;
    }
    const frac = sum / (HANDS_PER_ROUND * 100);
    const stars = frac >= 0.9 ? 3 : frac >= 0.75 ? 2 : frac >= 0.6 ? 1 : 0;
    const xp = Math.round(sum * (1 + 0.25 * args.w!) * 0.6);
    const before = levelOf(P.xp), after = levelOf(P.xp + xp);
    update(p => { p.xp += xp; const id = nodeId(args.w!, args.l!); if (stars > (p.stars[id] || 0)) p.stars[id] = stars; });
    sync();
    setResult({ stars, xp, lvUp: after > before ? after : null });
    setPhase('done');
    setTimeout(() => (after > before ? sfx.level() : stars ? sfx.good() : sfx.bad()), 300);
    if (stars) setTimeout(() => setBurst(b => b + 1), 500);
  };

  const next = () => {
    if (!endless && i >= total - 1) { finish(); return; }
    setI(x => x + 1); setS(null); setPhase('decide');
  };

  const quit = () => {
    if (args.mode === 'daily' && res.length) { finish(); return; } // the attempt is used: bank what was played
    if (endless && points) { const xp = Math.round(points * 0.3); update(p => { p.xp += xp; }); sync(); toast(`+${xp} XP מאימון חופשי`); }
    go(args.mode === 'daily' ? 'daily' : 'home');
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
            nextLabel={!endless && i >= total - 1 ? (short ? 'סיום' : 'לתוצאות') : 'יד הבאה'} />
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
                  עלית לרמה {result.lvUp + 1}: {LEVEL_NAMES[result.lvUp]}
                </motion.div>
              )}
              <div className="res-grid">
                <div className="stat"><span>נקודות</span><b className="num">{points}</b></div>
                <div className="stat"><span>נכונות</span><b className="num">{res.filter(x => x === 'g').length}/{HANDS_PER_ROUND}</b></div>
                <div className="stat"><span>XP</span><b className="num gold-text">+{result.xp}</b></div>
              </div>
              <div className="modal-actions">
                {result.stars > 0 && nextStage && <button className="btn gold wide" onClick={() => go('play', { mode: 'stage', ...nextStage })}>לשלב הבא</button>}
                <button className="btn wide" onClick={() => go('play', { mode: 'stage', w: args.w, l: args.l })}>שוב את השלב</button>
                <button className="btn wide" onClick={() => go('home')}>חזרה למסע</button>
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
