import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { RN, SUITS } from '../engine/cards';
import { actName, explain, POS_NAME, STREET_NAME, type Action, type Scenario } from '../engine/scenarios';
import { askCoach, track } from '../net/supabase';
import { useApp } from './ctx';

const card = (c: number) => RN[c >> 2] + SUITS[c & 3];
const strip = (t: string) => t.replace(/\{\{(\w+)\|?([^}]*)\}\}/g, (_, k, l) => l || k);
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Compact, factual description of the spot for the language model. */
function describe(s: Scenario, chosen: Action | 'timeout') {
  const e = explain(s, chosen);
  return [
    `שלב: ${STREET_NAME[s.street]}. עמדה: ${POS_NAME[s.heroPos]} (${s.heroPos}), ${s.ip ? 'עם מיקום' : 'בלי מיקום'}. יריבים ביד: ${s.n}.`,
    `קלפים ביד: ${s.hero.map(card).join(' ')}. שולחן: ${s.board.map(card).join(' ') || 'אין עדיין'}. מה יש לשחקן: ${s.made.name}${s.draw ? `, ${s.draw.plain} (${s.draw.outs} אאוטים)` : ''}.`,
    `מה קרה: ${strip(e.summary)}`,
    `קופה: ${s.pot}. לשלם: ${s.toCall}.`,
    s.kind === 'open' ? `ציון היד בנוסחת צ'ן: ${s.meta.chen}, מינימום לפתיחה מהעמדה: ${s.meta.openThr}.`
      : `אקוויטי לפי המנוע: ${pct(s.eq)}${s.R < 1 ? `, אחרי תיקון מיקום ${pct(s.eff)}` : ''}. נדרש לקול: ${s.toCall ? pct(s.need) : 'אין'}. סף לרייז/הימור: ${pct(s.raiseThr)}.`,
    `הפעולה הנכונה לפי המנוע: ${actName(s, s.correct)}. השחקן בחר: ${chosen === 'timeout' ? 'לא הספיק לענות' : actName(s, chosen)}.`
  ].join('\n');
}

export function Coach({ s, chosen }: { s: Scenario; chosen: Action | 'timeout' }) {
  const { P } = useApp();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const chips = [
    chosen !== s.correct && chosen !== 'timeout' ? `למה לא ${actName(s, chosen)}?` : `למה ${actName(s, s.correct)} ולא משהו אחר?`,
    'מה היריב יכול להחזיק פה?',
    'איך שחקן מקצועי היה חושב פה?',
    'מה היה משנה את ההחלטה?'
  ];
  const ask = async (question: string) => {
    if (!question.trim() || busy) return;
    setBusy(true); setAnswer(null); setNote('');
    const r = await askCoach(P, describe(s, chosen), question.trim());
    setBusy(false);
    track(P, 'coach_ask', { ok: r.ok, reason: r.ok ? '' : r.reason, kind: s.kind });
    if (r.ok) { setAnswer(r.answer); setNote(r.left <= 3 ? `נשארו לך ${r.left} שאלות היום` : ''); }
    else setNote(r.reason === 'not_configured' ? 'המאמן החכם עוד לא הופעל בשרת. הוא יעבוד ברגע שיוגדר מפתח AI.' : r.reason === 'limit' ? 'נגמרו השאלות להיום. מחר יש עוד.' : 'לא הצלחתי לקבל תשובה. בדוק שיש אינטרנט ונסה שוב.');
  };
  return (
    <div className="coach">
      {!open ? (
        <button className="btn wide coach-open" onClick={() => setOpen(true)}>🤖 שאל את המאמן</button>
      ) : (
        <motion.div className="box coach-box" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <div className="box-t">🤖 המאמן החכם</div>
          <div className="coach-chips">{chips.map(c => <button key={c} className="chip" onClick={() => { setQ(c); ask(c); }} disabled={busy}>{c}</button>)}</div>
          <form className="coach-form" onSubmit={e => { e.preventDefault(); ask(q); }}>
            <input className="input" value={q} onChange={e => setQ(e.target.value)} maxLength={300} placeholder="או כתוב שאלה משלך…" aria-label="שאלה למאמן" />
            <button className="btn gold" disabled={busy || !q.trim()}>{busy ? '…' : 'שאל'}</button>
          </form>
          <AnimatePresence>
            {busy && <motion.p className="muted coach-thinking" initial={{ opacity: 0 }} animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1.4 }}>המאמן חושב…</motion.p>}
            {answer && <motion.p className="coach-answer" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>{answer}</motion.p>}
          </AnimatePresence>
          {note && <p className="muted coach-note">{note}</p>}
        </motion.div>
      )}
    </div>
  );
}
