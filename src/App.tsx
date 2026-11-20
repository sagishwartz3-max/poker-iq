import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GLOSSARY } from './engine/glossary';
import { load, persist, type Progress } from './game/progress';
import { setSound } from './game/sound';
import { savePlayer, track } from './net/supabase';
import { phCapture } from './net/posthog';
import { native } from './native';
import { Board } from './screens/Board';
import { Daily } from './screens/Daily';
import { Diagnose } from './screens/Diagnose';
import { Path } from './screens/Path';
import { Lesson } from './screens/Lesson';
import { Duel } from './screens/Duel';
import { Friends } from './screens/Friends';
import { Home } from './screens/Home';
import { Learn } from './screens/Learn';
import { Onboarding } from './screens/Onboarding';
import { Play } from './screens/Play';
import { Pro } from './screens/Pro';
import { Profile } from './screens/Profile';
import { Background } from './ui/Background';
import { Ctx, type AppCtx, type PlayArgs, type Screen } from './ui/ctx';
import { I } from './ui/Icons';

const TABS: { s: Screen; t: string; icon: JSX.Element }[] = [
  { s: 'home', t: 'מסע', icon: I.map },
  { s: 'duel', t: 'חברים', icon: I.swords },
  { s: 'board', t: 'דירוג', icon: I.trophy },
  { s: 'learn', t: 'מילון', icon: I.book },
  { s: 'profile', t: 'פרופיל', icon: I.user }
];

const urlDuel = new URLSearchParams(location.search).get('duel')?.toUpperCase().slice(0, 5) || '';
const urlTable = new URLSearchParams(location.search).get('table')?.toUpperCase().slice(0, 5) || '';
const urlClub = new URLSearchParams(location.search).get('club')?.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || '';

export default function App() {
  const [P, setP] = useState<Progress>(load);
  const pRef = useRef(P); pRef.current = P;
  const [screen, setScreen] = useState<Screen>(urlTable || urlClub ? 'table' : urlDuel ? 'duel' : 'home');
  const [play, setPlay] = useState<PlayArgs>({ mode: 'free' });
  const [playKey, setPlayKey] = useState(0);
  const [term, setTerm] = useState<string | null>(null);
  const [toastMsg, setToast] = useState<string | null>(null);
  const [duelLive, setDuelLive] = useState(false);
  const toastT = useRef<number>();
  const syncT = useRef<number>();

  useEffect(() => { setSound(P.sound); }, [P.sound]);
  // which screens people reach: the funnel from first open to the first table (PostHog)
  useEffect(() => { if (native.screen) void native.screen(screen); else phCapture('screen_view', { screen }); }, [screen]);
  useEffect(() => { if (urlDuel || urlTable || urlClub) history.replaceState(null, '', location.pathname); }, []);
  useEffect(() => { if (P.onboarded) track(P, 'app_open', { via: urlClub ? 'club_link' : urlTable ? 'table_link' : urlDuel ? 'duel_link' : 'direct', hands: P.hands, xp: P.xp }); }, [P.onboarded]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = useCallback((fn: (p: Progress) => void) => {
    setP(prev => { const next: Progress = JSON.parse(JSON.stringify(prev)); fn(next); persist(next); return next; });
  }, []);
  const sync = useCallback(() => {
    clearTimeout(syncT.current);
    syncT.current = window.setTimeout(() => { savePlayer(pRef.current).catch(() => {}); }, 800);
  }, []);
  const toast = useCallback((m: string) => { setToast(m); clearTimeout(toastT.current); toastT.current = window.setTimeout(() => setToast(null), 2400); }, []);
  const go = useCallback((s: Screen, args?: PlayArgs) => { if (args) { setPlay(args); setPlayKey(k => k + 1); } setScreen(s); }, []);
  const ctx: AppCtx = useMemo(() => ({ P, update, term: setTerm, toast, go, sync }), [P, update, toast, go, sync]);

  const showTabs = P.onboarded && screen !== 'play' && screen !== 'daily' && screen !== 'pro' && screen !== 'table' && screen !== 'diagnose' && screen !== 'lesson' && !duelLive;
  const t = term ? GLOSSARY[term] : null;

  return (
    <Ctx.Provider value={ctx}>
      <Background />
      <div className={`shell ${screen === 'table' ? 'table-shell' : ''}`}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div key={P.onboarded ? screen + (screen === 'play' || screen === 'lesson' ? playKey : '') : 'onb'} style={{ position: 'absolute', inset: 0 }}
            initial={{ opacity: 0, y: 18, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.99 }} transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}>
            {!P.onboarded ? <Onboarding />
              : screen === 'home' ? <Home />
              : screen === 'play' ? <Play args={play} />
              : screen === 'daily' ? <Daily />
              : screen === 'duel' ? <Duel initialCode={urlDuel} onPlaying={setDuelLive} />
              : screen === 'table' ? <Friends initialCode={urlTable} initialClub={urlClub} onPlaying={setDuelLive} />
              : screen === 'board' ? <Board />
              : screen === 'learn' ? <Learn />
              : screen === 'pro' ? <Pro />
              : screen === 'diagnose' ? <Diagnose />
              : screen === 'path' ? <Path />
              : screen === 'lesson' ? <Lesson args={play} />
              : <Profile />}
          </motion.div>
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {showTabs && (
          <motion.nav className="glass tabbar" aria-label="ניווט ראשי" initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}>
            <LayoutGroup>
              {TABS.map(x => (
                <button key={x.s} className={`tab ${screen === x.s ? 'on' : ''}`} onClick={() => go(x.s)} aria-current={screen === x.s ? 'page' : undefined}>
                  {screen === x.s && <motion.span layoutId="tabpill" className="pill" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
                  {x.icon}<span>{x.t}</span>
                </button>
              ))}
            </LayoutGroup>
          </motion.nav>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {t && (
          <>
            <motion.div className="scrim" style={{ zIndex: 69, background: 'rgba(2,4,10,.35)' }} onClick={() => setTerm(null)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            <motion.div className="term-pop" role="dialog" aria-label={t.he} onClick={() => setTerm(null)} initial={{ y: 40, opacity: 0, scale: 0.96 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 30, opacity: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 30 }}>
              <h4>{t.he}</h4><div className="en">{t.en}</div><p>{t.def}</p>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toastMsg && <motion.div className="toast" initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -30, opacity: 0 }}>{toastMsg}</motion.div>}
      </AnimatePresence>
    </Ctx.Provider>
  );
}
