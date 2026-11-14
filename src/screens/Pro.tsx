import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { hashStr } from '../engine/cards';
import { joinWaitlist, track } from '../net/supabase';
import { useApp } from '../ui/ctx';
import { I } from '../ui/Icons';

type Tier = 'plus' | 'pro' | 'elite';
// Each player sees one price per tier, picked from their id, so we learn what people would actually pay.
const PRICES: Record<Tier, number[]> = { plus: [29, 39, 49], pro: [79, 99, 129], elite: [199, 249, 299] };
const TIERS: { k: Tier; name: string; who: string; feats: string[]; hue: string }[] = [
  { k: 'plus', name: 'Plus', who: 'לשחקן שרוצה להפסיק לטעות', hue: '67,240,195',
    feats: ['כל העולמות והשלבים', 'חזרה מרווחת על כל הטעויות', 'מפת דליפות ואימון ממוקד בלי הגבלה', '30 שאלות ביום למאמן החכם'] },
  { k: 'pro', name: 'Pro', who: 'לשחקן קבוע שרוצה לנצח יותר', hue: '139,108,255',
    feats: ['הכול ב-Plus', 'ניתוח הידיים שלך מסשן שנגמר', 'מאמן AI בלי הגבלה', 'דוח שבועי: איפה אתה מפסיד כסף'] },
  { k: 'elite', name: 'Elite', who: 'לשחקן רציני ומקצועי', hue: '246,199,90',
    feats: ['הכול ב-Pro', 'ספריית פתרונות סולבר', 'תרגול טווחי ידיים מלאים', 'גדלי הימור ועומקי ערימה שונים'] }
];

export function Pro() {
  const { P, go, toast } = useApp();
  const price = useMemo(() => {
    const h = hashStr(P.id);
    return { plus: PRICES.plus[h % 3], pro: PRICES.pro[(h >> 3) % 3], elite: PRICES.elite[(h >> 6) % 3] } as Record<Tier, number>;
  }, [P.id]);
  const [pickTier, setPickTier] = useState<Tier | null>(null);
  const [contact, setContact] = useState('');
  const [done, setDone] = useState(false);
  useEffect(() => { track(P, 'pro_view', price); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (!pickTier) return;
    try {
      await joinWaitlist(P, pickTier, `${price[pickTier]}₪`, contact);
      track(P, 'pro_waitlist', { tier: pickTier, price: price[pickTier] });
      setDone(true);
    } catch { toast('לא הצלחתי לשמור. בדוק שיש אינטרנט ונסה שוב.'); }
  };

  return (
    <div className="screen">
      <div className="play-top" style={{ marginBottom: 12 }}>
        <button className="icon-btn" onClick={() => go('profile')} aria-label="חזרה">{I.back}</button>
        <div className="play-title"><b>Poker IQ Pro</b><span>בבנייה עכשיו</span></div>
      </div>
      <h1 className="h-xl shine" style={{ margin: '4px 0 6px' }}>לשחק כמו מקצוען</h1>
      <p className="muted" style={{ marginTop: 0 }}>המסלולים בתשלום עוד לא זמינים. בחר מה היה מעניין אותך, ונעדכן אותך כשזה מוכן. אין התחייבות ולא גובים כלום.</p>
      <div className="tiers">
        {TIERS.map((t, k) => (
          <motion.button key={t.k} className={`glass tier ${pickTier === t.k ? 'on' : ''}`} style={{ '--tier': t.hue } as React.CSSProperties}
            onClick={() => { setPickTier(t.k); track(P, 'pro_pick', { tier: t.k, price: price[t.k] }); }}
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: k * 0.08 }} whileTap={{ scale: 0.98 }}>
            <div className="tier-head"><b>{t.name}</b><span className="num">₪{price[t.k]}<small> לחודש</small></span></div>
            <div className="tier-who">{t.who}</div>
            <ul>{t.feats.map(f => <li key={f}>{f}</li>)}</ul>
          </motion.button>
        ))}
      </div>
      {pickTier && !done && (
        <motion.div className="glass" style={{ padding: 16, borderRadius: 22, marginTop: 14 }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="field">
            <label htmlFor="contact">איך לעדכן אותך? (מייל או טלפון, לא חובה)</label>
            <input id="contact" className="input" value={contact} onChange={e => setContact(e.target.value)} maxLength={120} placeholder="לא חובה" autoComplete="email" />
          </div>
          <button className="btn gold wide" onClick={submit}>הוסף אותי לרשימת ההמתנה</button>
          <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>הפרטים משמשים רק כדי לעדכן אותך על Poker IQ.</p>
        </motion.div>
      )}
      {done && <motion.div className="glass empty" style={{ marginTop: 14 }} initial={{ scale: 0.9 }} animate={{ scale: 1 }}>✓ נרשמת. תודה! עזרת לנו להחליט מה לבנות קודם.</motion.div>}
    </div>
  );
}
