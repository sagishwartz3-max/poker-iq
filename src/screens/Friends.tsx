import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isRed, madeHand, RN, SUITS } from '../engine/cards';
import { act, BLINDS, canRebuy, DEFAULT_CFG, endHand, gift, newTable, publicView, rebuy, seat, startHand, timeoutAction, type PV, type TAction, type TCfg, type TS, type View } from '../engine/holdem';
import { sfx } from '../game/sound';
import { PUBLIC_URL, track } from '../net/supabase';
import { TableNet, type Cmd, type TPeer } from '../net/table';
import { newCode } from '../net/duel';
import { Burst } from '../ui/Burst';
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
  const enter = async (c: string, asHost: boolean) => {
    if (!crypto?.subtle) { toast('הדפדפן הזה לא תומך בהצפנה שהשולחן צריך'); return; }
    net.current?.leave();
    let host = asHost;
    S.current = null;
    try { const saved = JSON.parse(localStorage.getItem(saveKey(c)) || 'null') as TS | null; if (saved && saved.hostId === P.id) { S.current = saved; host = true; if (saved.phase === 'hand') saved.deadline = Date.now() + saved.cfg.turnSec * 1000; } } catch { /* no save */ }
    if (host && !S.current) { S.current = newTable(c, P.id, cfg); seat(S.current, P.id, P.nick || 'שחקן'); }
    if (host) { try { localStorage.setItem(LAST_HOSTED, c); } catch { /* storage off */ } }
    setIsHost(host); setCode(c); setV(null); setMine(null); setPeers([]);
    const n = new TableNet(c, { id: P.id, nick: P.nick || 'שחקן' }, host, {
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
  useEffect(() => { if (initialCode && initialCode.length === 5) enter(initialCode.toUpperCase(), false); /* eslint-disable-next-line */ }, []);

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
      {lastHost && <button className="glass list-btn" onClick={() => enter(lastHost, true)}><span>חזרה לשולחן שפתחתי ({lastHost})</span><span style={{ width: 20 }}>{I.back}</span></button>}
      <motion.div className="glass" style={{ padding: 18, borderRadius: 24, marginBottom: 14 }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h3 className="h-md" style={{ marginBottom: 12 }}>פתח שולחן (אתה המנהל)</h3>
        <Opt label="ז׳יטונים לכל שחקן" value={cfg.stack} set={v => setCfg({ ...cfg, stack: v })} opts={[[1000, '1,000'], [2000, '2,000'], [5000, '5,000'], [10000, '10,000']]} />
        <Opt label="הבליינדים עולים כל" value={cfg.levelMin} set={v => setCfg({ ...cfg, levelMin: v })} opts={[[0, 'לא עולים'], [5, '5 דק׳'], [10, '10 דק׳'], [15, '15 דק׳'], [20, '20 דק׳']]} />
        <Opt label="כמה ריביי מותר לכל שחקן" value={cfg.rebuys} set={v => setCfg({ ...cfg, rebuys: v })} opts={[[0, 'בלי'], [1, '1'], [2, '2'], [3, '3'], [-1, 'בלי הגבלה']]} />
        <Opt label="זמן לכל תור" value={cfg.turnSec} set={v => setCfg({ ...cfg, turnSec: v })} opts={[[20, '20 שנ׳'], [30, '30 שנ׳'], [45, '45 שנ׳'], [60, 'דקה']]} />
        <button className="btn gold wide" onClick={() => enter(newCode(), true)}>פתח שולחן</button>
      </motion.div>
      <div className="glass" style={{ padding: 18, borderRadius: 24 }}>
        <h3 className="h-md">הצטרפות לשולחן</h3>
        <div className="field" style={{ marginTop: 12 }}>
          <label htmlFor="tcode">קוד שולחן (5 תווים)</label>
          <input id="tcode" className="input code-input" maxLength={5} value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="ABCDE" autoComplete="off" />
        </div>
        <button className="btn violet wide" disabled={joinCode.length !== 5} onClick={() => enter(joinCode, false)}>הצטרף</button>
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
  const pos = (i: number) => { const a = ((90 + (360 / N) * ((i - hi + N) % N)) * Math.PI) / 180; return { x: 50 + 45 * Math.cos(a), y: 50 + 41 * Math.sin(a) }; };
  const mid = (p: { x: number; y: number }, t: number) => ({ x: p.x + (50 - p.x) * t, y: p.y + (47 - p.y) * t });
  const turnP = V.players.find(p => p.id === V.turn);
  const hand = myCards && peek ? madeHand(myCards, V.board).name : '';
  const potNow = V.pot;
  const presets: [string, number][] = [['מינימום', minTo], ['½ קופה', V.curBet + Math.round((potNow + toCall) / 2)], ['קופה', V.curBet + potNow + toCall], ['אול-אין', maxTo]];

  return (
    <div className="screen full">
      <div className="play-top">
        <button className="icon-btn" onClick={leave} aria-label="יציאה">{I.x}</button>
        <div className="play-title"><b>בליינדים {V.sb}/{V.bb}</b>
          <span>{V.paused ? 'המשחק בהפסקה' : V.levelEnds ? `עולים בעוד ${Math.floor(lvLeft / 60000)}:${String(Math.floor(lvLeft / 1000) % 60).padStart(2, '0')}` : `יד ${V.handNo}`}</span></div>
        <span className="chip">{code}</span>
        {isHost && <button className="icon-btn" onClick={() => setMenu(true)} aria-label="תפריט מנהל">⚙️</button>}
      </div>
      {!hostHere && !isHost && <div className="glass empty" style={{ padding: 10, margin: '8px 0' }}>המנהל התנתק. המשחק ימשיך כשיחזור.</div>}

      <div className="stage ftable">
        <div className="table"><div className="felt">
          <div className="felt-logo">POKER IQ</div>
          <div className="board">{[0, 1, 2, 3, 4].map(i => V.board[i] != null ? <MiniCard key={`${V.handNo}-${i}`} c={V.board[i]} size={38} delay={i < 3 ? i * 0.12 : 0} /> : <div key={i} className="card3d empty" style={{ '--cw': '38px' } as React.CSSProperties}><div className="face" /></div>)}</div>
          <motion.div className="pot" style={{ x: '-50%', y: '-50%', rotateX: -30 }} key={V.handNo}>
            <span className="chipstack"><i style={{ top: 10 }} /><i style={{ top: 5 }} /><i style={{ top: 0 }} /></span><span>קופה <b className="num">{fmt(V.pot)}</b></span>
          </motion.div>
        </div></div>
        {V.players.map((p, i) => {
          const xy = pos(i), isMe = p.id === P.id, turn = V.turn === p.id && V.phase === 'hand';
          const shown = V.shown[p.id], won = V.phase === 'show' && V.winners.find(w => w.id === p.id);
          const bub = bubbles[p.id];
          return (
            <div key={p.id}>
              <motion.div className={`seat fseat ${p.inHand && !p.folded ? '' : 'folded'} ${isMe ? 'hero' : ''} ${turn ? 'turn' : ''} ${won ? 'won' : ''}`} style={{ left: `${xy.x}%`, top: `${xy.y}%`, x: '-50%', y: '-50%' }} layout>
                {p.has && !shown && !isMe && <div className="backs"><i /><i /></div>}
                {shown && !isMe && <div className="shown">{shown.map((c, k) => <MiniCard key={k} c={c} size={26} delay={k * 0.1} />)}</div>}
                <div className="seat-disc">{p.nick.slice(0, 2)}
                  {turn && <svg className="ring" viewBox="0 0 44 44"><circle cx="22" cy="22" r="20" pathLength="100" strokeDasharray={`${Math.min(100, (left / V.cfg.turnSec) * 100)} 100`} /></svg>}
                </div>
                <span className="seat-name">{isMe ? 'אתה' : p.nick}{p.away ? ' 💤' : ''}</span>
                <span className={`seat-tag ${won ? 'hot' : ''}`}>{won ? `+${fmt(won.amount)}` : p.out ? 'בחוץ' : p.allIn && p.inHand ? 'אול-אין' : fmt(p.stack)}</span>
                {V.last?.id === p.id && V.phase === 'hand' && <motion.span key={V.last.text + V.pot} className="said" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>{V.last.text}</motion.span>}
                <AnimatePresence>{bub && now - bub.k < 2500 && <motion.span key={bub.k} className="bubble" initial={{ scale: 0, y: 0 }} animate={{ scale: 1.2, y: -26 }} exit={{ opacity: 0 }}>{bub.e}</motion.span>}</AnimatePresence>
              </motion.div>
              {p.bet > 0 && <motion.div className="seat betchip" style={{ x: '-50%', y: '-50%' }} initial={{ left: `${xy.x}%`, top: `${xy.y}%`, opacity: 0 }} animate={{ left: `${mid(xy, 0.42).x}%`, top: `${mid(xy, 0.42).y}%`, opacity: 1 }}>
                <span className="chipstack"><i style={{ top: 5 }} /><i style={{ top: 0 }} /></span><b className="num">{fmt(p.bet)}</b></motion.div>}
              {i === V.btn && <div className="dealer" style={{ left: `${mid(xy, 0.24).x + 6}%`, top: `${mid(xy, 0.24).y}%`, transform: 'translate(-50%,-50%)' }}>D</div>}
            </div>
          );
        })}
      </div>

      <AnimatePresence>
        {V.phase === 'show' && V.winners[0] && (
          <motion.div className="glass winbar" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
            🏆 {V.winners.map(w => `${V.players.find(p => p.id === w.id)?.nick} זכה ב-${fmt(w.amount)}${w.name ? ` עם ${w.name}` : ''}`).join(' · ')}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="hero-zone" style={{ marginTop: 6 }}>
        {myCards ? (
          <button className="hero-cards peekable" onClick={() => { setPeek(x => !x); sfx.deal(0); }} aria-label={peek ? 'הסתר קלפים' : 'הצץ בקלפים'}>
            {myCards.map((c, k) => <MiniCard key={`${V.handNo}-${k}`} c={c} size={74} down={!peek && V.phase === 'hand'} delay={0.15 + k * 0.12} />)}
          </button>
        ) : <div className="muted" style={{ fontSize: 14 }}>{me?.out ? 'יצאת מהמשחק' : me && me.stack === 0 ? 'נגמרו לך הז׳יטונים' : 'תצטרף ביד הבאה'}</div>}
        <div className="hero-meta">
          {myCards && <span className="chip big gold">{peek || V.phase !== 'hand' ? hand || madeHand(myCards, V.board).name : 'לחץ על הקלפים כדי להציץ'}</span>}
          {me && <span className="chip">הערימה שלך: <b className="num">{fmt(me.stack)}</b></span>}
          {me && canRebuy(V as unknown as TS, me as any) && <button className="btn gold" style={{ minHeight: 40 }} onClick={doRebuy}>ריביי ({fmt(V.cfg.stack)})</button>}
        </div>
      </div>

      {myTurn && me ? (
        raiseTo == null ? (
          <div className="actions">
            <motion.button className="act fold" whileTap={{ scale: 0.93 }} onClick={() => doAct({ type: 'fold' })}>פולד<small>לוותר</small></motion.button>
            {toCall <= 0
              ? <motion.button className="act" whileTap={{ scale: 0.93 }} onClick={() => doAct({ type: 'check' })}>צ׳ק<small>בלי לשים</small></motion.button>
              : <motion.button className="act" whileTap={{ scale: 0.93 }} onClick={() => doAct({ type: 'call' })}>{toCall >= me.stack ? 'אול-אין' : 'קול'}<small className="num">{fmt(Math.min(toCall, me.stack))}</small></motion.button>}
            {maxTo > V.curBet && <motion.button className="act raise" whileTap={{ scale: 0.93 }} onClick={() => setRaiseTo(minTo)}>{V.curBet ? 'רייז' : 'הימור'}<small>לבחור סכום</small></motion.button>}
          </div>
        ) : (
          <div className="glass raisebox">
            <div className="opt-row">{presets.map(([t, v]) => <button key={t} className="chip" onClick={() => setRaiseTo(Math.max(minTo, Math.min(maxTo, v)))}>{t}</button>)}</div>
            <input type="range" min={minTo} max={maxTo} step={Math.max(1, V.sb)} value={raiseTo} onChange={e => setRaiseTo(Math.min(maxTo, Math.max(minTo, +e.target.value)))} aria-label="סכום ההעלאה" />
            <div className="actions">
              <button className="act" onClick={() => setRaiseTo(null)}>ביטול</button>
              <button className="act raise" onClick={() => doAct({ type: 'raise', to: raiseTo })}>{raiseTo >= maxTo ? 'אול-אין' : V.curBet ? 'העלה ל' : 'המר'}<small className="num">{fmt(raiseTo)}</small></button>
            </div>
          </div>
        )
      ) : (
        <div className="glass waitbar">
          <span>{V.paused ? 'המנהל עצר את המשחק' : V.phase === 'show' ? 'היד הבאה מיד…' : turnP ? `התור של ${turnP.id === P.id ? 'אתה' : turnP.nick} · ${Math.ceil(left)} שנ׳` : 'מחלקים…'}</span>
          <span className="emojis">{EMOJIS.map(e => <button key={e} onClick={() => emoji(e)} aria-label={`שלח ${e}`}>{e}</button>)}</span>
        </div>
      )}

      {/* manager menu */}
      <AnimatePresence>
        {menu && isHost && (
          <>
            <motion.div className="scrim" onClick={() => setMenu(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            <motion.div className="sheet" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 260, damping: 30 }}>
              <div className="grab" />
              <h3 className="h-md" style={{ marginBottom: 10 }}>ניהול השולחן</h3>
              <button className="btn wide" style={{ marginBottom: 10 }} onClick={() => {
                const s = S.current!, t = Date.now();
                if (!s.paused) { s.paused = true; pausedAt.current = t; }
                else { s.paused = false; const d = t - pausedAt.current; if (s.startedAt) s.startedAt += d; s.deadline = t + s.cfg.turnSec * 1000; if (s.phase === 'show') s.nextAt = t + 1500; }
                commit();
              }}>{V.paused ? '▶️ המשך משחק' : '⏸️ הפסקה'}</button>
              <div className="field"><label htmlFor="gamt">כמה ז׳יטונים לתת</label><input id="gamt" className="input" inputMode="numeric" value={giftAmt} onChange={e => setGiftAmt(e.target.value.replace(/\D/g, ''))} placeholder={String(V.cfg.stack)} /></div>
              <div className="rows" style={{ marginBottom: 12 }}>
                {V.players.map(p => (
                  <div key={p.id} className="glass row" style={{ gridTemplateColumns: '1fr auto auto' }}>
                    <div className="who"><b>{p.nick}</b><span>{fmt(p.stack)}{p.pending ? ` (+${fmt(p.pending)} אחרי היד)` : ''} · {p.buyIns} קניות</span></div>
                    <button className="btn gold" style={{ minHeight: 38, padding: '0 12px' }} onClick={() => { if (gift(S.current!, p.id, Number(giftAmt) || V.cfg.stack)) { commit(); toast(`${p.nick} קיבל ${fmt(Number(giftAmt) || V.cfg.stack)}`); } }}>תן</button>
                    {p.id !== P.id && <button className="btn" style={{ minHeight: 38, padding: '0 12px' }} onClick={() => { const s = S.current!, x = s.players.find(q => q.id === p.id)!; x.out = !x.out; if (x.out && s.turn === x.id) act(s, x.id, { type: 'fold' }, Date.now()); commit(); }}>{p.out ? 'החזר' : 'הוצא'}</button>}
                  </div>
                ))}
              </div>
              <button className="btn wide" style={{ color: 'var(--bad)' }} onClick={() => { const s = S.current!; if (s.phase !== 'hand') { s.phase = 'over'; commit(); setMenu(false); } else toast('אפשר לסיים בין ידיים. עצור את המשחק או חכה לסוף היד.'); }}>סיים משחק והצג תוצאות</button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      <Burst fire={burst} />
    </div>
  );
}
