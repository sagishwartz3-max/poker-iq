import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isRed, madeHand, RN, SUITS } from '../engine/cards';
import { act, BLINDS, canRebuy, DEFAULT_CFG, endHand, gift, mayRaise, newTable, noteTimeout, payIn, prizes, publicView, rebuy, seat, sitIn, activeCount, showTimes, startHand, timeoutAction, turnSecs, type PV, type TAction, type TCfg, type TS, type View } from '../engine/holdem';
import { answerText, gradeTable, reviewText, spotLesson, tableAdvice, thinkText, type TGrade } from '../engine/coach';
import { gain, SKILLS, TABLE_XP_DAY, today } from '../game/progress';
import { sfx } from '../game/sound';
import { closeRoom, createRoom, getRoom, PUBLIC_URL, track } from '../net/supabase';
import { TableNet, type Cmd, type TPeer } from '../net/table';
import { Burst } from '../ui/Burst';
import { Chips } from '../ui/Chips';
import { Dial } from '../ui/Dial';
import { PeekCards } from '../ui/PeekCards';
import { ROOM, RoomStage } from '../ui/RoomStage';
import { useApp } from '../ui/ctx';
import { Rich } from '../ui/Rich';
import { I } from '../ui/Icons';
import { shareLinks } from './Duel';
import { asset } from '../native';

const rnd = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
const saveKey = (code: string) => `pokeriq-table-${code}`;
const LAST_HOSTED = 'pokeriq-table-last';
const fmt = (n: number) => n.toLocaleString('he-IL');
const EMOJIS = ['👍', '😂', '😱', '🔥', '🤡', '👏'];

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

/** Table settings that can still change in the waiting room, before the first hand. */
const CFG_OPTS: { key: keyof TCfg; label: string; opts: [number | boolean, string][] }[] = [
  { key: 'stack', label: 'ז׳יטונים לכל שחקן', opts: [[1000, '1,000'], [2000, '2,000'], [5000, '5,000'], [10000, '10,000']] },
  { key: 'levelMin', label: 'הבליינדים עולים כל', opts: [[0, 'לא עולים'], [5, '5 דק׳'], [10, '10 דק׳'], [15, '15 דק׳'], [20, '20 דק׳']] },
  { key: 'rebuys', label: 'ריביי לכל שחקן', opts: [[0, 'בלי'], [1, '1'], [2, '2'], [3, '3'], [-1, 'בלי הגבלה']] },
  { key: 'buyIn', label: 'דמי כניסה במטבעות', opts: [[0, 'בלי'], [100, '100'], [250, '250'], [500, '500'], [1000, '1,000']] },
  { key: 'turnSec', label: 'זמן לכל תור', opts: [[20, '20 שנ׳'], [30, '30 שנ׳'], [45, '45 שנ׳'], [60, 'דקה']] },
  { key: 'learn', label: 'מצב לימוד', opts: [[true, 'פועל'], [false, 'כבוי']] }
];
const optText = (key: string, val: unknown) => CFG_OPTS.find(o => o.key === key)?.opts.find(([v]) => v === val)?.[1] ?? String(val);
/** Apply a waiting-room setting change on the host's state (stacks and entries follow it). */
function applyCfg(s: TS, key: keyof TCfg, val: number | boolean, who: string) {
  if (s.handNo > 0 || s.cfg[key] === val) return false;
  s.cfg = { ...s.cfg, [key]: val } as TCfg;
  if (key === 'buyIn' && val) s.cfg.rebuys = 0;
  if (key === 'stack') for (const p of s.players) p.stack = val as number;
  if (key === 'buyIn') for (const p of s.players) { p.paid = false; p.out = !!val; }
  s.suggest = (s.suggest || []).filter(x => x.key !== key);
  s.note = { text: `${who}: ${CFG_OPTS.find(o => o.key === key)?.label} ← ${optText(key, val)}`, at: Date.now() };
  return true;
}
const AWAY_MS = 15000, SIT_OUT_MS = 20000, IDLE_END_MS = 10 * 60000;

