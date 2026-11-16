import { motion } from 'framer-motion';
import { useState } from 'react';
import { blank, leaks } from '../game/progress';
import { LEVEL_NAMES, levelOf } from '../game/worlds';
import { PUBLIC_URL } from '../net/supabase';
import { useApp } from '../ui/ctx';
import { I } from '../ui/Icons';
import { shareLinks } from './Duel';

export function Profile() {
  const { P, update, toast, sync, go } = useApp();
  const [nick, setNick] = useState(P.nick);
  const [arm, setArm] = useState(false);
  const lv = levelOf(P.xp);
  const stars = Object.values(P.stars).reduce((a, b) => a + b, 0);
  const sh = shareLinks('🃏 מצאתי משחק שמלמד לקבל החלטות פוקר כמו מקצוען. בוא נראה מי יותר טוב:', PUBLIC_URL);
  return (
    <div className="screen">
      <div style={{ textAlign: 'center', marginBottom: 18 }}>
        <motion.div className="avatar" style={{ width: 86, height: 86, fontSize: 38, margin: '6px auto 10px' }} initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }}>{(P.nick || '?').slice(0, 1)}</motion.div>
        <h1 className="h-lg">{P.nick}</h1>
        <div className="muted">רמה {lv + 1} · {LEVEL_NAMES[lv]}</div>
      </div>
      <div className="pgrid">
        <div className="glass stat"><span>XP</span><b className="num">{P.xp.toLocaleString('he-IL')}</b></div>
        <div className="glass stat"><span>דיוק</span><b className="num">{P.hands ? Math.round((P.correct / P.hands) * 100) : 0}%</b></div>
        <div className="glass stat"><span>ידיים</span><b className="num">{P.hands}</b></div>
        <div className="glass stat"><span>כוכבים</span><b className="num">{stars}</b></div>
        <div className="glass stat"><span>ניצחונות</span><b className="num">{P.wins}</b></div>
        <div className="glass stat"><span>רצף יומי</span><b className="num">{P.dailyStreak}🔥</b></div>
      </div>
      <div className="sec-title"><h2 className="h-md">מפת הדליפות שלי</h2><span className="muted" style={{ fontSize: 12 }}>איפה אתה מפסיד נקודות</span></div>
      {(() => {
        const L = leaks(P);
        if (L.length < 2) return <div className="glass empty" style={{ marginBottom: 16 }}>שחק עוד קצת ({Math.max(0, 25 - P.hands)} ידיים בערך) ותראה כאן את החולשות והחוזקות שלך, עם אימון ממוקד לכל אחת.</div>;
        const weak = L.slice(0, 4), strong = L.slice(-2).reverse();
        const col = (a: number) => (a >= 80 ? 'var(--good)' : a >= 60 ? 'var(--close)' : 'var(--bad)');
        return (
          <div style={{ marginBottom: 16 }}>
            {weak.map(l => (
              <div key={l.key} className="glass leak">
                <div><b>{l.name}</b><div className="muted" style={{ fontSize: 12 }}>{l.hands} ידיים</div></div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span className="acc num" style={{ color: col(l.acc) }}>{l.acc}%</span>
                  <button className="btn gold" onClick={() => go('play', { mode: 'drill', drill: l.key })}>אמן</button>
                </div>
                <div className="bar"><i style={{ width: `${l.acc}%`, background: col(l.acc) }} /></div>
              </div>
            ))}
            {strong[0] && strong[0].acc >= 75 && <p className="muted" style={{ fontSize: 13, margin: '4px 4px 0' }}>💪 הכי חזק אצלך: {strong.map(x => `${x.name} (${x.acc}%)`).join(' · ')}</p>}
          </div>
        );
      })()}
      <button className="glass list-btn" onClick={() => go('pro')} style={{ background: 'linear-gradient(135deg, rgba(246,199,90,.18), rgba(139,108,255,.12))' }}>
        <span>✨ Poker IQ Pro: ניתוח ידיים, מאמן AI ופתרונות סולבר</span><span style={{ width: 20 }}>{I.back}</span>
      </button>
      <div className="field">
        <label htmlFor="nick">הכינוי שלך</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input id="nick" className="input" maxLength={18} value={nick} onChange={e => setNick(e.target.value)} />
          <button className="btn gold" disabled={!nick.trim() || nick.trim() === P.nick} onClick={() => { update(p => { p.nick = nick.trim().slice(0, 18); }); sync(); toast('הכינוי עודכן'); }}>שמור</button>
        </div>
      </div>
      <button className="glass list-btn" onClick={() => update(p => { p.sound = !p.sound; })} role="switch" aria-checked={P.sound}>
        <span>צלילים ורטט</span><span className={`switch ${P.sound ? 'on' : ''}`}><i /></span>
      </button>
      <a className="glass list-btn" href={sh.wa} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}><span>הזמן חברים בוואטסאפ</span><span style={{ width: 22, color: '#3be37a' }}>{I.wa}</span></a>
      <div className="glass list-btn" style={{ display: 'block', fontWeight: 400 }}>
        <b style={{ display: 'block', marginBottom: 4 }}>שמירת התקדמות</b>
        <span className="muted" style={{ fontSize: 13.5 }}>ההתקדמות נשמרת במכשיר ובדירוג. התחברות עם Google או Apple, כדי להעביר אותה בין מכשירים, תגיע בעדכון הבא.</span>
      </div>
      <button className="glass list-btn" style={{ color: arm ? 'var(--bad)' : 'var(--text-2)' }}
        onClick={() => { if (!arm) { setArm(true); setTimeout(() => setArm(false), 4000); return; } update(p => { Object.assign(p, blank(), { id: p.id, secret: p.secret, nick: p.nick, onboarded: true }); }); sync(); setArm(false); toast('ההתקדמות אופסה'); }}>
        <span>{arm ? 'בטוח? לחץ שוב כדי למחוק הכול' : 'איפוס התקדמות'}</span>
      </button>
      <p className="muted" style={{ fontSize: 12, textAlign: 'center', marginTop: 18 }}>Poker IQ הוא משחק אימון. אין בו כסף אמיתי ואין בו הימורים.</p>
    </div>
  );
}
