import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { today } from '../game/progress';
import { leaderboard, PUBLIC_URL, type Row } from '../net/supabase';
import { useApp } from '../ui/ctx';
import { I } from '../ui/Icons';
import { shareLinks } from './Duel';
import { Rows } from './Board';

export function Daily() {
  const { P, go, toast } = useApp();
  const done = P.daily?.date === today();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => { leaderboard('daily').then(setRows).catch(() => setErr(true)); }, [done]);
  const date = new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
  const text = done ? `🃏 Poker IQ · אתגר יומי ${new Date().toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })}\n${P.daily!.score} נקודות\n${P.daily!.squares}\nתנצחו אותי?` : '';
  const sh = shareLinks(text, PUBLIC_URL);
  return (
    <div className="screen">
      <div className="play-top" style={{ marginBottom: 14 }}>
        <button className="icon-btn" onClick={() => go('home')} aria-label="חזרה">{I.back}</button>
        <div className="play-title"><b>אתגר יומי</b><span>{date}</span></div>
      </div>
      <motion.div className="glass" style={{ padding: 22, borderRadius: 28, marginBottom: 20, background: 'radial-gradient(120% 90% at 100% 0%, rgba(246,199,90,.25), transparent 55%), linear-gradient(160deg, rgba(255,255,255,.1), rgba(255,255,255,.02))' }}
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        {!done ? (
          <>
            <div className="eyebrow">{P.dailyStreak > 0 ? `🔥 ${P.dailyStreak} ימים ברצף` : 'ניסיון אחד ביום'}</div>
            <h2 className="h-lg" style={{ margin: '6px 0 8px' }}>10 ידיים. אותן ידיים לכולם.</h2>
            <p className="muted" style={{ marginTop: 0 }}>החלטה נכונה = 100, החלטה סבירה = 70, ומי שעונה מהר מקבל עד 50 נקודות בונוס. מקסימום: 1,500.</p>
            <button className="btn gold wide" onClick={() => go('play', { mode: 'daily' })}>התחל את האתגר</button>
          </>
        ) : (
          <>
            <div className="eyebrow">הושלם היום ✓</div>
            <div className="h-xl num shine" style={{ margin: '6px 0 4px' }}>{P.daily!.score}</div>
            <div style={{ fontSize: 24, letterSpacing: 3, margin: '4px 0 14px' }}>{P.daily!.squares}</div>
            <p className="muted" style={{ marginTop: 0 }}>אתגר חדש מחכה מחר. בינתיים, שלח לחברים ותראה מי יותר חזק.</p>
            <div className="share-row">
              <a className="btn wa" href={sh.wa} target="_blank" rel="noreferrer">{I.wa} וואטסאפ</a>
              <button className="btn" onClick={async () => ((await sh.copy()) ? toast('הועתק! הדבק בקבוצה') : toast('לא הצלחתי להעתיק'))}>{I.copy} העתק</button>
            </div>
          </>
        )}
      </motion.div>
      <div className="sec-title"><h2 className="h-md">הטובים של היום</h2></div>
      <Rows rows={rows} err={err} meId={P.id} val={r => r.daily_score} sub={r => r.daily_squares} empty="עוד אף אחד לא שיחק היום. תהיה הראשון!" />
    </div>
  );
}