export function Friends({ initialCode, onPlaying }: { initialCode?: string; onPlaying: (b: boolean) => void }) {
  const { P, toast, go, update, sync } = useApp();
  const [code, setCode] = useState('');
  const [joinCode, setJoinCode] = useState(initialCode || '');
  const [isHost, setIsHost] = useState(false);
  const [cfg, setCfg] = useState<TCfg>({ ...DEFAULT_CFG, rebuys: 0, learn: true });
  const [V, setV] = useState<View | null>(null);
  const [skew, setSkew] = useState(0); // host clock minus ours
  const [peers, setPeers] = useState<TPeer[]>([]);
  const [status, setStatus] = useState('');
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
  const [fb, setFb] = useState<{ g: TGrade; text: string; at: number } | null>(null);
  const [earned, setEarned] = useState(0);
  const [tall, setTall] = useState(() => typeof window !== 'undefined' && innerHeight > innerWidth * 1.15);
  const [giftAmt, setGiftAmt] = useState('');
  const [now, setNow] = useState(Date.now());
  const [bubbles, setBubbles] = useState<Record<string, { e: string; k: number }>>({});
  const [burst, setBurst] = useState(0);
  const net = useRef<TableNet | null>(null);
  const S = useRef<TS | null>(null);
  const lastBeat = useRef(0);
  const botDue = useRef(0);
  // host-side liveness: last heartbeat from each player, when they went away, and the last time anyone else was here
  const beats = useRef(new Map<string, { at: number; vis: boolean }>());
  const awaySince = useRef(new Map<string, number>());
  const lastOthers = useRef(Date.now());
  const grace = useRef(0);
  const closed = useRef('');
  const lastHost = useMemo(() => { try { return localStorage.getItem(LAST_HOSTED) || ''; } catch { return ''; } }, []);

  useEffect(() => { onPlaying(!!code); }, [code, onPlaying]);
  useEffect(() => () => { net.current?.leave(); onPlaying(false); }, [onPlaying]);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(id); }, []);

  /* ---------------- host: owns the game state ---------------- */
  const commit = useCallback(() => {
    const s = S.current; if (!s) return;
    if (s.code !== 'TRAIN') try { localStorage.setItem(saveKey(s.code), JSON.stringify(s)); } catch { /* storage off */ }
    const v = publicView(s, Date.now());
    setV(v); setSkew(0);
    const me = s.players.find(p => p.id === P.id);
    if (me?.cards) setMine({ hand: s.handNo, cards: me.cards });
    net.current?.sendState(v); lastBeat.current = Date.now();
  }, [P.id]);
  const dealOut = useCallback(() => {
    const s = S.current!;
    for (const p of s.players) if (p.cards && p.id !== P.id) net.current?.sendCards(p.id, s.handNo, p.cards);
  }, [P.id]);
  const hostCmd = useCallback((from: string, c: Cmd) => {
    const s = S.current; if (!s) return;
    if (c.t === 'hello') { net.current?.sendState(publicView(s, Date.now())); const p = s.players.find(x => x.id === from); if (p?.cards && s.phase !== 'lobby') net.current?.sendCards(from, s.handNo, p.cards); return; }
    const now = Date.now();
    beats.current.set(from, { at: now, vis: c.t === 'beat' ? c.vis : true });
    if (c.t === 'beat') { const p = s.players.find(x => x.id === from); if (c.vis && p?.sitOut === 'away' && sitIn(s, from)) commit(); return; }
    if (c.t === 'back' && sitIn(s, from)) commit();
    if (c.t === 'suggest' && s.handNo === 0 && CFG_OPTS.some(o => o.key === c.key)) {
      const nick = s.players.find(x => x.id === from)?.nick ?? 'שחקן';
      s.suggest = [{ id: from, nick, key: c.key, val: c.val, at: now }, ...(s.suggest || []).filter(x => !(x.id === from && x.key === c.key))].slice(0, 6);
      commit();
    }
    if (c.t === 'act' && c.hand === s.handNo && !s.paused && act(s, from, c.a, now)) { const p = s.players.find(x => x.id === from); if (p) p.missed = 0; commit(); }
    if (c.t === 'rebuy' && rebuy(s, from)) commit();
    if ((c.t === 'pay' || c.t === 'unpay') && payIn(s, from, c.t === 'pay')) commit();
  }, [commit]);

  // the host's game loop
  useEffect(() => {
    if (!isHost || !code) return;
    const id = setInterval(() => {
      const s = S.current, n = net.current; if (!s || (!n && !practice)) return;
      const t = Date.now();
      let changed = false;
      if (n) {
        for (const peer of n.peers) if (!s.players.some(p => p.id === peer.id) && seat(s, peer.id, peer.nick)) changed = true;
        for (const p of s.players) {
          if (p.id === P.id) continue;
          // connected = in the channel AND (no heartbeat yet, or a recent heartbeat with the screen on)
          const b = beats.current.get(p.id), present = n.peers.some(x => x.id === p.id);
          const away = !present || (!!b && (!b.vis || t - b.at > AWAY_MS));
          if (p.away !== away) { p.away = away; changed = true; if (away) awaySince.current.set(p.id, t); }
          if (away && !p.sitOut && p.stack > 0 && !p.out && t - (awaySince.current.get(p.id) ?? t) > SIT_OUT_MS) { p.sitOut = 'away'; changed = true; }
          if (!away && p.sitOut === 'away') { sitIn(s, p.id); changed = true; }
          if (!away && !p.out) lastOthers.current = t;
        }
        // nobody else has been here for 10 minutes: end the game and close the room
        if (s.handNo > 0 && s.phase !== 'over' && t > grace.current && t - lastOthers.current > IDLE_END_MS) {
          s.phase = 'over'; s.turn = null; s.endReason = 'המשחק נסגר אוטומטית: אף שחקן לא היה מחובר 10 דקות';
          changed = true;
        }
      }
      if (!s.paused) {
        if (practice && s.phase === 'hand' && s.turn && s.turn !== P.id && t > botDue.current) {
          const bot = s.players.find(p => p.id === s.turn)!;
          const call = Math.max(0, s.curBet - bot.bet), roll = rnd();
          // practice bots play their cards: weak hands give up against big bets, strong ones raise more often
          const str = bot.cards ? madeHand(bot.cards, s.board).strength : 1;
          const big = call > Math.max(s.bb * 6, (bot.stack + bot.bet) * 0.25);
          const action: TAction = mayRaise(s, bot) && (str >= 3 ? roll > .55 : roll > .9) ? { type: 'raise', to: s.curBet + s.minRaise }
            : call && (big ? str < 3 && roll < .85 : str === 0 ? roll < .4 : roll < .1) ? { type: 'fold' } : call ? { type: 'call' } : { type: 'check' };
          act(s, bot.id, action, t); botDue.current = t + 1600; changed = true;
        } else if (s.phase === 'hand' && t > s.deadline && s.turn) { const who = s.turn; if (!practice) noteTimeout(s, who); act(s, who, timeoutAction(s), t); changed = true; }
        else if (s.phase === 'show' && t > s.nextAt) { endHand(s); if ((s.phase as string) !== 'over' && startHand(s, rnd, t)) dealOut(); changed = true; }
        else if (s.phase === 'lobby' && s.handNo > 0 && startHand(s, rnd, t)) { dealOut(); changed = true; }
      }
      if (changed) commit(); else if (n && t - lastBeat.current > 4000) { n.sendState(publicView(s, t)); lastBeat.current = t; }
    }, 400);
    return () => clearInterval(id);
  }, [isHost, code, commit, dealOut, P.id, practice]);

  /* ---------------- joining ---------------- */
  const [busy, setBusy] = useState(false);
  const enter = async (codeIn: string | null) => {
    if (busy) return;
    if (!crypto?.subtle) { toast('הדפדפן הזה לא תומך בהצפנה שהשולחן צריך'); return; }
    setBusy(true);
    let rm;
    try { rm = codeIn ? await getRoom(codeIn, 'table') : await createRoom(P, 'table'); }
    catch { setBusy(false); toast('אין חיבור לשרת. בדוק שיש אינטרנט ונסה שוב.'); return; }
    if (!rm) { setBusy(false); toast('אין שולחן עם הקוד הזה. בדוק את הקוד או בקש קישור חדש.'); return; }
    const c = rm.code, host = rm.hostId === P.id;
    net.current?.leave();
    S.current = null;
    if (host) {
      try { const saved = JSON.parse(localStorage.getItem(saveKey(c)) || 'null') as TS | null; if (saved && saved.hostId === P.id) { S.current = saved; if (saved.phase === 'hand') saved.deadline = Date.now() + turnSecs(saved.cfg) * 1000; } } catch { /* no save */ }
      if (!S.current) { S.current = newTable(c, P.id, cfg); seat(S.current, P.id, P.nick || 'שחקן'); }
      try { localStorage.setItem(LAST_HOSTED, c); } catch { /* storage off */ }
    }
    setPractice(false); setIsHost(host); setCode(c); setV(null); setMine(null); setPeers([]);
    setLog([]); setEarned(0); setFb(null);
    const n = new TableNet(c, rm.channel, { id: P.id, nick: P.nick || 'שחקן' }, host, {
      onPeers: setPeers, onStatus: setStatus,
      onState: v => { setV(v); setSkew(v.at - Date.now()); },
      onCards: (hand, cards) => setMine({ hand, cards }),
      onCmd: hostCmd,
      onEmoji: (from, e) => setBubbles(b => ({ ...b, [from]: { e, k: Date.now() } }))
    });
    net.current = n;
    try {
      await n.join();
      if (host) commit();
      track(P, 'table_enter', { host });
    } catch {
      n.leave(); net.current = null; setCode('');
      toast('החיבור לשולחן נכשל. נסה שוב.');
    } finally { setBusy(false); }
  };
  useEffect(() => { if (initialCode && initialCode.length === 5) enter(initialCode.toUpperCase()); /* eslint-disable-next-line */ }, []);

  // players: say hello until the host answers with the table state
  const hostHere = peers.some(p => p.host);
  useEffect(() => {
    if (isHost || !code || !hostHere) return;
    net.current?.sendCmd({ t: 'hello' });
    if (V) return;
    const id = setInterval(() => net.current?.sendCmd({ t: 'hello' }), 2000);
    return () => clearInterval(id);
  }, [isHost, code, hostHere, !!V]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------------- derived view ---------------- */
  const me = V?.players.find(p => p.id === P.id);
  const myTurn = !!V && V.phase === 'hand' && V.turn === P.id && !V.paused;
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

  // heartbeat: every 5 s while the screen is on; leave presence when the phone goes to the background
  useEffect(() => {
    if (!code || practice) return;
    const beat = () => { if (!isHost) void net.current?.sendCmd({ t: 'beat', vis: !document.hidden }); };
    const onVis = () => {
      const vis = !document.hidden;
      beat(); void net.current?.setVisible(vis);
      if (vis) { grace.current = Date.now() + 12000; if (!isHost) void net.current?.sendCmd({ t: 'hello' }); }
    };
    beat();
    const id = setInterval(beat, 5000);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onVis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pagehide', onVis); };
  }, [code, isHost, practice]);

  // a finished table is closed on the server, so its code cannot be joined again
  useEffect(() => {
    if (!isHost || practice || V?.phase !== 'over' || closed.current === code) return;
    closed.current = code;
    closeRoom(P, code).catch(() => {});
    try { if (localStorage.getItem(LAST_HOSTED) === code) localStorage.removeItem(LAST_HOSTED); localStorage.removeItem(saveKey(code)); } catch { /* storage off */ }
  }, [V?.phase, isHost, practice, code]); // eslint-disable-line react-hooks/exhaustive-deps

  // tell everyone who joined, and what the manager changed in the waiting room
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!V) return;
    const ids = V.players.map(p => p.id);
    if (seen.current) for (const p of V.players) if (!seen.current.has(p.id) && p.id !== P.id) toast(V.handNo > 0 ? `${p.nick} הצטרף ויקבל קלפים ביד הבאה` : `${p.nick} הצטרף לשולחן`);
    seen.current = new Set(ids);
  }, [V?.players.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (V?.note && !isHost && Date.now() + skew - V.note.at < 8000) toast(V.note.text); }, [V?.note?.at]); // eslint-disable-line react-hooks/exhaustive-deps
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
    if (isHost) { const s = S.current!; if (act(s, P.id, a, Date.now())) commit(); }
    else net.current?.sendCmd({ t: 'act', hand: V!.handNo, a });
  };
  const buyIn = V?.cfg.buyIn ?? 0;
  const doPay = (on: boolean) => {
    if (on && (P.coins ?? 0) < buyIn) { toast('אין לך מספיק מטבעות לדמי הכניסה'); return; }
    if (isHost) { if (payIn(S.current!, P.id, on)) commit(); } else net.current?.sendCmd({ t: on ? 'pay' : 'unpay' });
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
  const backIn = () => { if (isHost) { if (sitIn(S.current!, P.id)) commit(); } else void net.current?.sendCmd({ t: 'back' }); };
  const setOpt = (key: keyof TCfg, val: number | boolean) => {
    if (isHost) { if (applyCfg(S.current!, key, val, 'המנהל')) { commit(); sfx.tap(); } }
    else { void net.current?.sendCmd({ t: 'suggest', key, val }); toast(`ההצעה נשלחה למנהל: ${optText(key, val)}`); }
  };
  const doRebuy = () => { if (isHost) { if (rebuy(S.current!, P.id)) commit(); } else net.current?.sendCmd({ t: 'rebuy' }); };
  const emoji = (e: string) => { net.current?.sendCmd({ t: 'emoji', e }); setBubbles(b => ({ ...b, [P.id]: { e, k: Date.now() } })); };
  const leave = () => { net.current?.leave(); net.current = null; S.current = null; setCode(''); setV(null); setMenu(false); setPractice(false); };
  const train = () => {
    const s = newTable('TRAIN', P.id, { ...cfg, buyIn: 0 });
    seat(s, P.id, P.nick || 'אני');
    ['נועם · בוט', 'מיה · בוט', 'אורי · בוט', 'דניאל · בוט', 'עומר · בוט'].forEach((nick, i) => seat(s, `bot-${i}`, nick));
    S.current = s; setPractice(true); setIsHost(true); setCode('TRAIN'); setPeers([]); setLog([]); setEarned(0); setFb(null);
    startHand(s, rnd, Date.now()); botDue.current = Date.now() + 1600; commit();
  };

  const link = `${PUBLIC_URL}?table=${code}`;
  const sh = shareLinks(`🃏 ${P.nick || 'חבר'} פתח שולחן פוקר ב-Poker IQ. בוא לשחק! קוד: ${code}`, link);

  /* ---------------- lobby: create or join ---------------- */
  if (!code) return (
    <div className="screen">
      <div className="play-top" style={{ marginBottom: 12 }}>
        <button className="icon-btn" onClick={() => go('duel')} aria-label="חזרה">{I.back}</button>
        <div className="play-title"><b>שולחן פוקר לחברים</b><span>טקסס הולדם, ז׳יטונים בלבד</span></div>
      </div>
      {lastHost && <button className="glass list-btn" onClick={() => enter(lastHost)}><span>חזרה לשולחן שפתחתי ({lastHost})</span><span style={{ width: 20 }}>{I.back}</span></button>}
      <motion.div className="glass" style={{ padding: 18, borderRadius: 24, marginBottom: 14 }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h3 className="h-md" style={{ marginBottom: 12 }}>פתח שולחן (אתה המנהל)</h3>
        <Opt label="מצב משחק" value={gameMode} set={mode => { setGameMode(mode); setCfg(c => ({ ...c, levelMin: mode === 'טורבו' ? 5 : mode === 'טורניר' ? 10 : 0, rebuys: mode === 'טורניר' || c.buyIn ? 0 : 2, turnSec: mode === 'טורבו' ? 20 : 30 })); }} opts={[['רגיל', 'רגיל'], ['טורבו', 'טורבו'], ['טורניר', 'טורניר']]} />
        <Opt label="ז׳יטונים לכל שחקן" value={cfg.stack} set={v => setCfg({ ...cfg, stack: v })} opts={[[1000, '1,000'], [2000, '2,000'], [5000, '5,000'], [10000, '10,000']]} />
        <Opt label="הבליינדים עולים כל" value={cfg.levelMin} set={v => setCfg({ ...cfg, levelMin: v })} opts={[[0, 'לא עולים'], [5, '5 דק׳'], [10, '10 דק׳'], [15, '15 דק׳'], [20, '20 דק׳']]} />
        {!cfg.buyIn && <Opt label="כמה ריביי מותר לכל שחקן" value={cfg.rebuys} set={v => setCfg({ ...cfg, rebuys: v })} opts={[[0, 'בלי'], [1, '1'], [2, '2'], [3, '3'], [-1, 'בלי הגבלה']]} />}
        <Opt label="דמי כניסה במטבעות (הזוכים לוקחים את הקופה)" value={cfg.buyIn ?? 0} set={v => setCfg(c => ({ ...c, buyIn: v, rebuys: v ? 0 : c.rebuys }))} opts={[[0, 'בלי'], [100, '100'], [250, '250'], [500, '500'], [1000, '1,000']]} />
        {!!cfg.buyIn && <p className="muted" style={{ fontSize: 12, margin: '-6px 0 10px' }}>כל שחקן משלם {fmt(cfg.buyIn)} מטבעות מהארנק כשהמשחק מתחיל. בלי ריביי ובלי מתנות. עד 4 שחקנים: הזוכה לוקח הכול · 5-6: 70/30 · 7+: 50/30/20. מטבעות משחק בלבד, בלי כסף אמיתי.</p>}
        <Opt label="מצב לימוד (לכל השחקנים)" value={!!cfg.learn} set={v => setCfg({ ...cfg, learn: v })} opts={[[true, 'פועל: מאמן עם שאלות, שיעורים ומשוב'], [false, 'כבוי']]} />
        <Opt label="זמן לכל תור" value={cfg.turnSec} set={v => setCfg({ ...cfg, turnSec: v })} opts={[[20, '20 שנ׳'], [30, '30 שנ׳'], [45, '45 שנ׳'], [60, 'דקה']]} />
        <button className="btn gold wide" disabled={busy || (cfg.buyIn ?? 0) > (P.coins ?? 0)} onClick={() => enter(null)}>{(cfg.buyIn ?? 0) > (P.coins ?? 0) ? 'אין לך מספיק מטבעות לדמי הכניסה' : 'פתח שולחן'}</button>
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
      <div className="play-top"><button className="icon-btn" onClick={leave} aria-label="יציאה">{I.x}</button><div className="play-title"><b>שולחן {code}</b><span>{status === 'SUBSCRIBED' ? 'מחובר' : 'מתחבר…'}</span></div></div>
      <div className="glass empty" style={{ marginTop: 30 }}>{hostHere ? 'מקבל את מצב השולחן…' : 'מחכים למנהל השולחן. אם הקוד שגוי, חזור ונסה שוב.'}</div>
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
        {isHost && V.phase !== 'over' && <button className="btn gold wide" disabled={ready < 2} onClick={() => { const s = S.current!; if (startHand(s, rnd, Date.now())) { dealOut(); commit(); track(P, 'table_start', { players: s.players.length }); } }}>{ready < 2 ? (buyIn ? 'מחכים שלפחות 2 ייכנסו…' : 'מחכים לעוד שחקן…') : 'התחל משחק'}</button>}
        {!isHost && V.phase !== 'over' && <p className="muted" style={{ textAlign: 'center' }}>{hostHere ? 'מחכים שהמנהל יתחיל…' : 'המנהל התנתק. מחכים שיחזור…'}</p>}
        {V.phase === 'over' && <a className="btn wa wide" href={shareLinks(`סיימנו ערב פוקר ב-Poker IQ. ${standings[0]?.nick} לקח את הכול 🏆`, PUBLIC_URL).wa} target="_blank" rel="noreferrer">{I.wa} שתף תוצאות</a>}
        {V.phase === 'over' && <button className="btn wide" onClick={leave}>יציאה</button>}
      </div>
    </div>
  );

  /* ---------------- the table ---------------- */
  const N = V.players.length, hi = Math.max(0, V.players.findIndex(p => p.id === P.id));
  // Seat centers are authored in the camera plane of each reference image (landscape 1672×941, portrait 940×1672).
  const room = tall ? ROOM.tall : ROOM.wide;
  const seats = tall
    ? (N <= 6
      ? [[383, 1222], [137, 602], [193, 362], [745, 362], [793, 602], [780, 840]]
      : [[383, 1222], [160, 840], [137, 602], [193, 362], [365, 290], [575, 290], [745, 362], [793, 602], [780, 840]])
    : (N <= 6
      ? [[610, 815], [210, 420], [410, 230], [1215, 230], [1455, 420], [1325, 595]]
      : [[610, 815], [200, 590], [180, 425], [300, 260], [550, 220], [1110, 220], [1390, 260], [1480, 425], [1390, 590]]);
  const pos = (i: number) => {
    const relative = (i - hi + N) % N;
    const slot = N === 2 && relative === 1 ? seats[tall ? 3 : 2] : seats[relative];
    return { x: slot[0] / room.w * 100, y: slot[1] / room.h * 100 };
  };
  const potAt = tall ? { x: '50%', y: '50%' } : { x: '49%', y: '59%' };
  const mid = (p: { x: number; y: number }, t: number) => ({ x: p.x + (50 - p.x) * t, y: p.y + (54 - p.y) * t });
  const turnP = V.players.find(p => p.id === V.turn);
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
      <img className="room-dealer" src={asset('/table/dealer.webp')} alt="" aria-hidden="true" />
      <div className="pro-top">
        <button className="pro-round room-back" onClick={leave} aria-label="יציאה">{I.back}</button>
        <div className="room-title"><b>שולחן חברים</b><button onClick={() => practice ? toast('שולחן אימון — הבוטים אינם שחקנים אמיתיים') : sh.copy().then(ok => toast(ok ? 'ההזמנה הועתקה' : link))}>{practice ? 'אימון מול בוטים' : `קוד ${code} · העתק הזמנה`}{learn ? ' · מצב לימוד' : ''}</button></div>
        <div className="pro-pill room-blinds"><span>בליינדים <b className="num">{V.sb}/{V.bb}</b></span>{V.paused ? <em>הפסקה</em> : V.levelEnds ? <em className="num">{mmss}</em> : <em className="num">יד {V.handNo}</em>}</div>
        <div className="room-wallet"><span className="wallet-coins" aria-hidden="true"><i /><i /><i /></span><div><b className="num">{fmt(P.coins ?? 0)}</b><small>המטבעות שלי</small></div></div>
      </div>
      {!hostHere && !isHost && <div className="pro-note">המנהל התנתק. המשחק ימשיך כשיחזור.</div>}

      <div className="ptable">
        <div className="rail"><div className="pfelt"><div className="pfelt-line" /><div className="pfelt-logo">POKER IQ</div></div></div>
        <div className="pboard">{V.board.map((c, i) => <MiniCard key={`${V.handNo}-${i}`} c={c} size={145} hl={hlOf(c)}
          delay={sd && i >= (V.runFrom ?? 5) ? Math.max(0, tm.cardAt(i) - tShow) : i < 3 ? i * 0.12 : 0} />)}</div>
        {!resolved && <motion.div className="ppot" key={V.handNo} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <Chips amount={potShown} unit={V.bb} size={38} /><span>קופה</span><b className="num">{fmt(potShown)}</b>
        </motion.div>}
        <div className="room-center-chips"><Chips amount={potShown} unit={V.bb} size={50} /></div>
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
          const bub = bubbles[p.id], bp = tall ? { x: xy.x + (xy.x < 50 ? 4 : -4), y: xy.y + (isMe ? -9 : 5.6) } : { x: xy.x + (xy.x < 50 ? 1 : -1), y: xy.y + (isMe ? -12 : 10) }, dp = mid(xy, 0.12);
          const relative = (i - hi + N) % N;
          const avatar = ['10_avatar_hero', '07_avatar_left', '05_avatar_top_left', '06_avatar_top_right', '08_avatar_right', '09_avatar_lower_right'][relative % 6];
          return (
            <div key={p.id}>
              <div className={`pseat ${tall && xy.x > 50 ? 'flip' : ''} ${tall && !isMe ? (xy.y > 44 || xy.y < 19 ? 'sd-down' : xy.y < 25 ? 'sd-side' : '') : ''} ${p.inHand && !p.folded ? '' : 'dim'} ${isMe ? 'me' : ''} ${turn ? 'turn' : ''} ${won ? 'won' : ''}`} style={{ left: `${xy.x}%`, top: `${xy.y}%` }}>
                {p.has && !shown && !isMe && <div className="pbacks"><i /><i /></div>}
                {shown && !isMe && <div className={`pshown ${resolved ? (won ? 'win' : 'lose') : ''}`}>{shown.map((c, k) => <MiniCard key={k} c={c} size={28} delay={k * 0.1} hl={hlOf(c)} />)}
                  {resolved && sh && <em className="phand">{sh.name}</em>}</div>}
                <div className="pavatar" style={{ '--h': `${(p.nick.charCodeAt(0) * 47) % 360}` } as React.CSSProperties}>
                  <img src={asset(`/table/${avatar}.webp`)} alt="" aria-hidden="true" />
                  {turn && <svg className="pring" viewBox="0 0 44 44"><circle cx="22" cy="22" r="20" pathLength="100" strokeDasharray={`${Math.min(100, (left / turnSecs(V.cfg)) * 100)} 100`} /></svg>}
                  {turn && <b className="psec num">{Math.ceil(left)}</b>}
                </div>
                <div className="pplate"><span className="pname">{isMe ? 'אני' : p.nick}{p.away ? ' · לא מחובר' : p.sitOut ? ' · בחוץ' : ''}</span>
                  <span className="pstack num">{p.out ? 'בחוץ' : p.allIn && p.inHand && !sd ? 'All-in' : fmt(sd && !resolved ? p.stack - wonBy(p.id) : p.stack)}</span></div>
                {V.last?.id === p.id && V.phase === 'hand' && <motion.span key={V.last.text + V.pot} className="psaid" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>{V.last.text}</motion.span>}
                <AnimatePresence>{bub && now - bub.k < 2500 && <motion.span key={bub.k} className="bubble" initial={{ scale: 0, y: 0 }} animate={{ scale: 1.2, y: -30 }} exit={{ opacity: 0 }}>{bub.e}</motion.span>}</AnimatePresence>
              </div>
              {p.bet > 0 && !sd && <motion.div className="pbet" initial={{ left: `${xy.x}%`, top: `${xy.y}%`, opacity: 0 }} animate={{ left: `${bp.x}%`, top: `${bp.y}%`, opacity: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 22 }}>
                <Chips amount={p.bet} unit={V.bb} size={33} /><b className="num">{fmt(p.bet)}</b></motion.div>}
              {i === V.btn && <div className="pdealer" style={{ left: `${dp.x + (xy.x < 50 ? 7 : -7)}%`, top: `${dp.y}%` }}>D</div>}
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
        {myCards && <div className="phero"><PeekCards key={V.handNo} cards={myCards} folded={!!me?.folded} hl={hlOf} hand={(resolved && V.hands?.[P.id]?.name) || madeHand(myCards, V.board.filter((_, i) => !sd || i < (V.runFrom ?? 5) || tm.cardAt(i) <= tShow)).name} /></div>}
      </div>

      <div className={`pdock ${helpCard ? 'with-help' : ''}`}>
        {helpCard === 'think' && advice && (() => { const t = thinkText(advice); return (
          <motion.div key={spotKey} className="phelp" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} role="note" aria-label="המאמן">
            <small>📘 מהשיעור "{t.from}": <Rich text={t.lesson} /></small>
            <b><Rich text={t.ask} /></b>
            {ansOpen ? <span className="pans">{answerText(advice)}</span>
              : <button className="pans-btn" onClick={() => setShownAns(spotKey)}>תראה לי את התשובה <small>(פחות XP)</small></button>}
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
            <div className="pactions waiting-actions"><button className="pbtn" disabled>Fold</button><button className="pbtn" disabled>Check</button><button className="pbtn go" disabled>Raise</button></div><span className="pstatus">{V.paused ? 'המנהל עצר את המשחק' : V.phase === 'show' ? 'היד הבאה מיד' : turnP ? `התור של ${turnP.nick}` : V.phase === 'lobby' && activeCount(V as unknown as TS) < 2 ? 'מחכים שעוד שחקן יחזור לשולחן…' : 'מחלקים קלפים'}</span>
          </div>
        )}
      </div>

      <div className="ptools">
              {<button className="pro-round" onClick={() => setMenu(true)} aria-label={isHost ? 'ניהול השולחן והגדרות' : 'הגדרות'}><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg></button>}
              <button className="pro-round" onClick={() => setTray(t => !t)} aria-label="תגובות"><svg viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></svg></button>
              {tray && <div className="ptray">{EMOJIS.map(e => <button key={e} onClick={() => { emoji(e); setTray(false); }} aria-label={`שלח ${e}`}>{e}</button>)}</div>}
            </div>

      {/* manager menu */}
      <AnimatePresence>
        {menu && (
          <>
            <motion.div className="scrim" onClick={() => setMenu(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            <motion.div className="sheet psheet" role="dialog" aria-modal="true" aria-label={isHost ? 'ניהול השולחן' : 'הגדרות'} onKeyDown={e => { if (e.key === 'Escape') setMenu(false); }} initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 260, damping: 30 }}>
              <div className="grab" />
              <button className="icon-btn" onClick={() => setMenu(false)} aria-label="סגור ניהול שולחן">{I.x}</button>
              <h3 className="h-md" style={{ marginBottom: 10 }}>הגדרות</h3>
              {learn && <button className="glass row ptoggle" role="switch" aria-checked={!helpOff} onClick={toggleHelp}>
                <span className="who"><b>המאמן</b><span>{helpOff ? 'כבוי' : 'פועל: בתור שלך שאלה ושיעור מהאפליקציה, ואחרי כל החלטה משוב'}</span></span>
                <span className={`switch ${helpOff ? '' : 'on'}`} aria-hidden="true"><i /></span>
              </button>}
              {log.length > 0 && <p className="muted" style={{ margin: '8px 2px 0', fontSize: 13 }}>הערב: {log.length} החלטות, {Math.round(log.filter(x => x.g !== 'b').length / log.length * 100)}% טובות · +{earned} XP ומטבעות</p>}
              {isHost && <>
              <h3 className="h-md" style={{ margin: '18px 0 10px' }}>ניהול השולחן</h3>
              <button className="pbtn" style={{ width: '100%', marginBottom: 10 }} onClick={() => { const s = S.current!; s.cfg = { ...s.cfg, learn: !s.cfg.learn }; commit(); toast(s.cfg.learn ? 'מצב לימוד הופעל לכל השולחן' : 'מצב לימוד כובה'); }}>{learn ? 'כבה מצב לימוד לכולם' : 'הפעל מצב לימוד לכולם'}</button>
              <button className="pbtn" style={{ width: '100%', marginBottom: 10 }} onClick={() => {
                const s = S.current!, t = Date.now();
                if (!s.paused) { s.paused = true; s.pausedAt = t; }
                else { s.paused = false; const d = Math.max(0, t - (s.pausedAt ?? t)); if (s.startedAt) s.startedAt += d; s.deadline += d; if (s.phase === 'show') { s.nextAt += d; if (s.showAt) s.showAt += d; } delete s.pausedAt; }
                commit();
              }}>{V.paused ? 'המשך משחק' : 'הפסקה'}</button>
              {!buyIn && <div className="field"><label htmlFor="gamt">כמה ז׳יטונים לתת</label><input id="gamt" className="input" inputMode="numeric" value={giftAmt} onChange={e => setGiftAmt(e.target.value.replace(/\D/g, ''))} placeholder={String(V.cfg.stack)} /></div>}
              <div className="rows" style={{ marginBottom: 12 }}>
                {V.players.map(p => (
                  <div key={p.id} className="glass row" style={{ gridTemplateColumns: '1fr auto auto' }}>
                    <div className="who"><b>{p.nick}</b><span>{fmt(p.stack)}{p.pending ? ` (+${fmt(p.pending)} אחרי היד)` : ''} · {p.buyIns} קניות</span></div>
                    {!buyIn && <button className="pbtn go sm" onClick={() => { if (gift(S.current!, p.id, Number(giftAmt) || V.cfg.stack)) { commit(); toast(`${p.nick} קיבל ${fmt(Number(giftAmt) || V.cfg.stack)}`); } }}>תן</button>}
                    {p.id !== P.id && <button className="pbtn sm" disabled={V.phase === 'hand'} title={V.phase === 'hand' ? 'הוצאת שחקן אפשרית רק בין ידיים' : undefined} onClick={() => { const s = S.current!, x = s.players.find(q => q.id === p.id)!; x.out = !x.out; commit(); }}>{p.out ? 'החזר' : 'הוצא'}</button>}
                  </div>
                ))}
              </div>
              <button className="pbtn" style={{ width: '100%', color: 'var(--bad)' }} onClick={() => { const s = S.current!; if (s.phase !== 'hand') { s.phase = 'over'; commit(); setMenu(false); } else toast('אפשר לסיים בין ידיים. עצור את המשחק או חכה לסוף היד.'); }}>סיים משחק והצג תוצאות</button>
              </>}
            </motion.div>
          </>
        )}
      </AnimatePresence>
      <Burst fire={burst} colors={['#e9c46a', '#fff1c1', '#c9a227']} />
    </>)}</RoomStage>
  );
}
