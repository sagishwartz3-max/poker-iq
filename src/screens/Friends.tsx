import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { isRed, madeHand, RN, SUITS } from '../engine/cards';
import { act, BLINDS, canRebuy, DEFAULT_CFG, mayRaise, newTable, prizes, publicView, seat, activeCount, showTimes, startHand, turnSecs, type PV, type TAction, type TCfg, type TS, type View } from '../engine/holdem';
import { applyCmd, CFG_OPTS, optText, type TableCmd } from '../engine/tableops';
import { answerText, gradeTable, reviewText, spotLesson, tableAdvice, thinkText, type TGrade } from '../engine/coach';
import { gain, SKILLS, TABLE_XP_DAY, today } from '../game/progress';
import { sfx } from '../game/sound';
import { PUBLIC_URL, savePlayer, track } from '../net/supabase';
import { createTable, tableCmd, TableLive } from '../net/tableApi';
import { Burst } from '../ui/Burst';
import { Chips } from '../ui/Chips';
import { Dial } from '../ui/Dial';
import { PeekCards } from '../ui/PeekCards';
import { ClubList, ClubView } from '../ui/ClubPanel';
import type { Club } from '../net/clubs';
import { ROOM, RoomStage } from '../ui/RoomStage';
import { useApp } from '../ui/ctx';
import { Rich } from '../ui/Rich';
import { I } from '../ui/Icons';
import { shareLinks } from './Duel';
import { asset } from '../native';

const rnd = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
const fmt = (n: number) => n.toLocaleString('he-IL');
const EMOJIS = ['👍', '😂', '😱', '🔥', '🤡', '👏'];
const AVATARS = ['10_avatar_hero', '05_avatar_top_left', '07_avatar_left', '06_avatar_top_right', '08_avatar_right', '09_avatar_lower_right'];

function MiniCard({ c, size = 30, down = false, delay = 0, hl = '' }: { c: number; size?: number; down?: boolean; delay?: number; hl?: string }) {
  return (
    <motion.div className={`card3d ${isRed(c) ? 'red' : ''} ${hl}`} style={{ '--cw': `${size}px` } as React.CSSProperties}
      initial={{ rotateY: 180, y: -30, opacity: 0 }} animate={{ rotateY: down ? 180 : 0, y: 0, opacity: 1 }} transition={{ delay, type: 'spring', stiffness: 170, damping: 18 }}>
      <div className="face"><span className="rk">{RN[c >> 2]}</span><span className="su">{SUITS[c & 3]}</span><span className="big">{SUITS[c & 3]}</span></div>
      <div className="back" />
    </motion.div>
  );
}

const Opt = <T,>({ label, value, set, opts }: { label: string; value: T; set: (v: T) => void; opts: [T, string][] }) => (
  <div className="field"><label>{label}</label>
    <div className="opt-row">{opts.map(([v, t]) => <button key={t} type="button" className={`chip ${v === value ? 'gold' : ''}`} onClick={() => set(v)}>{t}</button>)}</div>
  </div>
);

const MINE_KEY = 'pokeriq-table-mine';

