import { motion } from 'framer-motion';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { BLINDS } from '../engine/holdem';
import { createClub, getClub, joinClub, leaveClub, myClubs, setMember, type Club, type ClubRow } from '../net/clubs';
import { PUBLIC_URL } from '../net/supabase';
import { shareLinks } from '../screens/Duel';
import { useApp } from './ctx';
import { I } from './Icons';

const fmt = (n: number) => n.toLocaleString('he-IL');
const ROLE: Record<string, string> = { owner: 'בעלים', manager: 'מנהל', member: '' };
export const clubLink = (code: string) => `${PUBLIC_URL}?club=${code}`;

/** "My clubs": the clubs I'm in, open a club, join one with a code. */
export function ClubList({ onOpen, initialJoin }: { onOpen: (id: string) => void; initialJoin?: string }) {
  const { P, toast } = useApp();
  const [rows, setRows] = useState<ClubRow[] | null>(null);
  const [mode, setMode] = useState<'' | 'new' | 'join'>(initialJoin ? 'join' : '');
  const [name, setName] = useState('');
  const [code, setCode] = useState(initialJoin || '');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { const r = await myClubs(P); if (typeof r !== 'string') setRows(r); }, [P]);
  useEffect(() => { void load(); }, [load]);
  const join = async (c: string) => {
    if (busy) return; setBusy(true);
    const r = await joinClub(P, c); setBusy(false);
    if (typeof r === 'string') { toast(r); return; }
    toast(`הצטרפת למועדון ${r.name}`); onOpen(r.id);
  };
  // arrived with an invite link: join straight away
  useEffect(() => { if (initialJoin && initialJoin.length === 6) void join(initialJoin); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const create = async () => {
    if (busy) return; setBusy(true);
    const r = await createClub(P, name.trim()); setBusy(false);
    if (typeof r === 'string') { toast(r); return; }
    toast('המועדון נפתח. עכשיו שלח לחברים את ההזמנה'); onOpen(r.id);
  };
  return (
    <motion.div className="glass club-box" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <h3 className="h-md">המועדונים שלי</h3>
      {rows === null ? <p className="muted club-empty">טוען…</p>
        : rows.length === 0 ? <p className="muted club-empty">עוד אין לך מועדון. פתח מועדון לחבר׳ה, או הצטרף עם קוד שקיבלת.</p>
        : <div className="club-list">{rows.map(c => (
          <button key={c.id} className="club-row" onClick={() => onOpen(c.id)}>
            <span className="club-ava" aria-hidden="true">{c.name.trim().charAt(0)}</span>
            <span className="club-info"><b>{c.name}</b><span>{c.members} חברים{ROLE[c.role] ? ` · ${ROLE[c.role]}` : ''}</span></span>
            <span className={`club-live ${c.tables ? 'on' : ''}`}>{c.tables === 1 ? 'שולחן פעיל' : c.tables ? `${c.tables} שולחנות פעילים` : 'אין שולחן פעיל'}</span>
          </button>))}</div>}
      {mode === 'new' ? (
        <div className="club-form">
          <div className="field"><label htmlFor="cname">שם המועדון</label>
            <input id="cname" className="input" maxLength={30} value={name} onChange={e => setName(e.target.value)} placeholder="למשל: הפוקר של שישי" autoComplete="off" /></div>
          <div className="club-actions">
            <button className="btn gold" disabled={busy || name.trim().length < 2} onClick={create}>פתח מועדון</button>
            <button className="btn" onClick={() => setMode('')}>ביטול</button>
          </div>
        </div>
      ) : mode === 'join' ? (
        <div className="club-form">
          <div className="field"><label htmlFor="ccode">קוד מועדון (6 תווים)</label>
            <input id="ccode" className="input code-input" maxLength={6} value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="ABC123" autoComplete="off" /></div>
          <div className="club-actions">
            <button className="btn violet" disabled={busy || code.length !== 6} onClick={() => join(code)}>הצטרף למועדון</button>
            <button className="btn" onClick={() => setMode('')}>ביטול</button>
          </div>
        </div>
      ) : (
        <div className="club-actions">
          <button className="btn gold" onClick={() => setMode('new')}>פתח מועדון</button>
          <button className="btn violet" onClick={() => setMode('join')}>הצטרף עם קוד</button>
        </div>
      )}
    </motion.div>
  );
}

/** One club: its live tables (enter one), opening a table (owner and managers), invite, members. */
export function ClubView({ id, onBack, onEnter, onOpenTable, settings, busy }: {
  id: string; onBack: () => void; onEnter: (code: string, club: Club) => void; onOpenTable: (club: Club) => void; settings: ReactNode; busy: boolean;
}) {
  const { P, toast } = useApp();
  const [club, setClub] = useState<Club | null>(null);
  const [newTable, setNewTable] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const load = useCallback(async () => {
    const r = await getClub(P, id);
    if (typeof r === 'string') { toast(r); onBack(); return; }
    setClub(r);
  }, [P, id]); // eslint-disable-line react-hooks/exhaustive-deps
  // the table list stays live while the club is open (and the screen is on)
  useEffect(() => {
    void load();
    const t = setInterval(() => { if (!document.hidden) void load(); }, 5000);
    return () => clearInterval(t);
  }, [load]);
  if (!club) return <div className="screen"><div className="play-top"><button className="icon-btn" onClick={onBack} aria-label="חזרה">{I.back}</button><div className="play-title"><b>מועדון</b><span>טוען…</span></div></div></div>;
  const boss = club.role === 'owner' || club.role === 'manager';
  const link = clubLink(club.code);
  const sh = shareLinks(`🃏 ${P.nick || 'חבר'} מזמין אותך למועדון "${club.name}" ב-Poker IQ. קוד המועדון: ${club.code}`, link);
  const member = async (pid: string, role: 'manager' | 'member' | 'remove') => {
    const e = await setMember(P, club.id, pid, role);
    if (e) toast(e); else { toast(role === 'remove' ? 'השחקן הוצא מהמועדון' : role === 'manager' ? 'מונה למנהל' : 'כבר לא מנהל'); void load(); }
  };
  const leave = async () => {
    if (!confirmLeave) { setConfirmLeave(true); return; }
    const e = await leaveClub(P, club.id);
    if (e) toast(e); else { toast(club.role === 'owner' ? 'המועדון נסגר' : 'יצאת מהמועדון'); onBack(); }
  };
  return (
    <div className="screen">
      <div className="play-top" style={{ marginBottom: 12 }}>
        <button className="icon-btn" onClick={onBack} aria-label="חזרה">{I.back}</button>
        <div className="play-title"><b>{club.name}</b><span>{club.members.length} חברים · קוד {club.code}</span></div>
      </div>

      <div className="glass club-box">
        <h3 className="h-md">שולחנות פעילים</h3>
        {club.tables.length === 0
          ? <p className="muted club-empty">{boss ? 'אין שולחן פתוח כרגע. פתח שולחן, וכל חברי המועדון יראו אותו כאן.' : 'אין שולחן פתוח כרגע. כשמנהל המועדון יפתח שולחן, הוא יופיע כאן.'}</p>
          : <div className="club-list">{club.tables.map(t => {
            const bb = t.bb ?? BLINDS[0][1], cfg = t.cfg ?? {};
            const state = t.phase === 'lobby' && !t.hand ? 'מחכים להתחלה' : `משחקים · יד ${t.hand}`;
            return (
              <div key={t.code} className="club-table">
                <div className="club-info"><b>השולחן של {t.host}</b>
                  <span>{state} · בליינדים {bb / 2}/{bb}{cfg.stack ? ` · ${fmt(cfg.stack)} ז׳יטונים` : ''}{cfg.buyIn ? ` · כניסה ${fmt(cfg.buyIn)} מטבעות` : ''}</span></div>
                <span className="club-seats num">{t.seated}/9</span>
                <button className="btn gold sm" disabled={busy || t.seated >= 9} onClick={() => onEnter(t.code, club)}>{t.seated >= 9 ? 'מלא' : 'היכנס'}</button>
              </div>);
          })}</div>}
        {boss && (newTable
          ? <div className="club-form">{settings}
              <div className="club-actions">
                <button className="btn gold" disabled={busy} onClick={() => onOpenTable(club)}>פתח שולחן במועדון</button>
                <button className="btn" onClick={() => setNewTable(false)}>ביטול</button>
              </div></div>
          : <button className="btn gold wide" style={{ marginTop: 12 }} onClick={() => setNewTable(true)}>פתח שולחן חדש</button>)}
      </div>

      <div className="glass club-box">
        <h3 className="h-md">הזמנת חברים</h3>
        <p className="muted club-empty">כל מי שמקבל את הקישור או את הקוד נכנס למועדון ורואה את השולחנות.</p>
        <div className="club-code num" dir="ltr">{club.code}</div>
        <div className="club-actions">
          <a className="btn violet" href={sh.wa} target="_blank" rel="noreferrer">שלח בוואטסאפ</a>
          <button className="btn" onClick={async () => { if (!(await sh.native())) toast((await sh.copy()) ? 'ההזמנה הועתקה' : link); }}>שתף / העתק</button>
        </div>
      </div>

      <div className="glass club-box">
        <h3 className="h-md">חברי המועדון</h3>
        <div className="club-list">{club.members.map(m => (
          <div key={m.id} className="club-member">
            <span className="club-ava sm" aria-hidden="true">{m.nick.trim().charAt(0) || '?'}</span>
            <span className="club-info"><b>{m.id === P.id ? `${m.nick} (אני)` : m.nick}</b>{ROLE[m.role] && <span>{ROLE[m.role]}</span>}</span>
            {club.role === 'owner' && m.role !== 'owner' && <span className="club-mbtns">
              <button className="btn sm" onClick={() => member(m.id, m.role === 'manager' ? 'member' : 'manager')}>{m.role === 'manager' ? 'הסר מנהל' : 'מנה למנהל'}</button>
              <button className="btn sm danger" onClick={() => member(m.id, 'remove')}>הוצא</button>
            </span>}
          </div>))}</div>
      </div>

      <button className={`btn wide ${confirmLeave ? 'danger' : ''}`} style={{ marginTop: 6 }} onClick={leave}>
        {club.role === 'owner' ? (confirmLeave ? 'לחץ שוב כדי לסגור את המועדון לכולם' : 'סגור את המועדון') : (confirmLeave ? 'לחץ שוב כדי לצאת' : 'צא מהמועדון')}
      </button>
      <p className="muted" style={{ fontSize: 12, textAlign: 'center', marginTop: 14 }}>משחקים על ז׳יטונים וירטואליים בלבד. אין באפליקציה כסף אמיתי.</p>
    </div>
  );
}
