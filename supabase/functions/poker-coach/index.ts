// Poker IQ "Ask the coach": explains a finished training spot in plain Hebrew.
// Secrets (set in Supabase → Edge Functions → Secrets, never in the app):
//   OPENROUTER_API_KEY   required
//   OPENROUTER_MODEL     optional, any OpenRouter model id (default below)
//   COACH_DAILY_LIMIT    optional, questions per player per day (default 15)
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const SYSTEM = `אתה מאמן פוקר (טקסס הולדם) סבלני ומקצועי באפליקציית אימון בשם Poker IQ. אין באפליקציה כסף אמיתי.
אתה מקבל יד אימון שהשחקן כבר סיים, כולל המספרים שהמנוע חישב, ושאלה של השחקן.
כללים:
- ענה בעברית פשוטה, כאילו אתה מסביר לחבר. מילים מקצועיות מותר, אבל הסבר אותן בכמה מילים.
- קצר: עד 120 מילים, 2–4 משפטים או נקודות קצרות.
- התבסס על המספרים שקיבלת (אקוויטי, סיכויי קופה, עמדה). אל תמציא מספרים אחרים.
- אם השחקן שואל איך שחקנים מקצועיים חושבים, תן עיקרון כללי ומוכר (מיקום, טווחי ידיים, גודל הימור, יוזמה), בלי לייחס ציטוטים לאנשים אמיתיים.
- אם המודל של האפליקציה פשטני מדי למצב, אמור את זה בכנות.
- אם השחקן מבקש עזרה במשחק אמיתי שמתרחש עכשיו, על כסף, סרב בנימוס: זה אסור בכל אתרי הפוקר ופוגע בשחקנים האחרים. הצע לנתח את היד אחרי שהמשחק נגמר.`;

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const key = Deno.env.get('OPENROUTER_API_KEY');
  if (!key) return json({ error: 'not_configured' }, 503);

  let body: { playerId?: string; secret?: string; spot?: string; question?: string };
  try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }
  const { playerId, secret, spot, question } = body;
  if (!playerId || !secret || !spot || !question) return json({ error: 'missing' }, 400);
  if (spot.length > 3000 || question.length > 300) return json({ error: 'too_long' }, 400);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const limit = Number(Deno.env.get('COACH_DAILY_LIMIT') || 15);
  const { data: left, error } = await admin.rpc('poker_coach_take', { p_id: playerId, p_secret: secret, p_limit: limit });
  if (error) return json({ error: 'quota_check' }, 500);
  if (left === -1) return json({ error: 'unknown_player' }, 403);
  if (left === 0) return json({ error: 'limit', limit }, 429);

  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'Poker IQ' },
    body: JSON.stringify({
      model: Deno.env.get('OPENROUTER_MODEL') || 'google/gemini-2.5-flash',
      max_tokens: 400,
      temperature: 0.4,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `היד:\n${spot}\n\nהשאלה של השחקן: ${question}` }
      ]
    })
  });
  if (!r.ok) return json({ error: 'model', status: r.status }, 502);
  const out = await r.json();
  const answer = out?.choices?.[0]?.message?.content?.trim();
  if (!answer) return json({ error: 'empty' }, 502);
  return json({ answer, left: left - 1 });
});