export function Friends({ initialCode, initialClub, onPlaying }: { initialCode?: string; initialClub?: string; onPlaying: (b: boolean) => void }) {
  const { P, toast, go, update, sync } = useApp();
  const [code, setCode] = useState('');
  const [clubId, setClubId] = useState<string | null>(null); // the club page that is open (tables return to it)
  const [privOpen, setPrivOpen] = useState(false); // the private-table settings are folded until asked for
  const [clubInvite, setClubInvite] = useState(initialClub || ''); // a club link joins once, not every time the list shows
  const [tableClub, setTableClub] = useState(''); // the club name of the table I'm at
  const [joinCode, setJoinCode] = useState(initialCode || '');
  const [cfg, setCfg] = useState<TCfg>({ ...DEFAULT_CFG, rebuys: 0, learn: true });
  const [V, setV] = useState<View | null>(null);
  const [skew, setSkew] = useState(0); // server clock minus ours
  const [mine, setMine] = useState<{ hand: number; cards: number[] } | null>(null);
  const [practice, setPractice] = useState(false);
  const [gameMode, setGameMode] = useState('טורניר');
  const [raiseTo, setRaiseTo] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);
  const [tray, setTray] = useState(false);
  const [helpOff, setHelpOff] = useState(() => { try { return localStorage.getItem('pokeriq-help-off') === '1'; } catch { return false; } });
  const toggleHelp = () => setHelpOff(v => { try { localStorage.setItem('pokeriq-help-off', v ? '0' : '1'); } catch { /* private mode */ } return !v; });
  // this player's graded decisions tonight (private, never sent to the table)
  const [log, setLog] = useState<{ hand: number; g: TGrade; text: string; skills: string[]; hinted: boolean }[]>([]);
  const [shownAns, setShownAns] = useState(''); // the spot whose answer the player asked to see
  const [lessonAt, setLessonAt] = useState(''); // the spot whose lesson hint is open
  const [fb, setFb] = useState<{ g: TGrade; text: string; at: number } | null>(null);
  const [earned, setEarned] = useState(0);
  const [tall, setTall] = useState(() => typeof window !== 'undefined' && innerHeight > innerWidth * 1.15);
  const [giftAmt, setGiftAmt] = useState('');
  const [now, setNow] = useState(Date.now());
  const [bubbles, setBubbles] = useState<Record<string, { e: string; k: number }>>({});
  const [burst, setBurst] = useState(0);
  const [pendingAt, setPendingAt] = useState(-1);
  // pre-actions: chosen while waiting, played the moment my turn comes (cleared when the bet changes)
  const [pre, setPre] = useState<{ kind: 'cf' | 'call' | 'any'; bet: number; hand: number; street: number } | null>(null);
  const [prevOpen, setPrevOpen] = useState(false);
  const live = useRef<TableLive | null>(null);
  const S = useRef<TS | null>(null); // the practice table's state (online tables live on the server)
  const lastAt = useRef(0);
  const botDue = useRef(0);
  const codeRef = useRef('');
  const lastHost = useMemo(() => { try { return localStorage.getItem(MINE_KEY) || ''; } catch { return ''; } }, []);

  useEffect(() => { onPlaying(!!code); }, [code, onPlaying]);
  useEffect(() => () => { live.current?.leave(); onPlaying(false); }, [onPlaying]);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(id); }, []);

  /* ---------------- state from the server (or the practice table) ---------------- */
  const takeView = useCallback((v: View | undefined, cards?: { hand: number; cards: number[] } | null) => {
    if (cards) setMine(cards);
    if (!v || v.at < lastAt.current) return; // an older answer that arrived late
    lastAt.current = v.at; setV(v); setSkew(v.at - Date.now());
  }, []);
  const commitLocal = useCallback(() => {
    const s = S.current; if (!s) return;
    const me = s.players.find(p => p.id === P.id);
    takeView(publicView(s, Date.now()), me?.cards ? { hand: s.handNo, cards: me.cards } : null);
  }, [P.id, takeView]);
  /** One command to the table: the server for online tables, the device for the practice table. */
  const send = useCallback(async (cmd: TableCmd, quiet = false) => {
    if (practice) { const s = S.current; if (!s) return false; const r = applyCmd(s, P.id, cmd, Date.now(), rnd, false); commitLocal(); if (!r.ok && !quiet && r.error) toast(r.error); return r.ok; }
    const c = codeRef.current; if (!c) return false;
    const r = await tableCmd(P, c, cmd);
    takeView(r.view, r.mine);
    if (!r.ok && !quiet && r.error && cmd.t !== 'tick' && cmd.t !== 'beat') toast(r.error);
    return !!r.ok;
  }, [practice, P, commitLocal, takeView, toast]);

  // practice table: bots play, and time passes, on the device
  useEffect(() => {
    if (!practice || !code) return;
    const id = setInterval(() => {
      const s = S.current; if (!s) return;
      const t = Date.now();
      if (!s.paused && s.phase === 'hand' && s.turn && s.turn !== P.id && t > botDue.current) {
        const bot = s.players.find(p => p.id === s.turn)!;
        const call = Math.max(0, s.curBet - bot.bet), roll = rnd();
        // practice bots play their cards: weak hands give up against big bets, strong ones raise more often
        const str = bot.cards ? madeHand(bot.cards, s.board).strength : 1;
        const big = call > Math.max(s.bb * 6, (bot.stack + bot.bet) * 0.25);
        const action: TAction = mayRaise(s, bot) && (str >= 3 ? roll > .55 : roll > .9) ? { type: 'raise', to: s.curBet + s.minRaise }
          : call && (big ? str < 3 && roll < .85 : str === 0 ? roll < .4 : roll < .1) ? { type: 'fold' } : call ? { type: 'call' } : { type: 'check' };
        act(s, bot.id, action, t); botDue.current = t + 1600;
      }
      applyCmd(s, P.id, { t: 'tick' }, t, rnd, false);
      commitLocal();
    }, 400);
    return () => clearInterval(id);
  }, [practice, code, commitLocal, P.id]);

  /* ---------------- joining ---------------- */
  const [busy, setBusy] = useState(false);
  const enter = async (codeIn: string | null, club?: Club) => {
    if (busy) return;
    setBusy(true);
    try {
      await savePlayer(P).catch(() => {}); // the server knows this player before the table does
      const r = codeIn ? await tableCmd(P, codeIn.toUpperCase(), { t: 'join', nick: P.nick || 'שחקן' }) : await createTable(P, cfg, club?.id);
      if (!r.ok || !r.view || !r.channel) { toast(r.error || 'החיבור לשולחן נכשל. נסה שוב.'); return; }
      const c = r.code || codeIn!.toUpperCase();
      try { localStorage.setItem(MINE_KEY, c); } catch { /* storage off */ }
      live.current?.leave();
      S.current = null; lastAt.current = 0; codeRef.current = c;
      setTableClub(r.club && club && r.club === club.id ? club.name : r.club ? 'מועדון' : '');
      setPractice(false); setCode(c); setMine(null); setLog([]); setEarned(0); setFb(null);
      takeView(r.view, r.mine);
      const l = new TableLive(r.channel, v => takeView(v), (from, e) => setBubbles(b => ({ ...b, [from]: { e, k: Date.now() } })));
      l.join(); live.current = l;
      track(P, 'table_enter', { host: r.view.hostId === P.id });
    } finally { setBusy(false); }
  };
  useEffect(() => { if (initialCode && initialCode.length === 5) enter(initialCode.toUpperCase()); /* eslint-disable-next-line */ }, []);
  /* ---------------- derived view ---------------- */
  const me = V?.players.find(p => p.id === P.id);
  const isHost = !!V && V.hostId === P.id; // the manager: settings, start, pause, gifts
  const mgr = V?.players.find(p => p.id === V.hostId);
  // after acting, the buttons wait for the server's answer (no double taps, no stale actions)
  const myTurn = !!V && V.phase === 'hand' && V.turn === P.id && !V.paused && pendingAt !== V.at;
  const myCards = V && mine && mine.hand === V.handNo && me?.inHand ? mine.cards : null;
  const toCall = V && me ? Math.max(0, V.curBet - me.bet) : 0;
  const maxTo = me ? me.bet + me.stack : 0;
  const minTo = V ? Math.min(maxTo, V.curBet + V.minRaise) : 0;
  const hostNow = now + skew;
  const left = V && V.phase === 'hand' ? Math.min(turnSecs(V.cfg), Math.max(0, (V.deadline - (V.paused ? V.pausedAt ?? hostNow : hostNow)) / 1000)) : 0;
  const lvLeft = V && V.levelEnds ? Math.max(0, V.levelEnds - hostNow) : 0;
  const learn = !!V?.cfg.learn;
  const potAll = V ? V.pot : 0; // the pot already includes this street's bets
  const nOpp = V ? V.players.filter(p => p.inHand && !p.folded && p.id !== P.id).length : 0;
  const payNow = me ? Math.min(toCall, me.stack) : 0;
  // the coach's read of my spot: always computed on my turn (to grade the decision), shown only in learning mode
  const advice = useMemo(() => (myTurn && myCards && V ? tableAdvice(myCards, V.board, nOpp, potAll, payNow, V.handNo * 977 + V.street * 31 + payNow, V.bb, V.curBet) : null),
    [myTurn, myCards?.join(), V?.board.length, V?.handNo, nOpp, potAll, payNow]); // eslint-disable-line react-hooks/exhaustive-deps
  const handLog = V ? log.filter(x => x.hand === V.handNo) : [];
  const spotKey = V ? `${V.handNo}-${V.street}-${payNow}` : '';
  const ansOpen = !!advice && shownAns === spotKey;
  // the showdown timeline: board cards of an all-in run-out land one street at a time, then the result is revealed
  const sd = V?.phase === 'show';
  const showdown = sd && !!V && Object.keys(V.shown).length > 0;
  const tm = showTimes(V?.runFrom ?? 5, showdown);
  const tShow = sd && V?.showAt ? (now + skew - V.showAt) / 1000 : 99;
  const resolved = sd && tShow >= tm.resolveAt;
  const winBest = new Set(sd && V?.winners[0] ? V.hands?.[V.winners[0].id]?.best ?? [] : []);
  const hlOf = (c: number) => (resolved && showdown ? (winBest.has(c) ? 'hl' : 'lo') : '') as '' | 'hl' | 'lo';

  useEffect(() => { setRaiseTo(null); if (V?.handNo) sfx.deal(0); }, [V?.handNo]);

  // heartbeat: every 8 s while the screen is on, and right away when the phone goes to the background or comes back
  useEffect(() => {
    if (!code || practice) return;
    const beat = () => void send({ t: 'beat', vis: !document.hidden }, true);
    const onVis = () => beat();
    beat();
    const id = setInterval(() => { if (!document.hidden) beat(); }, 8000);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onVis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pagehide', onVis); };
  }, [code, practice, send]);
  // the server moves only when asked: whoever is here asks it at the moment a turn clock runs out or the next hand is due
  useEffect(() => {
    if (!code || practice || !V || V.phase === 'over' || V.paused) return;
    const due = V.phase === 'hand' ? V.deadline : V.phase === 'show' ? V.nextAt : V.handNo > 0 ? V.at + 3000 : 0;
    if (!due) return;
    const wait = Math.max(300, due - (Date.now() + skew)) + 250 + Math.random() * 500;
    const id = setTimeout(() => { if (!document.hidden) void send({ t: 'tick' }, true); }, wait);
    return () => clearTimeout(id);
  }, [code, practice, V?.phase, V?.deadline, V?.nextAt, V?.handNo, V?.paused, V?.at, skew, send]); // eslint-disable-line react-hooks/exhaustive-deps
  // a new hand: fetch my two cards if the push did not bring them
  useEffect(() => { if (!practice && code && V?.phase === 'hand' && me?.inHand && mine?.hand !== V.handNo && !document.hidden) void send({ t: 'beat', vis: true }, true); }, [V?.handNo, V?.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // tell everyone who joined, and what the manager changed in the waiting room
  const seen = useRef<{ code: string; ids: Set<string> } | null>(null);
  useEffect(() => {
    if (!V) return;
    const was = seen.current?.code === code ? seen.current.ids : null; // a new table: nobody "joined" yet
    if (was) for (const p of V.players) if (!was.has(p.id) && p.id !== P.id) toast(V.handNo > 0 ? `${p.nick} הצטרף ויקבל קלפים ביד הבאה` : `${p.nick} הצטרף לשולחן`);
    seen.current = { code, ids: new Set(V.players.map(p => p.id)) };
  }, [V?.players.length, code]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (V?.note && (!isHost || !V.note.text.startsWith('המנהל:')) && Date.now() + skew - V.note.at < 8000) toast(V.note.text); }, [V?.note?.at]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setRaiseTo(null); if (myTurn) sfx.tick(); }, [myTurn, V?.street]);
  useEffect(() => { if (V?.last) sfx.chip(); }, [V?.last?.id, V?.last?.text, V?.pot]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (resolved && V!.winners.some(w => w.id === P.id)) { sfx.good(); setBurst(b => b + 1); } }, [resolved, V?.handNo]); // eslint-disable-line react-hooks/exhaustive-deps

  const grade = (a: TAction) => {
    if (!advice || !V) return;
    const kind = a.type;
    const g = gradeTable(advice, kind), text = reviewText(advice, kind, g), skills = spotLesson(advice).skills;
    setLog(l => [...l, { hand: V.handNo, g, text, skills, hinted: ansOpen }]);
    if (learn) setFb({ g, text, at: Date.now() });
    // a decision made after looking at the answer earns less: the point is to work it out
    const want = (g === 'g' ? 6 : g === 'c' ? 3 : 0) / (ansOpen ? 2 : 1), d = today();
    const used = P.tableDay?.date === d ? P.tableDay.xp : 0, give = Math.max(0, Math.min(Math.floor(want), TABLE_XP_DAY - used));
    update(p => {
      // table decisions count in the same skill map the app uses for its targeted practice
      if (learn) for (const k of skills) { const v = p.skills[k] || [0, 0]; p.skills[k] = [v[0] + 1, v[1] + (g === 'g' ? 100 : g === 'c' ? 70 : 0)]; }
      if (give) { if (p.tableDay?.date !== d) p.tableDay = { date: d, xp: 0 }; p.tableDay.xp += give; gain(p, give); }
    });
    if (give) setEarned(e => e + give);
    sync();
  };
  const doAct = (a: TAction) => {
    grade(a);
    sfx.tap(); setRaiseTo(null);
    setPendingAt(V!.at);
    void send({ t: 'act', hand: V!.handNo, a }, true).then(ok => { if (!ok) setPendingAt(-1); });
  };
  // play the chosen pre-action as soon as it is my turn
  useEffect(() => {
    if (!pre || !V) return;
    if (pre.hand !== V.handNo || pre.street !== V.street || (pre.kind === 'call' && V.curBet !== pre.bet)) { setPre(null); return; }
    if (!myTurn) return;
    const a: TAction = pre.kind === 'cf' ? (toCall > 0 ? { type: 'fold' } : { type: 'check' }) : toCall > 0 ? { type: 'call' } : { type: 'check' };
    setPre(null); doAct(a);
  }, [myTurn, V?.handNo, V?.street, V?.curBet]); // eslint-disable-line react-hooks/exhaustive-deps
  const canPre = !!V && V.phase === 'hand' && !myTurn && !!me?.inHand && !me.folded && !me.allIn && !!myCards && pendingAt !== V.at;
  const togglePre = (kind: 'cf' | 'call' | 'any') => setPre(p => (p?.kind === kind ? null : V ? { kind, bet: V.curBet, hand: V.handNo, street: V.street } : null));
  const buyIn = V?.cfg.buyIn ?? 0;
  const doPay = (on: boolean) => {
    if (on && (P.coins ?? 0) < buyIn) { toast('אין לך מספיק מטבעות לדמי הכניסה'); return; }
    void send({ t: on ? 'pay' : 'unpay' });
  };
  // the entry leaves the wallet once, when the first hand is dealt; prizes arrive once, when the game is over
  const gameId = V ? `${V.code}-${V.startedAt}` : '';
  useEffect(() => {
    if (!V || !buyIn || !V.startedAt || !me?.paid) return;
    const k = `pokeriq-buyin-${gameId}`;
    try { if (localStorage.getItem(k)) return; localStorage.setItem(k, '1'); } catch { return; }
    update(p => { p.coins = Math.max(0, (p.coins ?? 0) - buyIn); }); sync();
    toast(`שילמת ${fmt(buyIn)} מטבעות דמי כניסה. בהצלחה!`);
  }, [gameId, me?.paid]); // eslint-disable-line react-hooks/exhaustive-deps
  const myPrize = V?.phase === 'over' ? prizes(V as unknown as TS).find(x => x.id === P.id) : undefined;
  useEffect(() => {
    if (!myPrize || !V) return;
    const k = `pokeriq-prize-${gameId}`;
    try { if (localStorage.getItem(k) || !localStorage.getItem(`pokeriq-buyin-${gameId}`)) return; localStorage.setItem(k, '1'); } catch { return; }
    update(p => { p.coins = (p.coins ?? 0) + myPrize.amount; }); sync();
    sfx.good(); setBurst(b => b + 1);
  }, [gameId, myPrize?.amount]); // eslint-disable-line react-hooks/exhaustive-deps
  const backIn = () => void send({ t: 'back' });
  const setOpt = (key: keyof TCfg, val: number | boolean) => {
    if (isHost) { sfx.tap(); void send({ t: 'cfg', key, val }); }
    else void send({ t: 'suggest', key, val }).then(ok => ok && toast(`ההצעה נשלחה למנהל: ${optText(key, val)}`));
  };
  const doRebuy = () => void send({ t: 'rebuy' });
  const emoji = (e: string) => { live.current?.emoji(P.id, e); setBubbles(b => ({ ...b, [P.id]: { e, k: Date.now() } })); };
  const leave = () => {
    if (!practice && codeRef.current) { void tableCmd(P, codeRef.current, { t: 'beat', vis: false }); if (V?.phase === 'over') try { localStorage.removeItem(MINE_KEY); } catch { /* storage off */ } }
    live.current?.leave(); live.current = null; S.current = null; codeRef.current = ''; lastAt.current = 0; setCode(''); setV(null); setMenu(false); setPractice(false); };
  const train = () => {
    const s = newTable('TRAIN', P.id, { ...cfg, buyIn: 0 });
    seat(s, P.id, P.nick || 'אני');
    ['נועם · בוט', 'מיה · בוט', 'אורי · בוט', 'דניאל · בוט', 'עומר · בוט'].forEach((nick, i) => seat(s, `bot-${i}`, nick));
    S.current = s; lastAt.current = 0; codeRef.current = ''; setPractice(true); setCode('TRAIN'); setLog([]); setEarned(0); setFb(null);
    startHand(s, rnd, Date.now()); botDue.current = Date.now() + 1600;
    takeView(publicView(s, Date.now()), s.players[0].cards ? { hand: s.handNo, cards: s.players[0].cards } : null);
  };

  const link = `${PUBLIC_URL}?table=${code}`;
  const sh = shareLinks(`🃏 ${P.nick || 'חבר'} פתח שולחן פוקר ב-Poker IQ. בוא לשחק! קוד: ${code}`, link);

  // table settings, used for a private table and for a club's table
  const settingsForm = (<>
        <Opt label="מצב משחק" value={gameMode} set={mode => { setGameMode(mode); setCfg(c => ({ ...c, levelMin: mode === 'טורבו' ? 5 : mode === 'טורניר' ? 10 : 0, rebuys: mode === 'טורניר' || c.buyIn ? 0 : 2, turnSec: mode === 'טורבו' ? 20 : 30 })); }} opts={[['רגיל', 'רגיל'], ['טורבו', 'טורבו'], ['טורניר', 'טורניר']]} />
        <Opt label="ז׳יטונים לכל שחקן" value={cfg.stack} set={v => setCfg({ ...cfg, stack: v })} opts={[[1000, '1,000'], [2000, '2,000'], [5000, '5,000'], [10000, '10,000']]} />
        <Opt label="הבליינדים עולים כל" value={cfg.levelMin} set={v => setCfg({ ...cfg, levelMin: v })} opts={[[0, 'לא עולים'], [5, '5 דק׳'], [10, '10 דק׳'], [15, '15 דק׳'], [20, '20 דק׳']]} />
        {!cfg.buyIn && <Opt label="כמה ריביי מותר לכל שחקן" value={cfg.rebuys} set={v => setCfg({ ...cfg, rebuys: v })} opts={[[0, 'בלי'], [1, '1'], [2, '2'], [3, '3'], [-1, 'בלי הגבלה']]} />}
        <Opt label="דמי כניסה במטבעות (הזוכים לוקחים את הקופה)" value={cfg.buyIn ?? 0} set={v => setCfg(c => ({ ...c, buyIn: v, rebuys: v ? 0 : c.rebuys }))} opts={[[0, 'בלי'], [100, '100'], [250, '250'], [500, '500'], [1000, '1,000']]} />
        {!!cfg.buyIn && <p className="muted" style={{ fontSize: 12, margin: '-6px 0 10px' }}>כל שחקן משלם {fmt(cfg.buyIn)} מטבעות מהארנק כשהמשחק מתחיל. בלי ריביי ובלי מתנות. עד 4 שחקנים: הזוכה לוקח הכול · 5-6: 70/30 · 7+: 50/30/20. מטבעות משחק בלבד, בלי כסף אמיתי.</p>}
        <Opt label="מצב לימוד (לכל השחקנים)" value={!!cfg.learn} set={v => setCfg({ ...cfg, learn: v })} opts={[[true, 'פועל: מאמן עם שאלות, שיעורים ומשוב'], [false, 'כבוי']]} />
        <Opt label="זמן לכל תור" value={cfg.turnSec} set={v => setCfg({ ...cfg, turnSec: v })} opts={[[20, '20 שנ׳'], [30, '30 שנ׳'], [45, '45 שנ׳'], [60, 'דקה']]} />
  </>);

  /* ---------------- lobby: create or join ---------------- */
  if (!code && clubId) return (
    <ClubView id={clubId} busy={busy} settings={settingsForm} onBack={() => setClubId(null)}
      onEnter={(c, club) => void enter(c, club)} onOpenTable={club => (cfg.buyIn ?? 0) > (P.coins ?? 0) ? toast('אין לך מספיק מטבעות לדמי הכניסה') : void enter(null, club)} />
  );
  if (!code) return (
    <div className="screen">
      <div className="play-top" style={{ marginBottom: 12 }}>
        <button className="icon-btn" onClick={() => go('duel')} aria-label="חזרה">{I.back}</button>
        <div className="play-title"><b>מועדונים ושולחנות</b><span>טקסס הולדם עם החברים, ז׳יטונים בלבד</span></div>
      </div>
      <ClubList onOpen={id => { setClubInvite(''); setClubId(id); }} initialJoin={clubInvite} />
      {lastHost && <button className="glass list-btn" onClick={() => enter(lastHost)}><span>חזרה לשולחן האחרון ({lastHost})</span><span style={{ width: 20 }}>{I.back}</span></button>}
      <motion.div className="glass" style={{ padding: 18, borderRadius: 24, marginBottom: 14 }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h3 className="h-md" style={{ marginBottom: privOpen ? 12 : 6 }}>שולחן פרטי (אתה המנהל)</h3>
        {!privOpen ? <><p className="muted club-empty">שולחן חד-פעמי בלי מועדון: פותחים, שולחים קוד לחברים ומשחקים.</p>
          <button className="btn wide" onClick={() => setPrivOpen(true)}>הגדרות ופתיחת שולחן</button></> : <>
        {settingsForm}
        <button className="btn gold wide" disabled={busy || (cfg.buyIn ?? 0) > (P.coins ?? 0)} onClick={() => enter(null)}>{(cfg.buyIn ?? 0) > (P.coins ?? 0) ? 'אין לך מספיק מטבעות לדמי הכניסה' : 'פתח שולחן'}</button></>}
      </motion.div>
      <div className="glass" style={{ padding: 18, borderRadius: 24 }}>
        <h3 className="h-md">הצטרפות לשולחן</h3>
        <div className="field" style={{ marginTop: 12 }}>
          <label htmlFor="tcode">קוד שולחן (5 תווים)</label>
          <input id="tcode" className="input code-input" maxLength={5} value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="ABCDE" autoComplete="off" />
        </div>
        <button className="btn violet wide" disabled={joinCode.length !== 5 || busy} onClick={() => enter(joinCode)}>הצטרף</button>
      </div>
      <button className="btn wide" style={{ marginTop: 14 }} disabled={busy} onClick={train}>שולחן אימון מול בוטים</button>
      <p className="muted" style={{ fontSize: 12, textAlign: 'center' }}>אפשר לנסות את השולחן בלי להזמין חברים. הבוטים מיועדים לתרגול בסיסי.</p>
      <p className="muted" style={{ fontSize: 12, textAlign: 'center', marginTop: 14 }}>משחקים על ז׳יטונים וירטואליים בלבד. אין באפליקציה כסף אמיתי.</p>
    </div>
  );

  /* ---------------- connecting ---------------- */
  if (!V) return (
    <div className="screen">
      <div className="play-top"><button className="icon-btn" onClick={leave} aria-label="יציאה">{I.x}</button><div className="play-title"><b>שולחן {code}</b><span>מתחבר…</span></div></div>
      <div className="glass empty" style={{ marginTop: 30 }}>מקבל את מצב השולחן…</div>
    </div>
  );

  const started = V.handNo > 0;
  // the skill tonight's decisions went worst in, for a targeted drill in the app
  const weak = (() => {
    const m: Record<string, { n: number; good: number }> = {};
    for (const x of log) for (const k of x.skills) { const v = (m[k] ||= { n: 0, good: 0 }); v.n++; if (x.g !== 'b') v.good++; }
    return Object.entries(m).filter(([k, v]) => SKILLS[k] && v.n >= 2 && v.good / v.n < 0.85).map(([key, v]) => ({ key, ...v })).sort((a, b) => a.good / a.n - b.good / b.n)[0];
  })();
  // final order: chips, then who lasted longer; spectators of a buy-in table are not in it
  const standings = V.players.filter(p => !buyIn || p.paid).sort((a, b) => b.stack - a.stack || (b.bust ?? 1e9) - (a.bust ?? 1e9));
  const ready = buyIn ? V.players.filter(p => p.paid).length : V.players.length;
  const net$ = (p: PV) => p.stack + p.pending - p.buyIns * V.cfg.stack - p.gifts;

  /* ---------------- waiting room / final table ---------------- */
  if (!started || V.phase === 'over') return (
    <div className="screen">
      <div className="play-top" style={{ marginBottom: 12 }}>
        <button className="icon-btn" onClick={leave} aria-label="יציאה">{I.x}</button>
        <div className="play-title"><b>{V.phase === 'over' ? 'המשחק נגמר' : 'חדר המתנה'}</b><span>{V.players.length} שחקנים</span></div>
      </div>
      {V.phase !== 'over' && (
        <motion.div className="glass" style={{ padding: 18, textAlign: 'center', borderRadius: 26, marginBottom: 14 }} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}>
          <div className="eyebrow">קוד השולחן</div>
          <div className="room-code shine">{code}</div>
          <p className="muted" style={{ fontSize: 13 }}>{fmt(V.cfg.stack)} ז׳יטונים · בליינדים {BLINDS[0][0]}/{BLINDS[0][1]}{V.cfg.levelMin ? ` · עולים כל ${V.cfg.levelMin} דק׳` : ''} · {buyIn ? `דמי כניסה ${fmt(buyIn)} מטבעות` : `ריביי: ${V.cfg.rebuys < 0 ? 'בלי הגבלה' : V.cfg.rebuys || 'בלי'}`}</p>
          <div className="share-row">
            <a className="btn wa" href={sh.wa} target="_blank" rel="noreferrer">{I.wa} וואטסאפ</a>
            <button className="btn" onClick={async () => ((await sh.copy()) ? toast('הקישור הועתק') : toast(link))}>{I.copy} העתק קישור</button>
          </div>
        </motion.div>
      )}
      {V.phase !== 'over' && (
        <motion.div className="glass lobby-cfg" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h3 className="h-md">הגדרות המשחק</h3>
          <p className="muted" style={{ margin: '2px 0 10px', fontSize: 13 }}>{isHost ? 'כולם רואים את השינויים שלך בזמן אמת. שחקנים יכולים להציע, ואתה מאשר.' : 'המנהל בוחר, וכולם רואים בזמן אמת. הקש על אפשרות כדי להציע אותה למנהל.'}</p>
          {CFG_OPTS.filter(o => !(o.key === 'rebuys' && V.cfg.buyIn)).map(o => (
            <Opt key={o.key} label={o.label} value={V.cfg[o.key] ?? (o.key === 'buyIn' ? 0 : o.key === 'learn' ? false : undefined)} set={v => setOpt(o.key, v as number | boolean)} opts={o.opts} />
          ))}
          {isHost && (V.suggest?.length ?? 0) > 0 && <div className="lobby-sugg">
            <b>הצעות מהשחקנים</b>
            {V.suggest!.map(x => <div key={x.id + x.key} className="lobby-sugg-row"><span>💡 {x.nick}: {CFG_OPTS.find(o => o.key === x.key)?.label} ← {optText(x.key, x.val)}</span>
              <button className="btn gold" onClick={() => setOpt(x.key as keyof TCfg, x.val)}>אשר</button></div>)}
          </div>}
        </motion.div>
      )}
      {V.phase !== 'over' && buyIn > 0 && me && (
        <div className="glass" style={{ padding: 16, borderRadius: 22, marginBottom: 14, textAlign: 'center' }}>
          <h3 className="h-md" style={{ marginBottom: 4 }}>קופת פרסים: <span className="gold-text num">{fmt(buyIn * V.players.filter(p => p.paid).length)}</span> מטבעות</h3>
          <p className="muted" style={{ margin: '0 0 10px', fontSize: 13 }}>דמי כניסה {fmt(buyIn)} · יש לך {fmt(P.coins ?? 0)} · המטבעות יורדים כשהיד הראשונה מחולקת</p>
          {me.paid
            ? <><b style={{ color: 'var(--good)' }}>✓ אתה בפנים</b> <button className="btn" style={{ marginInlineStart: 10 }} onClick={() => doPay(false)}>בטל</button></>
            : <button className="btn gold wide" disabled={(P.coins ?? 0) < buyIn} onClick={() => doPay(true)}>{(P.coins ?? 0) < buyIn ? 'אין לך מספיק מטבעות' : `אני בפנים · ${fmt(buyIn)} מטבעות`}</button>}
        </div>
      )}
      {V.phase === 'over' && myPrize && <div className="glass" style={{ padding: 14, borderRadius: 22, marginBottom: 12, textAlign: 'center' }}><b className="gold-text">מקום {myPrize.place}: זכית ב-{fmt(myPrize.amount)} מטבעות 🪙</b></div>}
      {V.phase === 'over' && V.endReason && <div className="glass" style={{ padding: 12, borderRadius: 18, marginBottom: 12, textAlign: 'center', fontSize: 14 }}>{V.endReason}</div>}
      {V.phase === 'over' && <div style={{ textAlign: 'center' }}><div className="trophy">🏆</div><h1 className="h-xl" style={{ marginBottom: 14 }}>{standings[0]?.nick} ניצח!</h1></div>}
      {V.phase === 'over' && log.length > 0 && (
        <div className="glass" style={{ padding: 16, borderRadius: 22, marginBottom: 14 }}>
          <h3 className="h-md" style={{ marginBottom: 6 }}>הדוח שלך מהערב</h3>
          <p style={{ margin: '0 0 6px' }}><b className="num">{log.length}</b> החלטות · <b className="num">{Math.round(log.filter(x => x.g !== 'b').length / log.length * 100)}%</b> טובות · <span className="gold-text">+{earned} XP ומטבעות</span></p>
          {log.find(x => x.g === 'b') && <p className="muted" style={{ margin: 0, fontSize: 14 }}>הטעות שכדאי לזכור: {log.find(x => x.g === 'b')!.text}</p>}
          {weak && <div className="glass row" style={{ marginTop: 10, gridTemplateColumns: '1fr auto' }}>
            <div className="who"><b>הכי כדאי לתרגל: {SKILLS[weak.key]}</b><span>{weak.good} מתוך {weak.n} החלטות טובות הערב</span></div>
            <button className="btn gold" onClick={() => { leave(); go('play', { mode: 'drill', drill: weak.key }); }}>תרגל באפליקציה</button>
          </div>}
          <p className="muted" style={{ margin: '6px 0 0', fontSize: 12 }}>ההחלטות נבדקות רק אצלך. אף שחקן אחר לא רואה אותן.</p>
        </div>
      )}
      <div className="rows">
        {(V.phase === 'over' ? standings : V.players).map((p, k) => (
          <motion.div key={p.id} layout className={`glass row ${p.id === P.id ? 'me' : ''}`} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
            <span className={`rank ${V.phase === 'over' && k < 3 ? 'm' + (k + 1) : ''}`}>{k + 1}</span>
            <div className={`avatar sm ${k % 2 ? 'violet' : ''}`}>{p.nick.slice(0, 1)}</div>
            <div className="who"><b>{p.nick}{p.id === V.hostId ? ' · מנהל' : ''}{p.id === P.id ? ' (אתה)' : ''}</b>
              <span>{V.phase === 'over' && buyIn ? `מקום ${k + 1} · שילם ${fmt(buyIn)} מטבעות` : V.phase === 'over' ? `${p.buyIns} קניות${p.gifts ? ` · קיבל ${fmt(p.gifts)}` : ''} · מאזן ${net$(p) >= 0 ? '+' : ''}${fmt(net$(p))}` : p.away ? 'לא מחובר' : buyIn ? (p.paid ? 'בפנים ✓' : 'עוד לא נכנס') : 'מוכן'}</span></div>
            <span className="val num">{V.phase === 'over' && buyIn ? (() => { const z = prizes(V as unknown as TS).find(x => x.id === p.id); return z ? `+${fmt(z.amount)} 🪙` : '—'; })() : fmt(p.stack)}</span>
          </motion.div>
        ))}
      </div>
      <div className="modal-actions">
        {isHost && V.phase !== 'over' && <button className="btn gold wide" disabled={ready < 2} onClick={() => void send({ t: 'start' }).then(ok => ok && track(P, 'table_start', { players: V.players.length }))}>{ready < 2 ? (buyIn ? 'מחכים שלפחות 2 ייכנסו…' : 'מחכים לעוד שחקן…') : 'התחל משחק'}</button>}
        {!isHost && V.phase !== 'over' && <p className="muted" style={{ textAlign: 'center' }}>{mgr?.away ? 'המנהל לא מחובר כרגע. מחכים שיחזור ויתחיל…' : 'מחכים שהמנהל יתחיל…'}</p>}
        {V.phase === 'over' && <a className="btn wa wide" href={shareLinks(`סיימנו ערב פוקר ב-Poker IQ. ${standings[0]?.nick} לקח את הכול 🏆`, PUBLIC_URL).wa} target="_blank" rel="noreferrer">{I.wa} שתף תוצאות</a>}
        {V.phase === 'over' && <button className="btn wide" onClick={leave}>יציאה</button>}
      </div>
    </div>
  );

  /* ---------------- the table ---------------- */
  const N = V.players.length, hi = Math.max(0, V.players.findIndex(p => p.id === P.id));
  // Seats sit evenly around the table's oval, me at the bottom. Coordinates are in the room's canvas (portrait 940×1672, landscape 1672×941).
  const room = tall ? ROOM.tall : ROOM.wide;
  const C = tall ? { x: 470, y: 760, rx: 395, ry: 515 } : { x: 836, y: 448, rx: 610, ry: 330 };
  const HERO = tall ? { x: 470, y: 1250 } : { x: 836, y: 786 };
  const slotAt = (relative: number) => {
    if (relative === 0) return HERO;
    const a = (90 + relative * 360 / N) * Math.PI / 180;
    const y = C.y + C.ry * Math.sin(a);
    return { x: C.x + C.rx * Math.cos(a), y: tall ? y : Math.min(y, 640) };
  };
  const pos = (i: number) => { const q = slotAt((i - hi + N) % N); return { x: q.x / room.w * 100, y: q.y / room.h * 100 }; };
  // the dealer button: a little in from the seat, turned toward the next seat so it never sits on the bet
  const dealerAt = (i: number) => {
    const r = (i - hi + N) % N;
    if (r === 0) return { x: (HERO.x + (tall ? 140 : 132)) / room.w * 100, y: (HERO.y - (tall ? 76 : 70)) / room.h * 100 };
    const a = (90 + r * 360 / N - (tall ? 14 : 11)) * Math.PI / 180;
    return { x: (C.x + C.rx * .72 * Math.cos(a)) / room.w * 100, y: (C.y + C.ry * .72 * Math.sin(a)) / room.h * 100 };
  };
  // chips sit in a free spot next to each seat: beside a side seat (toward the middle), under a top seat, mine beside my cards
  const betAt = (i: number) => {
    const r = (i - hi + N) % N;
    let q: { x: number; y: number };
    if (r === 0) q = tall ? { x: 300, y: 1168 } : { x: 676, y: 694 };
    else {
      const s0 = slotAt(r), inward = s0.x < C.x ? 1 : -1, side = Math.abs(s0.x - C.x) > C.rx * .45;
      q = side ? { x: s0.x + inward * (tall ? 178 : 200), y: s0.y + (s0.y < C.y ? (tall ? 50 : 30) : (tall ? -6 : -40)) }
        : s0.y < C.y ? (tall ? { x: s0.x, y: s0.y + 248 } : { x: s0.x + (s0.x <= C.x ? 190 : -190), y: s0.y + 70 })
        : { x: s0.x + inward * 60, y: s0.y - 130 };
    }
    return { x: q.x / room.w * 100, y: q.y / room.h * 100 };
  };
  const potAt = tall ? { x: '50%', y: '37%' } : { x: '50%', y: '33%' };
  const turnP = V.players.find(p => p.id === V.turn);
  const heroHand = myCards ? (resolved && V.hands?.[P.id]?.name) || madeHand(myCards, V.board.filter((_, i) => !sd || i < (V.runFrom ?? 5) || tm.cardAt(i) <= tShow)).name : '';
  const lastActor = V.last ? V.players.findIndex(p => p.id === V.last!.id) : -1;
  const potNow = V.pot;
  // which learning card sits above my buttons: the lesson + question on my turn, a quick verdict right after I act, the hand review at the showdown
  const helpCard = !learn || helpOff ? null : myTurn && advice ? 'think' : sd && handLog.length ? 'review' : fb && now - fb.at < 4500 && fb.at > 0 ? 'fb' : null;
  const potShown = sd && !resolved ? V.potWon ?? 0 : V.pot;
  const wonBy = (id: string) => (sd ? V.winners.find(w => w.id === id)?.amount ?? 0 : 0);
  const clamp = (v: number) => Math.max(minTo, Math.min(maxTo, Math.round(v / V.sb) * V.sb || minTo));
  const presets: [string, number][] = [['Min', minTo], ['½ Pot', clamp(V.curBet + (potNow + toCall) / 2)], ['¾', clamp(V.curBet + (potNow + toCall) * 0.75)], ['Pot', clamp(V.curBet + potNow + toCall)], ['All-in', maxTo]];
  const mmss = `${String(Math.floor(lvLeft / 60000)).padStart(2, '0')}:${String(Math.floor(lvLeft / 1000) % 60).padStart(2, '0')}`;

  return (
    <RoomStage onLayout={setTall} label={practice ? 'שולחן אימון מול בוטים' : 'שולחן פוקר לחברים'}>{() => (<>
      <div className="lounge" aria-hidden="true" />
      <div className="pro-top">
        <button className="pro-round room-back" onClick={leave} aria-label="יציאה">{I.back}</button>
        <div className="room-title"><b>{tableClub || 'שולחן חברים'}</b><button onClick={() => practice ? toast('שולחן אימון — הבוטים אינם שחקנים אמיתיים') : sh.copy().then(ok => toast(ok ? 'ההזמנה הועתקה' : link))}>{practice ? 'אימון מול בוטים' : `קוד ${code} · העתק הזמנה`}{learn ? ' · מצב לימוד' : ''}</button></div>
        <div className="pro-pill room-blinds"><span>בליינדים <b className="num">{V.sb}/{V.bb}</b></span>{V.paused ? <em>הפסקה</em> : V.levelEnds ? <em className="num">{mmss}</em> : <em className="num">יד {V.handNo}</em>}</div>
      </div>

      <div className={`ptable ${helpCard === 'review' ? 'with-review' : ''}`}>
        <div className="rail"><div className="pfelt"><div className="pfelt-line" /><div className="pfelt-logo">POKER IQ</div></div></div>
        <div className="pboard">{V.board.map((c, i) => <MiniCard key={`${V.handNo}-${i}`} c={c} size={145} hl={hlOf(c)}
          delay={sd && i >= (V.runFrom ?? 5) ? Math.max(0, tm.cardAt(i) - tShow) : i < 3 ? i * 0.12 : 0} />)}</div>
        {!resolved && <motion.div className="ppot" key={V.handNo} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <Chips amount={potShown} unit={V.bb} size={38} /><span>קופה</span><b className="num">{fmt(potShown)}</b>
        </motion.div>}
        {lastActor >= 0 && V.phase === 'hand' && V.last && !['Check', 'Fold', 'צ׳ק', 'פולד'].includes(V.last.text) && (
          <motion.div key={`${V.handNo}-${V.pot}-${V.last.id}`} className="chip-flight"
            initial={{ left: `${pos(lastActor).x}%`, top: `${pos(lastActor).y}%`, opacity: 1, scale: .8 }}
            animate={{ left: potAt.x, top: potAt.y, opacity: [1, 1, 0], scale: 1 }} transition={{ duration: .65, ease: 'easeOut' }}>
            <Chips amount={Math.max(V.bb, V.players[lastActor]?.bet || V.bb)} unit={V.bb} size={33} />
          </motion.div>
        )}
        {resolved && V.winners.map(w => {
          const index = V.players.findIndex(p => p.id === w.id);
          const xy = pos(index);
          return <motion.div key={`${V.handNo}-${w.id}`} className="chip-flight"
            initial={{ left: potAt.x, top: potAt.y, opacity: 1, scale: 1.2 }}
            animate={{ left: `${xy.x}%`, top: `${xy.y}%`, opacity: [1, 1, 0], scale: .7 }}
            transition={{ delay: .5, duration: 1, ease: 'easeInOut' }}>
            <Chips amount={w.amount} unit={V.bb} size={40} />
          </motion.div>;
        })}
        {V.players.map((p, i) => {
          const xy = pos(i), isMe = p.id === P.id, turn = V.turn === p.id && V.phase === 'hand';
          const shown = V.shown[p.id], won = resolved && V.winners.find(w => w.id === p.id), sh = V.hands?.[p.id];
          const bub = bubbles[p.id], bp = betAt(i), dp = dealerAt(i);
          // the same face for the same player on every phone (by seat order), and the bots' faces match their names
          const avatar = AVATARS[i % AVATARS.length];
          return (
            <div key={p.id}>
              <div className={`pseat ${tall && xy.x > 50 ? 'flip' : ''} ${tall && !isMe && xy.y > 25 && xy.y < 55 ? 'tag-up' : ''} ${p.inHand && !p.folded ? '' : 'dim'} ${isMe ? 'me' : ''} ${turn ? 'turn' : ''} ${won ? 'won' : ''}`} style={{ left: `${xy.x}%`, top: `${xy.y}%` }}>
                {p.has && !shown && !isMe && <div className="pbacks"><i /><i /></div>}
                {shown && !isMe && <div className={`pshown ${resolved ? (won ? 'win' : 'lose') : ''}`}>{shown.map((c, k) => <MiniCard key={k} c={c} size={28} delay={k * 0.1} hl={hlOf(c)} />)}
                  {resolved && sh && <em className="phand">{sh.name}</em>}</div>}
                <div className="pavatar" style={{ '--h': `${(p.nick.charCodeAt(0) * 47) % 360}` } as React.CSSProperties}>
                  <img src={asset(`/table/${avatar}.webp`)} alt="" aria-hidden="true" />
                  {turn && <svg className="pring" viewBox="0 0 44 44"><circle cx="22" cy="22" r="20" pathLength="100" strokeDasharray={`${Math.min(100, (left / turnSecs(V.cfg)) * 100)} 100`} /></svg>}
                  {turn && <b className="psec num">{Math.ceil(left)}</b>}
                </div>
                <div className="pplate"><span className="pname">{isMe ? (myCards && me?.folded ? 'Fold' : heroHand || 'אני') : p.nick}{p.away ? ' · לא מחובר' : p.sitOut ? ' · בחוץ' : ''}</span>
                  <span className="pstack num">{p.out ? 'בחוץ' : p.allIn && p.inHand && !sd ? 'All-in' : fmt(sd && !resolved ? p.stack - wonBy(p.id) : p.stack)}</span></div>
                {V.last?.id === p.id && V.phase === 'hand' && <motion.span key={V.last.text + V.pot} className="psaid" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>{V.last.text}</motion.span>}
                <AnimatePresence>{bub && now - bub.k < 2500 && <motion.span key={bub.k} className="bubble" initial={{ scale: 0, y: 0 }} animate={{ scale: 1.2, y: -30 }} exit={{ opacity: 0 }}>{bub.e}</motion.span>}</AnimatePresence>
              </div>
              {p.bet > 0 && !sd && <motion.div className="pbet" initial={{ left: `${xy.x}%`, top: `${xy.y}%`, opacity: 0 }} animate={{ left: `${bp.x}%`, top: `${bp.y}%`, opacity: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 22 }}>
                <Chips amount={p.bet} unit={V.bb} size={40} /><b className="num">{fmt(p.bet)}</b></motion.div>}
              {i === V.btn && <div className="pdealer" style={{ left: `${dp.x}%`, top: `${dp.y}%` }}>D</div>}
            </div>
          );
        })}
        <AnimatePresence>
        {resolved && V.winners[0] && (() => {
          const nick = (id: string) => (id === P.id ? 'אתה' : V.players.find(p => p.id === id)?.nick ?? '');
          const losers = Object.keys(V.shown).filter(id => !V.winners.some(w => w.id === id)).sort((a, b) => (b === P.id ? 1 : 0) - (a === P.id ? 1 : 0));
          const split = V.winners.length > 1 && V.winners.every(w => w.name === V.winners[0].name);
          return (
          <motion.div key={V.handNo} className={`pwin ${V.winners.some(w => w.id === P.id) ? 'mine' : ''}`} initial={{ opacity: 0, scale: 0.85, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 220, damping: 18 }}>
            {split ? <b>הקופה מתחלקת · {V.winners.map(w => nick(w.id)).join(' ו')}</b>
              : V.winners.map(w => <b key={w.id}>{nick(w.id)} זוכה ב-<span className="num">{fmt(w.amount)}</span></b>)}
            {showdown ? <span className="pwhy">{split ? `לשניהם ${V.winners[0].name}` : `עם ${V.winners[0].name}`}{losers.length > 0 && ` · ${split ? 'מנצחים' : 'מנצח'} ${losers.slice(0, 2).map(id => `${id === P.id ? 'אותך' : `את ${nick(id)}`} (${V.hands?.[id]?.name ?? ''})`).join(', ')}${losers.length > 2 ? ` ועוד ${losers.length - 2}` : ''}`}</span>
              : <span className="pwhy">כל השאר עשו Fold, אז הקופה {V.winners[0].id === P.id ? 'שלך' : 'שלו'} בלי להראות קלפים</span>}
          </motion.div>); })()}
      </AnimatePresence>
        {myCards && <div className="phero"><PeekCards key={V.handNo} cards={myCards} folded={!!me?.folded} hl={hlOf} hand={heroHand} /></div>}
      </div>

      <div className={`pdock ${helpCard ? 'with-help' : ''}`}>
        {helpCard === 'think' && advice && (() => { const t = thinkText(advice); return (
          <motion.div key={spotKey} className="phelp" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} role="note" aria-label="המאמן">
            <b><Rich text={t.ask} /></b>
            {lessonAt === spotKey && <small>📘 מהשיעור "{t.from}": <Rich text={t.lesson} /></small>}
            {ansOpen && <span className="pans">{answerText(advice)}</span>}
            <div className="phelp-row">
              {lessonAt !== spotKey && <button className="pans-btn" onClick={() => setLessonAt(spotKey)}>📘 רמז</button>}
              {!ansOpen && <button className="pans-btn" onClick={() => setShownAns(spotKey)}>התשובה <small>(פחות XP)</small></button>}
            </div>
          </motion.div>); })()}
        {helpCard === 'fb' && fb && (
          <motion.div key={fb.at} className={`phelp fb ${fb.g}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} role="status" aria-label="משוב על ההחלטה">
            <b>{fb.g === 'g' ? '✓ החלטה טובה' : fb.g === 'c' ? '≈ על הגבול' : '✗ כדאי ללמוד מזה'}</b><span>{fb.text}</span>
          </motion.div>)}
        {helpCard === 'review' && (
          <motion.div className="phelp review" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} role="note" aria-label="סיכום היד שלך">
            <b>סיכום היד שלך</b>{handLog.slice(-2).map((x, k) => <span key={k} className={x.g}>{x.g === 'g' ? '✓' : x.g === 'c' ? '≈' : '✗'} {x.text}</span>)}
          </motion.div>)}
        {me?.sitOut && !me.out && <div className="psitout"><span>{me.sitOut === 'idle' ? 'דילגנו עליך פעמיים, אז אתה יושב בחוץ.' : 'היית מנותק, אז ישבת בחוץ.'}</span>
          <button className="pbtn go" onClick={backIn}>חזרתי, תחלק לי</button></div>}
        {!myCards && !me?.sitOut && <div className="pro-note">{buyIn && me && !me.paid ? 'אתה צופה: המשחק התחיל לפני שנכנסת' : me?.out ? 'יצאת מהמשחק' : me && me.stack === 0 ? 'נגמרו לך הז׳יטונים' : 'תצטרף ביד הבאה'}</div>}
        {me && canRebuy(V as unknown as TS, me as any) && <button className="pbtn go" onClick={doRebuy}>ריביי · {fmt(V.cfg.stack)}</button>}
        {myTurn && me ? (
          raiseTo == null ? (
            <div className="pactions">
              <button className="pbtn" onClick={() => doAct({ type: 'fold' })}>Fold</button>
              {toCall <= 0
                ? <button className="pbtn" onClick={() => doAct({ type: 'check' })}>Check</button>
                : <button className="pbtn" onClick={() => doAct({ type: 'call' })}>{toCall >= me.stack ? 'All-in' : 'Call'}<small className="num">{fmt(Math.min(toCall, me.stack))}</small></button>}
              {mayRaise(V, me) && <button className="pbtn go" onClick={() => setRaiseTo(minTo)}><span className="pbubble num">{fmt(minTo)}</span>{V.curBet ? 'Raise' : 'Bet'}</button>}
            </div>
          ) : (
            <motion.div className="praise" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
              <div className="praise-amt"><span>{raiseTo >= maxTo ? 'All-in' : V.curBet ? 'Raise to' : 'Bet'}</span><b className="num">{fmt(raiseTo)}</b></div>
              <Dial min={minTo} max={maxTo} unit={V.sb} value={raiseTo} onChange={setRaiseTo} />
              <div className="ppresets">{presets.map(([t, v]) => <button key={t} className={v === raiseTo ? 'on' : ''} onClick={() => setRaiseTo(v)}>{t}</button>)}</div>
              <div className="pactions two">
                <button className="pbtn" onClick={() => setRaiseTo(null)}>Cancel</button>
                <button className="pbtn go" onClick={() => doAct({ type: 'raise', to: raiseTo })}>Confirm</button>
              </div>
            </motion.div>
          )
        ) : (
          <div className="pwait">
            {canPre
              ? <div className="pactions pre-actions" role="group" aria-label="פעולה מראש">
                  <button className={`pbtn ${pre?.kind === 'cf' ? 'on' : ''}`} aria-pressed={pre?.kind === 'cf'} onClick={() => togglePre('cf')}>{toCall > 0 ? 'Fold' : 'Check/Fold'}</button>
                  <button className={`pbtn ${pre?.kind === 'call' ? 'on' : ''}`} aria-pressed={pre?.kind === 'call'} onClick={() => togglePre('call')}>{toCall > 0 ? <>Call<small className="num">{fmt(Math.min(toCall, me!.stack))}</small></> : 'Check'}</button>
                  <button className={`pbtn ${pre?.kind === 'any' ? 'on' : ''}`} aria-pressed={pre?.kind === 'any'} onClick={() => togglePre('any')}>Call any</button>
                </div>
              : <div className="pactions waiting-actions"><button className="pbtn" disabled>Fold</button><button className="pbtn" disabled>Check</button><button className="pbtn go" disabled>Raise</button></div>}
            <span className="pstatus">{V.phase === 'hand' && pendingAt === V.at ? 'שולח…' : pre ? 'הפעולה תתבצע כשיגיע התור שלך' : V.paused ? 'המנהל עצר את המשחק' : V.phase === 'show' ? 'היד הבאה מיד' : turnP ? `התור של ${turnP.nick}` : V.phase === 'lobby' && activeCount(V as unknown as TS) < 2 ? 'מחכים שעוד שחקן יחזור לשולחן…' : 'מחלקים קלפים'}</span>
          </div>
        )}
      </div>

      <div className="ptools">
              {<button className="pro-round" onClick={() => setMenu(true)} aria-label={isHost ? 'ניהול השולחן והגדרות' : 'הגדרות'}><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg></button>}
              {V.prev && <button className="pro-round prev-btn" onClick={() => setPrevOpen(true)} aria-label="היד הקודמת"><svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="M12 8v4l3 2" /></svg></button>}
              <button className="pro-round" onClick={() => setTray(t => !t)} aria-label="תגובות"><svg viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></svg></button>
              {tray && <div className="ptray">{EMOJIS.map(e => <button key={e} onClick={() => { emoji(e); setTray(false); }} aria-label={`שלח ${e}`}>{e}</button>)}</div>}
            </div>

      {/* the sheets open outside the scaled table, at the phone's own text size like the rest of the app */}
      {createPortal(<>
      {/* manager menu */}
      <AnimatePresence>
        {menu && (
          <>
            <motion.div className="scrim" onClick={() => setMenu(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            <motion.div className="sheet psheet" role="dialog" aria-modal="true" aria-label={isHost ? 'ניהול השולחן' : 'הגדרות'} onKeyDown={e => { if (e.key === 'Escape') setMenu(false); }} initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 260, damping: 30 }}>
              <div className="grab" />
              <button className="icon-btn" onClick={() => setMenu(false)} aria-label="סגור ניהול שולחן">{I.x}</button>
              <h3 className="h-md" style={{ marginBottom: 10 }}>הגדרות</h3>
              {me && !me.out && !practice && <button className="glass row ptoggle" onClick={() => { void send({ t: me.sitOut ? 'back' : 'sitout' }); setMenu(false); }}>
                <span className="who"><b>{me.sitOut ? 'חזרתי לשולחן' : 'הפסקה אישית'}</b><span>{me.sitOut ? 'תקבל קלפים מהיד הבאה' : 'לא תקבל קלפים מהיד הבאה, עד שתחזור'}</span></span>
              </button>}
              {learn && <button className="glass row ptoggle" role="switch" aria-checked={!helpOff} onClick={toggleHelp}>
                <span className="who"><b>המאמן</b><span>{helpOff ? 'כבוי' : 'פועל: בתור שלך שאלה ושיעור מהאפליקציה, ואחרי כל החלטה משוב'}</span></span>
                <span className={`switch ${helpOff ? '' : 'on'}`} aria-hidden="true"><i /></span>
              </button>}
              {log.length > 0 && <p className="muted" style={{ margin: '8px 2px 0', fontSize: 13 }}>הערב: {log.length} החלטות, {Math.round(log.filter(x => x.g !== 'b').length / log.length * 100)}% טובות · +{earned} XP ומטבעות</p>}
              {isHost && <>
              <h3 className="h-md" style={{ margin: '18px 0 10px' }}>ניהול השולחן</h3>
              <button className="pbtn" style={{ width: '100%', marginBottom: 10 }} onClick={() => void send({ t: 'learn' }).then(ok => ok && toast(learn ? 'מצב לימוד כובה' : 'מצב לימוד הופעל לכל השולחן'))}>{learn ? 'כבה מצב לימוד לכולם' : 'הפעל מצב לימוד לכולם'}</button>
              <button className="pbtn" style={{ width: '100%', marginBottom: 10 }} onClick={() => void send({ t: 'pause' })}>{V.paused ? 'המשך משחק' : 'הפסקה'}</button>
              {!buyIn && <div className="field"><label htmlFor="gamt">כמה ז׳יטונים לתת</label><input id="gamt" className="input" inputMode="numeric" value={giftAmt} onChange={e => setGiftAmt(e.target.value.replace(/\D/g, ''))} placeholder={String(V.cfg.stack)} /></div>}
              <div className="rows" style={{ marginBottom: 12 }}>
                {V.players.map(p => (
                  <div key={p.id} className="glass row" style={{ gridTemplateColumns: '1fr auto auto' }}>
                    <div className="who"><b>{p.nick}</b><span>{fmt(p.stack)}{p.pending ? ` (+${fmt(p.pending)} אחרי היד)` : ''} · {p.buyIns} קניות</span></div>
                    {!buyIn && <button className="pbtn go sm" onClick={() => void send({ t: 'gift', id: p.id, amount: Number(giftAmt) || V.cfg.stack }).then(ok => ok && toast(`${p.nick} קיבל ${fmt(Number(giftAmt) || V.cfg.stack)}`))}>תן</button>}
                    {p.id !== P.id && <button className="pbtn sm" disabled={V.phase === 'hand'} title={V.phase === 'hand' ? 'הוצאת שחקן אפשרית רק בין ידיים' : undefined} onClick={() => void send({ t: 'kick', id: p.id })}>{p.out ? 'החזר' : 'הוצא'}</button>}
                  </div>
                ))}
              </div>
              <button className="pbtn" style={{ width: '100%', color: 'var(--bad)' }} onClick={() => void send({ t: 'end' }).then(ok => ok && setMenu(false))}>סיים משחק והצג תוצאות</button>
              </>}
            </motion.div>
          </>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {prevOpen && V.prev && (<>
          <motion.div className="scrim" onClick={() => setPrevOpen(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.div className="sheet psheet" role="dialog" aria-modal="true" aria-label="היד הקודמת" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 260, damping: 30 }}>
            <div className="grab" />
            <button className="icon-btn" onClick={() => setPrevOpen(false)} aria-label="סגור">{I.x}</button>
            <h3 className="h-md" style={{ marginBottom: 8 }}>היד הקודמת · יד {V.prev.hand}</h3>
            {V.prev.board.length > 0 && <div className="prev-board">{V.prev.board.map((c, i) => <MiniCard key={i} c={c} size={52} />)}</div>}
            {V.prev.winners.map(w => <p key={w.nick} style={{ margin: '6px 0' }}><b className="gold-text">{w.nick}</b> זכה ב-<b className="num">{fmt(w.amount)}</b>{w.name ? ` עם ${w.name}` : ' (כולם עשו Fold)'}</p>)}
            {V.prev.shown.length > 0 && <div className="prev-shown">
              {V.prev.shown.map(x => <div key={x.nick} className="glass row" style={{ gridTemplateColumns: 'auto 1fr auto' }}>
                <span className="prev-cards">{x.cards.map((c, i) => <MiniCard key={i} c={c} size={34} />)}</span><b>{x.nick}</b><span className="muted" style={{ fontSize: 13 }}>{x.name}</span>
              </div>)}
            </div>}
          </motion.div>
        </>)}
      </AnimatePresence>
      </>, document.body)}
      <Burst fire={burst} colors={['#e9c46a', '#fff1c1', '#c9a227']} />
    </>)}</RoomStage>
  );
}
