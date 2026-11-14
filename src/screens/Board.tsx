import { LayoutGroup, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { LEVEL_NAMES, levelOf } from '../game/worlds';
import { leaderboard, type Row } from '../net/supabase';
import { useApp } from '../ui/ctx';
import { I } from '../ui/Icons';

export function Rows({ rows, err, meId, val, sub, empty }: { rows: Row[] | null; err: boolean; meId: string; val: (r: Row) => number; sub: (r: Row) => string; empty: string }) {
  if (err) return <div className="glass empty">אין חיבור לדירוג כרגע. בדוק שיש אינטרנט ונסה שוב.</div>;
  if (!rows) return <div className="glass empty">טוען…</div>;
  if (!rows.length) return <div className="glass empty">{empty}</div>;
  return (
    <div className="rows">
      {rows.map((r, k) => (
        <motion.div key={r.id} layout className={`glass row ${r.id === meId ? 'me' : ''}`} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(k, 12) * 0.04 }}>
          <span className={`rank ${k < 3 ? 'm' + (k + 1) : ''}`}>{k + 1}</span>
          <div className={`avatar sm ${k % 2 ? 'violet' : ''}`}>{r.nickname.slice(0, 1)}</div>
          <div className="who"><b>{r.nickname}{r.id === meId ? ' (אתה)' : ''}</b><span>{sub(r)}</span></div>
          <span className="val num">{val(r).toLocaleString('he-IL')}</span>
        </motion.div>
      ))}
    </div>
  );
}

const TABS = [{ k: 'xp', t: 'ניקוד כולל' }, { k: 'daily', t: 'היום' }, { k: 'wins', t: 'ניצחונות' }] as const;
export function Board() {
  const { P, sync } = useApp();
  const [tab, setTab] = useState<'xp' | 'daily' | 'wins'>('xp');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState(false);
  const load = () => { setRows(null); setErr(false); leaderboard(tab).then(setRows).catch(() => setErr(true)); };
  useEffect(() => { sync(); }, [sync]);
  useEffect(load, [tab]);
  return (
    <div className="screen">
      <div className="sec-title" style={{ marginBottom: 14 }}><h1 className="h-xl">דירוג</h1><button className="icon-btn" onClick={load} aria-label="רענון">{I.refresh}</button></div>
      <LayoutGroup>
        <div className="glass seg" role="tablist">
          {TABS.map(x => (
            <button key={x.k} role="tab" aria-selected={tab === x.k} className={tab === x.k ? 'on' : ''} onClick={() => setTab(x.k)}>
              {tab === x.k && <motion.span layoutId="segpill" className="pill" />}{x.t}
            </button>
          ))}
        </div>
      </LayoutGroup>
      <Rows rows={rows} err={err} meId={P.id}
        val={r => (tab === 'xp' ? r.xp : tab === 'daily' ? r.daily_score : r.wins)}
        sub={r => (tab === 'xp' ? `רמה ${levelOf(r.xp) + 1} · ${LEVEL_NAMES[levelOf(r.xp)]} · ${r.hands ? Math.round((r.correct / r.hands) * 100) : 0}% דיוק` : tab === 'daily' ? r.daily_squares : `${r.wins} ניצחונות · ${r.losses} הפסדים`)}
        empty={tab === 'daily' ? 'עוד אף אחד לא שיחק את האתגר היום.' : tab === 'wins' ? 'עוד אין ניצחונות בראש בראש. אתגר חבר!' : 'עוד אין שחקנים. סיים שלב ותופיע כאן.'} />
    </div>
  );
}
