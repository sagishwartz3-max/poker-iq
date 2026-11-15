import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isRed, madeHand, RN, SUITS } from '../engine/cards';
import { act, BLINDS, canRebuy, DEFAULT_CFG, endHand, gift, newTable, publicView, rebuy, seat, startHand, timeoutAction, type PV, type TAction, type TCfg, type TS, type View } from '../engine/holdem';
import { sfx } from '../game/sound';
import { createRoom, getRoom, PUBLIC_URL, track } from '../net/supabase';
import { TableNet, type Cmd, type TPeer } from '../net/table';
import { Burst } from '../ui/Burst';
import { Chips } from '../ui/Chips';
import { Dial } from '../ui/Dial';
import { useApp } from '../ui/ctx';
import { I } from '../ui/Icons';
import { shareLinks } from './Duel';

const rnd = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
const saveKey = (code: string) => `pokeriq-table-${code}`;
const LAST_HOSTED = 'pokeriq-table-last';
const fmt = (n: number) => n.toLocaleString('he-IL');
const EMOJIS = ['👍', '😂', '😱', '🔥', '🤡', '👏'];

function MiniCard({ c, size = 30, down = false, delay = 0 }: { c: number; size?: number; down?: boolean; delay?: number }) {
  return (
    <motion.div className={`card3d ${isRed(c) ? 'red' : ''}`} style={{ '--cw': `${size}px` } as React.CSSProperties}
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

export function Friends({ initialCode, onPlaying }: { initialCode?: string; onPlaying: (b: boolean) => void }) {
  const { P, toast, go } = useApp();
  const [code, setCode] = useState('');
  const [joinCode, setJoinCode] = useState(initialCode || '');
  const [isHost, setIsHost] = useState(false);
  const [cfg, setCfg] = useState<TCfg>(DEFAULT_CFG);
  const [V, setV] = useState<View | null>(null);
  const [skew, setSkew] = useState(0); // host clock minus ours
  const [peers, setPeers] = useState<TPeer[]>([]);
  const [status, setStatus] = useState('');
  const [mine, setMine] = useState<{ hand: number; cards: number[] } | null>(null);
  const [peek, setPeek] = useState(false);
  const [raiseTo, setRaiseTo] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);
  const [tray, setTray] = useState(false);
  const [giftAmt, setGiftAmt] = useState('');
  const [now, setNow] = useState(Date.now());
  const [bubbles, setBubbles] = useState<Record<string, { e: string; k: number }>>({});
  const [burst, setBurst] = useState(0);
  const net = useRef<TableNet | null>(null);
  const S = useRef<TS | null>(null);
  const pausedAt = useRef(0);
  const lastBeat = useRef(0);
  const lastHost = useMemo(() => { try { return localStorage.getItem(LAST_HOSTED) || ''; } catch { return ''; } }, []);

  useEffect(() => { onPlaying(!!code); }, [code, onPlaying]);
  useEffect(() => () => { net.current?.leave(); onPlaying(false); }, [onPlaying]);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(id); }, []);

  /* ---------------- host: owns the game state ---------------- */
  const commit = useCallback(() => {
    const s = S.current; if (!s) return;
    try { localStorage.setItem(saveKey(s.code), JSON.stringify(s)); } catch { /* storage off */ }
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
    if (c.t === 'act' && c.hand === s.handNo && !s.paused && act(s, from, c.a, Date.now())) commit();
    if (c.t === 'rebuy' && rebuy(s, from)) commit();
  }, [commit]);

  // the host's game loop
  useEffect(() => {
    if (!isHost || !code) return;
    const id = setInterval(() => {
      const s = S.current, n = net.current; if (!s || !n) return;
      const t = Date.now();
      let changed = false;
      for (const peer of n.peers) if (!s.players.some(p => p.id === peer.id) && seat(s, peer.id, peer.nick)) changed = true;
      for (const p of s.players) { const away = p.id !== P.id && !n.peers.some(x => x.id === p.id); if (p.away !== away) { p.away = away; changed = true; } }
      if (!s.paused) {
        if (s.phase === 'hand' && t > s.deadline && s.turn) { act(s, s.turn, timeoutAction(s), t); changed = true; }
        else if (s.phase === 'show' && t > s.nextAt) { endHand(s); if ((s.phase as string) !== 'over' && startHand(s, rnd, t)) dealOut(); changed = true; }
        else if (s.phase === 'lobby' && s.handNo > 0 && startHand(s, rnd, t)) { dealOut(); changed = true; }
      }
      if (changed) commit(); else if (t - lastBeat.current > 4000) { n.sendState(publicView(s, t)); lastBeat.current = t; }
    }, 400);
    return () => clearInterval(id);
  }, [isHost, code, commit, dealOut, P.id]);

  /* ---------------- joining ---------------- */
  const [busy, setBusy] = useState(false);
  const enter = async (codeIn: string | null) => {
    if (busy) return;
    if (!crypto?.subtle) { toast('הדפדפן הזה לא תומך בהצפנה שהשולחן צריך'); return; }
    setBusy(true);
    let rm;
    try { rm = codeIn ? await getRoom(codeIn, 'table') : await createRoom(P, 'table'); }
    catch { setBusy(false); toast('אין חיבור לשרת. בדוק שיש אינטרנט ונסה שוב.'); return; }
    setBusy(false);
    if (!rm) { toast('אין שולחן עם הקוד הזה. בדוק את הקוד או בקש קישור חדש.'); return; }
    const c = rm.code, host = rm.hostId === P.id;
    net.current?.leave();
    S.current = null;
    if (host) {
      try { const saved = JSON.parse(localStorage.getItem(saveKey(c)) || 'null') as TS | null; if (saved && saved.hostId === P.id) { S.current = saved; if (saved.phase === 'hand') saved.deadline = Date.now() + saved.cfg.turnSec * 1000; } } catch { /* no save */ }
      if (!S.current) { S.current = newTable(c, P.id, cfg); seat(S.current, P.id, P.nick || 'שחקן'); }
      try { localStorage.setItem(LAST_HOSTED, c); } catch { /* storage off */ }
    }
    setIsHost(host); setCode(c); setV(null); setMine(null); setPeers([]);
    const n = new TableNet(c, rm.channel, { id: P.id, nick: P.nick || 'שחקן' }, host, {
      onPeers: setPeers, onStatus: setStatus,
      onState: v => { setV(v); setSkew(v.at - Date.now()); },
      onCards: (hand, cards) => setMine({ hand, cards }),
      onCmd: hostCmd,
      onEmoji: (from, e) => setBubbles(b => ({ ...b, [from]: { e, k: Date.now() } }))
    });
    net.current = n;
    await n.join();
    if (host) commit();
    track(P, 'table_enter', { host });
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
  const left = V && V.phase === 'hand' ? Math.max(0, (V.deadline - hostNow) / 1000) : 0;
  const lvLeft = V && V.levelEnds ? Math.max(0, V.levelEnds - hostNow) : 0;

  useEffect(() => { setPeek(false); setRaiseTo(null); if (V?.handNo) sfx.deal(0); }, [V?.handNo]);
  useEffect(() => { setRaiseTo(null); if (myTurn) sfx.tick(); }, [myTurn, V?.street]);
  useEffect(() => { if (V?.last) sfx.chip(); }, [V?.last?.id, V?.last?.text, V?.pot]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (V?.phase === 'show' && V.winners.some(w => w.id === P.id)) { sfx.good(); setBurst(b => b + 1); } }, [V?.phase, V?.handNo]); // eslint-disable-line react-hooks/exhaustive-deps

  const doAct = (a: TAction) => {
    sfx.tap(); setRaiseTo(null);
    if (isHost) { const s = S.current!; if (act(s, P.id, a, Date.now())) commit(); }
    else net.current?.sendCmd({ t: 'act', hand: V!.handNo, a });
  };
  const doRebuy = () => { if (isHost) { if (rebuy(S.current!, P.id)) commit(); } else net.current?.sendCmd({ t: 'rebuy' }); };
  const emoji = (e: string) => { net.current?.sendCmd({ t: 'emoji', e }); setBubbles(b => ({ ...b, [P.id]: { e, k: Date.now() } })); };
  const leave = () => { net.current?.leave(); net.current = null; S.current = null; setCode(''); setV(null); setMenu(false); };

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
        <Opt label="ז׳יטונים לכל שחקן" value={cfg.stack} set={v => setCfg({ ...cfg, stack: v })} opts={[[1000, '1,000'], [2000, '2,000'], [5000, '5,000'], [10000, '10,000']]} />
        <Opt label="הבליינדים עולים כל" value={cfg.levelMin} set={v => setCfg({ ...cfg, levelMin: v })} opts={[[0, 'לא עולים'], [5, '5 דק׳'], [10, '10 דק׳'], [15, '15 דק׳'], [20, '20 דק׳']]} />
        <Opt label="כמה ריביי מותר לכל שחקן" value={cfg.rebuys} set={v => setCfg({ ...cfg, rebuys: v })} opts={[[0, 'בלי'], [1, '1'], [2, '2'], [3, '3'], [-1, 'בלי הגבלה']]} />
        <Opt label="זמן לכל תור" value={cfg.turnSec} set={v => setCfg({ ...cfg, turnSec: v })} opts={[[20, '20 שנ׳'], [30, '30 שנ׳'], [45, '45 שנ׳'], [60, 'דקה']]} />
        <button className="btn gold wide" disabled={busy} onClick={() => enter(null)}>פתח שולחן</button>
      </motion.div>
      <div className="glass" style={{ padding: 18, borderRadius: 24 }}>
        <h3 className="h-md">הצטרפות לשולחן</h3>
        <div className="field" style={{ marginTop: 12 }}>
          <label htmlFor="tcode">קוד שולחן (5 תווים)</label>
          <input id="tcode" className="input code-input" maxLength={5} value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="ABCDE" autoComplete="off" />
        </div>
        <button className="btn violet wide" disabled={joinCode.length !== 5 || busy} onClick={() => enter(joinCode)}>הצטרף</button>
      </div>
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
  const standings = [...V.players].sort((a, b) => b.stack - a.stack);
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
          <p className="muted" style={{ fontSize: 13 }}>{fmt(V.cfg.stack)} ז׳יטונים · בליינדים {BLINDS[0][0]}/{BLINDS[0][1]}{V.cfg.levelMin ? ` · עולים כל ${V.cfg.levelMin} דק׳` : ''} · ריביי: {V.cfg.rebuys < 0 ? 'בלי הגבלה' : V.cfg.rebuys || 'בלי'}</p>
          <div className="share-row">
            <a className="btn wa" href={sh.wa} target="_blank" rel="noreferrer">{I.wa} וואטסאפ</a>
            <button className="btn" onClick={async () => ((await sh.copy()) ? toast('הקישור הועתק') : toast(link))}>{I.copy} העתק קישור</button>
          </div>
        </motion.div>
      )}
      {V.phase === 'over' && <div style={{ textAlign: 'center' }}><div className="trophy">🏆</div><h1 className="h-xl" style={{ marginBottom: 14 }}>{standings[0]?.nick} ניצח!</h1></div>}
      <div className="rows">
        {(V.phase === 'over' ? standings : V.players).map((p, k) => (
          <motion.div key={p.id} layout className={`glass row ${p.id === P.id ? 'me' : ''}`} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
            <span className={`rank ${V.phase === 'over' && k < 3 ? 'm' + (k + 1) : ''}`}>{k + 1}</span>
            <div className={`avatar sm ${k % 2 ? 'violet' : ''}`}>{p.nick.slice(0, 1)}</div>
            <div className="who"><b>{p.nick}{p.id === V.hostId ? ' · מנהל' : ''}{p.id === P.id ? ' (אתה)' : ''}</b>
              <span>{V.phase === 'over' ? `${p.buyIns} קניות${p.gifts ? ` · קיבל ${fmt(p.gifts)}` : ''} · מאזן ${net$(p) >= 0 ? '+' : ''}${fmt(net$(p))}` : p.away ? 'לא מחובר' : 'מוכן'}</span></div>
            <span className="val num">{fmt(p.stack)}</span>
          </motion.div>
        ))}
      </div>
      <div className="modal-actions">
        {isHost && V.phase !== 'over' && <button className="btn gold wide" disabled={V.players.length < 2} onClick={() => { const s = S.current!; if (startHand(s, rnd, Date.now())) { dealOut(); commit(); track(P, 'table_start', { players: s.players.length }); } }}>{V.players.length < 2 ? 'מחכים לעוד שחקן…' : 'התחל משחק'}</button>}
        {!isHost && V.phase !== 'over' && <p className="muted" style={{ textAlign: 'center' }}>{hostHere ? 'מחכים שהמנהל יתחיל…' : 'המנהל התנתק. מחכים שיחזור…'}</p>}
        {V.phase === 'over' && <a className="btn wa wide" href={shareLinks(`סיימנו ערב פוקר ב-Poker IQ. ${standings[0]?.nick} לקח את הכול 🏆`, PUBLIC_URL).wa} target="_blank" rel="noreferrer">{I.wa} שתף תוצאות</a>}
        {V.phase === 'over' && <button className="btn wide" onClick={leave}>יציאה</button>}
      </div>
    </div>
  );

  /* ---------------- the table ---------------- */
  const N = V.players.length, hi = Math.max(0, V.players.findIndex(p => p.id === P.id));
  const pos = (i: number) => { const a = ((90 + (360 / N) * ((i - hi + N) % N)) * Math.PI) / 180; return { x: 50 + 40 * Math.cos(a), y: 50 + 48 * Math.sin(a) }; };
  const mid = (p: { x: number; y: number }, t: number) => ({ x: p.x + (50 - p.x) * t, y: p.y + (46 - p.y) * t });
  const turnP = V.players.find(p => p.id === V.turn);
  const showMine = peek || V.phase !== 'hand';
  const potNow = V.pot;
  const clamp = (v: number) => Math.max(minTo, Math.min(maxTo, Math.round(v / V.sb) * V.sb || minTo));
  const presets: [string, number][] = [['מינ׳', minTo], ['½ קופה', clamp(V.curBet + (potNow + toCall) / 2)], ['¾', clamp(V.curBet + (potNow + toCall) * 0.75)], ['קופה', clamp(V.curBet + potNow + toCall)], ['אול-אין', maxTo]];
  const mmss = `${String(Math.floor(lvLeft / 60000)).padStart(2, '0')}:${String(Math.floor(lvLeft / 1000) % 60).padStart(2, '0')}`;
  const hold = { onPointerDown: () => { setPeek(true); sfx.deal(0); }, onPointerUp: () => setPeek(false), onPointerLeave: () => setPeek(false), onPointerCancel: () => setPeek(false), onContextMenu: (e: React.MouseEvent) => e.preventDefault() };

  return (
    <div className="screen full pro">
      <div className="lounge" aria-hidden><i /><i /><i /><i /><i /></div>
      <div className="pro-top">
        <button className="pro-round" onClick={leave} aria-label="יציאה">{I.back}</button>
        <div className="pro-pill"><span>בליינדים <b className="num">{V.sb}/{V.bb}</b></span>{V.paused ? <em>הפסקה</em> : V.levelEnds ? <em className="num">{mmss}</em> : <em className="num">יד {V.handNo}</em>}</div>
        <div className="pro-pill code num">{code}</div>
      </div>
      {!hostHere && !isHost && <div className="pro-note">המנהל התנתק. המשחק ימשיך כשיחזור.</div>}

      <div className="ptable">
        <div className="rail"><div className="pfelt"><div className="pfelt-line" /><div className="pfelt-logo">POKER IQ</div></div></div>
        <div className="pboard">{[0, 1, 2, 3, 4].map(i => V.board[i] != null ? <MiniCard key={`${V.handNo}-${i}`} c={V.board[i]} size={40} delay={i < 3 ? i * 0.12 : 0} /> : <span key={i} className="pslot" />)}</div>
        <motion.div className="ppot" key={V.handNo} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <Chips amount={V.pot} unit={V.bb} size={18} /><span>קופה</span><b className="num">{fmt(V.pot)}</b>
        </motion.div>
        {V.players.map((p, i) => {
          const xy = pos(i), isMe = p.id === P.id, turn = V.turn === p.id && V.phase === 'hand';
          const shown = V.shown[p.id], won = V.phase === 'show' && V.winners.find(w => w.id === p.id);
          const bub = bubbles[p.id], bp = mid(xy, 0.34), dp = mid(xy, 0.2);
          return (
            <div key={p.id}>
              <div className={`pseat ${p.inHand && !p.folded ? '' : 'dim'} ${isMe ? 'me' : ''} ${turn ? 'turn' : ''} ${won ? 'won' : ''}`} style={{ left: `${xy.x}%`, top: `${xy.y}%` }}>
                {p.has && !shown && !isMe && <div className="pbacks"><i /><i /></div>}
                {shown && !isMe && <div className="pshown">{shown.map((c, k) => <MiniCard key={k} c={c} size={28} delay={k * 0.1} />)}</div>}
                <div className="pavatar" style={{ '--h': `${(p.nick.charCodeAt(0) * 47) % 360}` } as React.CSSProperties}>
                  <span>{p.nick.slice(0, 2)}</span>
                  {turn && <svg className="pring" viewBox="0 0 44 44"><circle cx="22" cy="22" r="20" pathLength="100" strokeDasharray={`${Math.min(100, (left / V.cfg.turnSec) * 100)} 100`} /></svg>}
                  {turn && <b className="psec num">{Math.ceil(left)}</b>}
                </div>
                <div className="pplate"><span className="pname">{isMe ? 'אני' : p.nick}{p.away ? ' ·' : ''}</span>
                  <span className="pstack num">{won ? `+${fmt(won.amount)}` : p.out ? 'בחוץ' : p.allIn && p.inHand ? 'אול-אין' : fmt(p.stack)}</span></div>
                {V.last?.id === p.id && V.phase === 'hand' && <motion.span key={V.last.text + V.pot} className="psaid" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>{V.last.text}</motion.span>}
                <AnimatePresence>{bub && now - bub.k < 2500 && <motion.span key={bub.k} className="bubble" initial={{ scale: 0, y: 0 }} animate={{ scale: 1.2, y: -30 }} exit={{ opacity: 0 }}>{bub.e}</motion.span>}</AnimatePresence>
              </div>
              {p.bet > 0 && <motion.div className="pbet" initial={{ left: `${xy.x}%`, top: `${xy.y}%`, opacity: 0 }} animate={{ left: `${bp.x}%`, top: `${bp.y}%`, opacity: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 22 }}>
                <Chips amount={p.bet} unit={V.bb} size={16} /><b className="num">{fmt(p.bet)}</b></motion.div>}
              {i === V.btn && <div className="pdealer" style={{ left: `${dp.x + (xy.x < 50 ? 7 : -7)}%`, top: `${dp.y}%` }}>D</div>}
            </div>
          );
        })}
        <AnimatePresence>
        {V.phase === 'show' && V.winners[0] && (
          <motion.div className="pwin" initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
            {V.winners.map(w => `${V.players.find(p => p.id === w.id)?.nick} זכה ב-${fmt(w.amount)}${w.name ? ` עם ${w.name}` : ''}`).join(' · ')}
          </motion.div>
        )}
      </AnimatePresence>
        {myCards && (
          <div className={`phero ${showMine ? 'up' : ''}`} {...(V.phase === 'hand' ? hold : {})} role="button" tabIndex={0} aria-label="החזק כדי להציץ בקלפים"
            onKeyDown={e => { if (e.key === ' ') setPeek(true); }} onKeyUp={() => setPeek(false)}>
            {V.phase === 'hand' && !peek && <span className="phint">החזק להצצה</span>}
            <div className="phero-cards">{myCards.map((c, k) => <MiniCard key={`${V.handNo}-${k}`} c={c} size={66} down={!showMine} delay={0.15 + k * 0.12} />)}</div>
            {showMine && <span className="phand">{madeHand(myCards, V.board).name}</span>}
          </div>
        )}
      </div>

      <div className="pdock">
        {!myCards && <div className="pro-note">{me?.out ? 'יצאת מהמשחק' : me && me.stack === 0 ? 'נגמרו לך הז׳יטונים' : 'תצטרף ביד הבאה'}</div>}
        {me && canRebuy(V as unknown as TS, me as any) && <button className="pbtn go" onClick={doRebuy}>ריביי · {fmt(V.cfg.stack)}</button>}
        {myTurn && me ? (
          raiseTo == null ? (
            <div className="pactions">
              <button className="pbtn" onClick={() => doAct({ type: 'fold' })}>פולד</button>
              {toCall <= 0
                ? <button className="pbtn" onClick={() => doAct({ type: 'check' })}>צ׳ק</button>
                : <button className="pbtn" onClick={() => doAct({ type: 'call' })}>{toCall >= me.stack ? 'אול-אין' : 'קול'}<small className="num">{fmt(Math.min(toCall, me.stack))}</small></button>}
              {maxTo > V.curBet && <button className="pbtn go" onClick={() => setRaiseTo(minTo)}><span className="pbubble num">{fmt(minTo)}</span>{V.curBet ? 'רייז' : 'הימור'}</button>}
            </div>
          ) : (
            <motion.div className="praise" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
              <div className="praise-amt"><span>{raiseTo >= maxTo ? 'אול-אין' : V.curBet ? 'רייז ל' : 'הימור'}</span><b className="num">{fmt(raiseTo)}</b></div>
              <Dial min={minTo} max={maxTo} unit={V.sb} value={raiseTo} onChange={setRaiseTo} />
              <div className="ppresets">{presets.map(([t, v]) => <button key={t} className={v === raiseTo ? 'on' : ''} onClick={() => setRaiseTo(v)}>{t}</button>)}</div>
              <div className="pactions two">
                <button className="pbtn" onClick={() => setRaiseTo(null)}>ביטול</button>
                <button className="pbtn go" onClick={() => doAct({ type: 'raise', to: raiseTo })}>אישור</button>
              </div>
            </motion.div>
          )
        ) : (
          <div className="pwait">
            <div className="ptools">
              {isHost && <button className="pro-round" onClick={() => setMenu(true)} aria-label="ניהול השולחן"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg></button>}
              <button className="pro-round" onClick={() => setTray(t => !t)} aria-label="תגובות"><svg viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></svg></button>
              {tray && <div className="ptray">{EMOJIS.map(e => <button key={e} onClick={() => { emoji(e); setTray(false); }} aria-label={`שלח ${e}`}>{e}</button>)}</div>}
            </div>
            <span className="pstatus">{V.paused ? 'המנהל עצר את המשחק' : V.phase === 'show' ? 'היד הבאה מיד' : turnP ? `התור של ${turnP.nick}` : 'מחלקים קלפים'}</span>
          </div>
        )}
      </div>

      {/* manager menu */}
      <AnimatePresence>
        {menu && isHost && (
          <>
            <motion.div className="scrim" onClick={() => setMenu(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            <motion.div className="sheet psheet" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 260, damping: 30 }}>
              <div className="grab" />
              <h3 className="h-md" style={{ marginBottom: 10 }}>ניהול השולחן</h3>
              <button className="pbtn" style={{ width: '100%', marginBottom: 10 }} onClick={() => {
                const s = S.current!, t = Date.now();
                if (!s.paused) { s.paused = true; pausedAt.current = t; }
                else { s.paused = false; const d = t - pausedAt.current; if (s.startedAt) s.startedAt += d; s.deadline = t + s.cfg.turnSec * 1000; if (s.phase === 'show') s.nextAt = t + 1500; }
                commit();
              }}>{V.paused ? 'המשך משחק' : 'הפסקה'}</button>
              <div className="field"><label htmlFor="gamt">כמה ז׳יטונים לתת</label><input id="gamt" className="input" inputMode="numeric" value={giftAmt} onChange={e => setGiftAmt(e.target.value.replace(/\D/g, ''))} placeholder={String(V.cfg.stack)} /></div>
              <div className="rows" style={{ marginBottom: 12 }}>
                {V.players.map(p => (
                  <div key={p.id} className="glass row" style={{ gridTemplateColumns: '1fr auto auto' }}>
                    <div className="who"><b>{p.nick}</b><span>{fmt(p.stack)}{p.pending ? ` (+${fmt(p.pending)} אחרי היד)` : ''} · {p.buyIns} קניות</span></div>
                    <button className="pbtn go sm" onClick={() => { if (gift(S.current!, p.id, Number(giftAmt) || V.cfg.stack)) { commit(); toast(`${p.nick} קיבל ${fmt(Number(giftAmt) || V.cfg.stack)}`); } }}>תן</button>
                    {p.id !== P.id && <button className="pbtn sm" onClick={() => { const s = S.current!, x = s.players.find(q => q.id === p.id)!; x.out = !x.out; if (x.out && s.turn === x.id) act(s, x.id, { type: 'fold' }, Date.now()); commit(); }}>{p.out ? 'החזר' : 'הוצא'}</button>}
                  </div>
                ))}
              </div>
              <button className="pbtn" style={{ width: '100%', color: 'var(--bad)' }} onClick={() => { const s = S.current!; if (s.phase !== 'hand') { s.phase = 'over'; commit(); setMenu(false); } else toast('אפשר לסיים בין ידיים. עצור את המשחק או חכה לסוף היד.'); }}>סיים משחק והצג תוצאות</button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      <Burst fire={burst} colors={['#e9c46a', '#fff1c1', '#c9a227']} />
    </div>
  );
}
