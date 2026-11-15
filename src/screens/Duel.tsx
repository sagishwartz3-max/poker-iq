import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { mulberry32 } from '../engine/cards';
import { ACT_NAME, grade, makeScenario, type Action, type Scenario } from '../engine/scenarios';
import { recordSkill, rememberMistake } from '../game/progress';
import { sfx } from '../game/sound';
import { DUEL_CFG } from '../game/worlds';
import { DUEL_HANDS, DUEL_SECONDS, DuelRoom, newCode, seated, type DuelMsg, type Peer } from '../net/duel';
import { PUBLIC_URL, recordMatch, track } from '../net/supabase';
import { Burst } from '../ui/Burst';
import { useApp } from '../ui/ctx';
import { Feedback } from '../ui/Feedback';
import { I } from '../ui/Icons';
import { Spot } from '../ui/Spot';

type View = 'lobby' | 'room' | 'match' | 'end' | 'full';
type Ans = { action: Action | 'timeout'; pts: number };

export function shareLinks(text: string, url: string) {
  return {
    wa: `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`,
    native: async () => { if (navigator.share) { try { await navigator.share({ title: 'Poker IQ', text, url }); return true; } catch { return true; } } return false; },
    copy: async () => { try { await navigator.clipboard.writeText(`${text}\n${url}`); return true; } catch { return false; } }
  };
}

