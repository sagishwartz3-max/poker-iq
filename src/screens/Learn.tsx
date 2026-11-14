import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { GLOSSARY, GROUP_NAMES, type Term } from '../engine/glossary';
import { Rich } from '../ui/Rich';

export function Learn() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const entries = Object.entries(GLOSSARY).filter(([, t]) => !q || t.he.includes(q) || t.en.toLowerCase().includes(q.toLowerCase()) || t.def.includes(q));
  const groups = Object.keys(GROUP_NAMES) as Term['group'][];
  return (
    <div className="screen">
      <div className="eyebrow">מילון פוקר</div>
      <h1 className="h-xl" style={{ margin: '4px 0 6px' }}>כל המושגים, במילים פשוטות</h1>
      <p className="muted" style={{ marginTop: 0 }}>בכל מקום במשחק אפשר ללחוץ על <span className="term">מילה מסומנת</span> ולקבל הסבר.</p>
      <motion.div className="glass" style={{ padding: 16, borderRadius: 22, marginBottom: 16 }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h3 className="h-md" style={{ marginBottom: 6 }}>איך המאמן מחליט?</h3>
        <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.7 }}>
          <Rich text="בכל יד המאמן משחק את המשך היד אלפי פעמים בראש, ובודק כמה פעמים היד שלך מנצחת ({{equity}}). אחר כך הוא משווה את זה למחיר שתשלם ({{potodds}}) ולעמדה שלך ({{position}}). אם אתה מנצח מספיק כדי שזה ישתלם, הוא ממליץ להמשיך. אם אתה מנצח הרבה, הוא ממליץ להעלות." />
        </p>
      </motion.div>
      <input className="input gl-search" placeholder="חיפוש: לימפ, פלופ, אאוטים…" value={q} onChange={e => setQ(e.target.value)} aria-label="חיפוש מושג" />
      {groups.map(g => {
        const list = entries.filter(([, t]) => t.group === g);
        if (!list.length) return null;
        return (
          <div className="gl-group" key={g}>
            <h3>{GROUP_NAMES[g]}</h3>
            {list.map(([k, t]) => (
              <motion.button key={k} layout className="glass gl-item" onClick={() => setOpen(open === k ? null : k)} aria-expanded={open === k}>
                <div className="t"><b>{t.he}</b><span className="en">{t.en}</span></div>
                <AnimatePresence initial={false}>
                  {(open === k || q) && <motion.p initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>{t.def}</motion.p>}
                </AnimatePresence>
              </motion.button>
            ))}
          </div>
        );
      })}
    </div>
  );
}