export function Duel({ initialCode, onPlaying }: { initialCode?: string; onPlaying: (b: boolean) => void }) {
  const { P, update, toast, sync, go } = useApp();
  const [view, setView] = useState<View>('lobby');
  const [code, setCode] = useState('');
  const [joinCode, setJoinCode] = useState(initialCode || '');
  const [peers, setPeers] = useState<Peer[]>([]);
  const [status, setStatus] = useState('');
  const [host, setHost] = useState(false);
  const [hands, setHands] = useState<Scenario[]>([]);
  const [seed, setSeed] = useState(0);
  const [i, setI] = useState(0);
  const [mine, setMine] = useState<Record<number, Ans>>({});
  const [theirs, setTheirs] = useState<Record<number, Ans>>({});
  const [count, setCount] = useState(0);
  const [burst, setBurst] = useState(0);
  const room = useRef<DuelRoom | null>(null);
  const t0 = useRef(0);
  const recorded = useRef(false);
  const me: Peer = { id: P.id, nick: P.nick || 'שחקן', host, at: 0 };
  const oppId = useRef<string | null>(null);
  const joinedAt = useRef(0);
  const seats = seated(peers);
  const amSeated = seats.some(p => p.id === P.id);
  // once a match starts the opponent is locked, so nobody who joins later can take their place
  const opp = oppId.current ? peers.find(p => p.id === oppId.current) : seats.find(p => p.id !== P.id);

  useEffect(() => { onPlaying(view === 'match'); }, [view, onPlaying]);
  useEffect(() => () => { room.current?.leave(); onPlaying(false); }, [onPlaying]);

  const onMsg = useCallback((m: DuelMsg) => {
    if (m.type === 'start') {
      if (!m.players.includes(P.id)) return; // not one of the two players
      oppId.current = m.players.find(x => x !== P.id) || null;
      startMatch(m.seed);
    } else if (m.type === 'answer') { if (m.from === oppId.current) setTheirs(t => ({ ...t, [m.i]: { action: m.action, pts: m.pts } })); }
    else if (m.type === 'next') { if (m.from === oppId.current) goHand(m.i); }
    else if (m.type === 'bye') { if (m.from === oppId.current) toast('היריב יצא מהחדר'); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enter = (c: string, asHost: boolean) => {
    room.current?.leave();
    setCode(c); setHost(asHost); setPeers([]); setView('room');
    oppId.current = null; joinedAt.current = Date.now();
    const r = new DuelRoom(c, { id: P.id, nick: P.nick || 'שחקן', host: asHost, at: joinedAt.current }, setPeers, onMsg, setStatus);
    r.join(); room.current = r;
  };

  useEffect(() => { if (initialCode && initialCode.length === 5) enter(initialCode.toUpperCase(), false); /* eslint-disable-next-line */ }, []);

  // the room already has two players: step out so their match is not disturbed
  useEffect(() => {
    if (view === 'room' && peers.length > 2 && !amSeated) { room.current?.leave(); room.current = null; setView('full'); }
  }, [view, peers.length, amSeated]);

  const begin = (round: number) => {
    if (!opp) return;
    const sd = (Math.random() * 2 ** 32) >>> 0;
    oppId.current = opp.id;
    room.current?.send({ type: 'start', seed: sd, round, players: [P.id, opp.id] });
    startMatch(sd);
  };

  const startMatch = (sd: number) => {
    const rng = mulberry32(sd);
    const list: Scenario[] = [];
    for (let k = 0; k < DUEL_HANDS; k++) list.push(makeScenario(DUEL_CFG, rng));
    recorded.current = false;
    track(P, 'duel_start', { host });
    setSeed(sd); setHands(list); setMine({}); setTheirs({}); setI(0); setView('match'); setCount(3);
  };
  const goHand = (k: number) => { setI(k); t0.current = performance.now(); };

  // 3-2-1 countdown, then start the clock
  useEffect(() => {
    if (view !== 'match' || count <= 0) return;
    sfx.tick();
    const id = setTimeout(() => { setCount(c => c - 1); if (count === 1) { t0.current = performance.now(); hands[0]?.board.forEach((_, k) => sfx.deal(k)); } }, 750);
    return () => clearTimeout(id);
  }, [view, count, hands]);

  const s = hands[i];
  const my = mine[i], their = theirs[i];
  const both = !!my && !!their;

  const answer = useCallback((a: Action | 'timeout') => {
    if (!s || mine[i] || count > 0) return;
    const g = grade(s, a);
    const sec = (performance.now() - t0.current) / 1000;
    const base = g === 'g' ? 100 : g === 'c' ? 70 : 0;
    const pts = base ? base + Math.max(0, Math.round(50 * (1 - sec / DUEL_SECONDS))) : 0;
    setMine(m => ({ ...m, [i]: { action: a, pts } }));
    room.current?.send({ type: 'answer', i, action: a, pts, from: P.id });
    update(p => { p.hands++; recordSkill(p, s, g === 'g' ? 100 : g === 'c' ? 70 : 0); if (g !== 'b') p.correct++; else rememberMistake(p, s); });
    if (g === 'g') { sfx.good(); setBurst(b => b + 1); } else if (g === 'c') sfx.close(); else sfx.bad();
  }, [s, mine, i, count, P.id, update]);

  useEffect(() => {
    if (view !== 'match' || count > 0 || !s || mine[i]) return;
    const id = setTimeout(() => answer('timeout'), DUEL_SECONDS * 1000);
    return () => clearTimeout(id);
  }, [view, count, s, i, mine, answer]);

  // the opponent left mid-match
  useEffect(() => {
    if (view === 'match' && !opp && count <= 0) { toast('היריב התנתק'); setView('end'); }
  }, [opp, view, count, toast]);

  const myScore = Object.values(mine).reduce((a, x) => a + x.pts, 0);
  const oppScore = Object.values(theirs).reduce((a, x) => a + x.pts, 0);

  const advance = () => {
    if (i >= DUEL_HANDS - 1) { setView('end'); return; }
    room.current?.send({ type: 'next', i: i + 1, from: P.id });
    goHand(i + 1);
  };

  useEffect(() => {
    if (view !== 'end' || recorded.current || !hands.length) return;
    recorded.current = true;
    const won = myScore > oppScore || !opp;
    const xp = Math.round(myScore * 0.4) + (won ? 150 : 0);
    update(p => { p.xp += xp; if (won) p.wins++; else p.losses++; });
    recordMatch(P, won).catch(() => {});
    track(P, 'duel_end', { won, my: myScore, opp: oppScore, host });
    sync();
    if (won) { sfx.level(); setBurst(b => b + 1); } else sfx.bad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const link = `${PUBLIC_URL}?duel=${code}`;
  const sh = shareLinks(`🃏 ${P.nick || 'חבר'} מזמין אותך לקרב ראש בראש ב-Poker IQ! קוד החדר: ${code}`, link);

  if (view === 'lobby') return (
    <div className="screen">
      <div className="eyebrow">משחקים עם חברים</div>
      <motion.button className="glass cta tablecta" onClick={() => go('table')} whileTap={{ scale: 0.98 }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <span className="cta-art">🎰</span>
        <span className="badge live">חדש</span>
        <span className="cta-t">שולחן פוקר לחברים</span>
        <span className="cta-s">טקסס הולדם אמיתי עד 9 שחקנים: דילר, בליינדים עולים, ריביי ומנהל שולחן</span>
      </motion.button>
      <h1 className="h-lg" style={{ margin: '22px 0 6px' }}>ראש בראש</h1>
      <p className="muted" style={{ marginTop: 0 }}>אתה וחבר מקבלים בדיוק את אותן {DUEL_HANDS} ידיים, באותו זמן. מי שמקבל יותר החלטות נכונות, ומהר יותר, מנצח.</p>
      <motion.div className="glass" style={{ padding: 18, marginBottom: 14, borderRadius: 24 }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h3 className="h-md">פתח חדר חדש</h3>
        <p className="muted" style={{ margin: '4px 0 14px', fontSize: 14 }}>תקבל קישור לשלוח לחבר בוואטסאפ. הוא נכנס ישר מהדפדפן, בלי להתקין כלום.</p>
        <button className="btn violet wide" onClick={() => enter(newCode(), true)}>{I.swords} צור חדר</button>
      </motion.div>
      <motion.div className="glass" style={{ padding: 18, borderRadius: 24 }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
        <h3 className="h-md">יש לך קוד?</h3>
        <div className="field" style={{ marginTop: 12 }}>
          <label htmlFor="joinCode">קוד חדר (5 תווים)</label>
          <input id="joinCode" className="input code-input" maxLength={5} value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="ABCDE" autoComplete="off" />
        </div>
        <button className="btn gold wide" disabled={joinCode.length !== 5} onClick={() => enter(joinCode, false)}>הצטרף</button>
      </motion.div>
    </div>
  );

  if (view === 'full') return (
    <div className="screen">
      <motion.div className="glass empty" style={{ marginTop: 40 }} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
        <div style={{ fontSize: 44 }}>🚪</div>
        <h2 className="h-lg" style={{ margin: '8px 0' }}>החדר הזה מלא</h2>
        <p style={{ marginTop: 0 }}>כבר משחקים בו שני שחקנים. אפשר לפתוח חדר חדש ולהזמין חבר.</p>
        <button className="btn violet wide" onClick={() => setView('lobby')}>לפתיחת חדר חדש</button>
      </motion.div>
    </div>
  );

  if (view === 'room') return (
    <div className="screen">
      <div className="play-top" style={{ marginBottom: 12 }}>
        <button className="icon-btn" onClick={() => { room.current?.leave(); room.current = null; setView('lobby'); }} aria-label="חזרה">{I.back}</button>
        <div className="play-title"><b>חדר ראש בראש</b><span>{status === 'SUBSCRIBED' ? 'מחובר' : 'מתחבר…'}</span></div>
      </div>
      <motion.div className="glass" style={{ padding: 20, textAlign: 'center', borderRadius: 28 }} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
        <div className="eyebrow">קוד החדר</div>
        <div className="room-code shine">{code}</div>
        <div className="slots">
          <div className="glass slot"><div className="avatar">{(P.nick || '?').slice(0, 1)}</div><b>{P.nick || 'אתה'}</b><span className="muted" style={{ fontSize: 12 }}>{host ? 'מארח' : 'אורח'}</span></div>
          <div className="vs-badge gold-text">VS</div>
          <div className="glass slot">
            <AnimatePresence mode="wait">
              {opp ? (
                <motion.div key="opp" initial={{ scale: 0 }} animate={{ scale: 1 }} style={{ display: 'contents' }}>
                  <div className="avatar violet">{opp.nick.slice(0, 1)}</div><b>{opp.nick}</b><span className="muted" style={{ fontSize: 12 }}>מוכן</span>
                </motion.div>
              ) : (
                <motion.div key="wait" style={{ display: 'contents' }}><div className="wait">?</div><b className="muted">מחכה לחבר…</b></motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
        {host && !opp && (
          <>
            <div className="share-row">
              <a className="btn wa" href={sh.wa} target="_blank" rel="noreferrer">{I.wa} וואטסאפ</a>
              <button className="btn" onClick={async () => { if (!(await sh.native())) { (await sh.copy()) ? toast('הקישור הועתק') : toast(link); } }}>{I.share} שיתוף</button>
            </div>
            <button className="btn wide" style={{ marginTop: 10 }} onClick={async () => ((await sh.copy()) ? toast('הקישור הועתק') : toast(link))}>{I.copy} העתק קישור</button>
          </>
        )}
        {host && opp && <motion.button className="btn gold wide" initial={{ scale: 0.8 }} animate={{ scale: 1 }} onClick={() => begin(1)}>התחל קרב</motion.button>}
        {!host && <p className="muted">{opp ? `מחכים ש${opp.nick} יתחיל את הקרב…` : 'מחכה למארח…'}</p>}
      </motion.div>
    </div>
  );

  if (view === 'end') {
    const won = myScore > oppScore || !opp, tie = myScore === oppScore && !!opp;
    return (
      <div className="screen full" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <motion.div className="glass" style={{ padding: 24, textAlign: 'center', borderRadius: 30 }} initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 18 }}>
          <motion.div className="trophy" initial={{ rotateY: 0, scale: 0 }} animate={{ rotateY: 360, scale: 1 }} transition={{ duration: 1.1 }}>{tie ? '🤝' : won ? '🏆' : '🥈'}</motion.div>
          <h1 className="h-xl">{tie ? 'תיקו!' : won ? 'ניצחת!' : `${opp?.nick || 'היריב'} ניצח`}</h1>
          <div className="res-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="stat"><span>{P.nick || 'אתה'}</span><b className="num gold-text">{myScore}</b></div>
            <div className="stat"><span>{opp?.nick || 'היריב'}</span><b className="num">{oppScore}</b></div>
          </div>
          <div className="modal-actions">
            {host && opp && <button className="btn gold wide" onClick={() => begin(2)}>משחק חוזר</button>}
            {!host && opp && <p className="muted" style={{ margin: 0 }}>המארח יכול להתחיל משחק חוזר</p>}
            <a className="btn wa wide" href={shareLinks(`ניצחתי ${myScore}:${oppScore} בקרב פוקר ב-Poker IQ. מי הבא? 😎`, PUBLIC_URL).wa} target="_blank" rel="noreferrer">{I.wa} שתף את התוצאה</a>
            <button className="btn wide" onClick={() => { room.current?.leave(); room.current = null; setView('lobby'); go('duel'); }}>יציאה</button>
          </div>
        </motion.div>
        <Burst fire={burst} />
      </div>
    );
  }

  // match
  return (
    <div className="screen full">
      <div className="glass vs-hud">
        <div className="vs-side"><div className="avatar sm">{(P.nick || '?').slice(0, 1)}</div><div><div className="nm">{P.nick || 'אתה'}</div><div className="sc num gold-text">{myScore}</div></div></div>
        <div className="vs-mid num">{i + 1}/{DUEL_HANDS}</div>
        <div className="vs-side opp"><div className="avatar sm violet">{opp?.nick.slice(0, 1) || '?'}</div><div><div className="nm">{opp?.nick || 'יריב'}</div><div className="sc num">{oppScore}</div><div className="st">{their ? 'ענה ✓' : count > 0 ? '' : 'חושב…'}</div></div></div>
      </div>
      {count <= 0 && !my && <div className="timer"><motion.i key={i} initial={{ scaleX: 1 }} animate={{ scaleX: 0 }} transition={{ duration: DUEL_SECONDS, ease: 'linear' }} /></div>}
      {s && count <= 0 && <Spot s={s} k={`${seed}-${i}`} onAct={answer} picked={my?.action} locked={!!my} />}
      {my && !both && <motion.div className="glass" style={{ padding: 14, textAlign: 'center', marginTop: 12, borderRadius: 18 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>ענית! מחכים ל{opp?.nick || 'יריב'}…</motion.div>}
      <AnimatePresence>
        {count > 0 && (
          <motion.div key={count} className="scrim" style={{ display: 'grid', placeItems: 'center' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="shine" style={{ fontSize: 120, fontWeight: 900 }} initial={{ scale: 2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }}>{count}</motion.div>
          </motion.div>
        )}
        {both && s && (
          <Feedback key={'dfb' + i} s={s} chosen={my.action} g={grade(s, my.action)} pts={my.pts}
            onNext={advance} nextDisabled={!host && i < DUEL_HANDS - 1}
            nextLabel={i >= DUEL_HANDS - 1 ? 'לתוצאות' : host ? 'יד הבאה' : `מחכה ל${opp?.nick || 'מארח'}…`}
            extra={<div className="box"><div className="box-t">{opp?.nick || 'היריב'} בחר</div><b>{their.action === 'timeout' ? 'לא הספיק לענות' : ACT_NAME[their.action]}</b> · <span className="num">+{their.pts}</span> {grade(s, their.action) === 'g' ? '✓' : grade(s, their.action) === 'c' ? '≈' : '✗'}</div>} />
        )}
      </AnimatePresence>
      <Burst fire={burst} />
    </div>
  );
}
