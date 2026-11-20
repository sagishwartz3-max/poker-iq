// Poker IQ friends' tables, run on the server. The table state lives in poker_table_state; every command is
// checked here with the same engine the app uses (holdem.ts + tableops.ts, synced by scripts/sync-edge.mjs).
// After each change the public view (no deck, no hole cards) is broadcast on the table's realtime channel,
// and the caller gets back the view plus their own two cards.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { DEFAULT_CFG, newTable, publicView, type TCfg, type TS } from './holdem.ts';
import { applyCmd, type TableCmd } from './tableops.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const URL_ = Deno.env.get('SUPABASE_URL')!, KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db = createClient(URL_, KEY, { auth: { persistSession: false } });
const rnd = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
const CMDS = new Set(['join', 'act', 'rebuy', 'pay', 'unpay', 'back', 'beat', 'suggest', 'cfg', 'start', 'pause', 'learn', 'gift', 'kick', 'end', 'tick', 'sitout']);

/** The settings a new table may use: anything else falls back to the defaults. */
function cleanCfg(c: Partial<TCfg> | undefined): TCfg {
  const pick = <T,>(v: unknown, ok: T[], d: T) => (ok.includes(v as T) ? (v as T) : d);
  const buyIn = pick(c?.buyIn, [0, 100, 250, 500, 1000], 0);
  return {
    stack: pick(c?.stack, [1000, 2000, 5000, 10000], DEFAULT_CFG.stack),
    levelMin: pick(c?.levelMin, [0, 5, 10, 15, 20], 10),
    rebuys: buyIn ? 0 : pick(c?.rebuys, [0, 1, 2, 3, -1], 0),
    turnSec: pick(c?.turnSec, [20, 30, 45, 60], 30),
    learn: c?.learn !== false,
    buyIn
  };
}

/** What everyone may see, minus fields that change on every heartbeat (used to skip needless broadcasts). */
const shape = (s: TS) => JSON.stringify({ ...publicView(s, 0), at: 0, players: publicView(s, 0).players.map(({ seen: _s, vis: _v, awayAt: _a, ...p }) => p) });

async function broadcast(channel: string, s: TS) {
  await fetch(`${URL_}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ topic: `pokeriq-table-${channel}`, event: 'st', payload: publicView(s, Date.now()), private: false }] })
  }).catch(() => {});
}
const verified = new Map<string, number>();
const mine = (s: TS, id: string) => { const p = s.players.find(x => x.id === id); return p?.cards ? { hand: s.handNo, cards: p.cards } : null; };

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  let body: { id?: string; secret?: string; code?: string; cmd?: TableCmd; create?: Partial<TCfg>; nick?: string; club?: string };
  try { body = await req.json(); } catch { return json({ error: 'bad request' }, 400); }
  const { id, secret } = body;
  if (!id || !secret) return json({ error: 'missing player' }, 401);
  // the secret check is slow (bcrypt): remember a verified player for 10 minutes in this instance
  const vk = `${id}:${secret}`;
  if (!((verified.get(vk) ?? 0) > Date.now())) {
    const { data: okSecret } = await db.rpc('poker_check_secret', { p_id: id, p_secret: secret });
    if (okSecret !== true) return json({ error: 'unknown player' }, 401);
    if (verified.size > 5000) verified.clear();
    verified.set(vk, Date.now() + 10 * 60000);
  }

  /* ---------- open a new table ---------- */
  if (body.create) {
    // a club table: only the club's owner and managers open one
    const club = body.club && /^[0-9a-f-]{36}$/.test(body.club) ? body.club : null;
    if (body.club && !club) return json({ error: 'מועדון לא תקין' }, 400);
    if (club) {
      const { data: role } = await db.rpc('poker_club_role', { p_club: club, p_player: id });
      if (role !== 'owner' && role !== 'manager') return json({ error: 'רק מנהלי המועדון פותחים שולחנות' }, 403);
    }
    const { data: rm, error } = await db.rpc('poker_room_create', { p_id: id, p_secret: secret, p_kind: 'table' });
    const room = Array.isArray(rm) ? rm[0] : rm;
    if (error || !room) return json({ error: 'לא הצלחנו לפתוח שולחן. נסה שוב.' }, 500);
    if (club) await db.from('poker_rooms').update({ club_id: club }).eq('code', room.code);
    const s = newTable(room.code, id, cleanCfg(body.create));
    applyCmd(s, id, { t: 'join', nick: body.nick || 'מנהל' }, Date.now(), rnd);
    await db.from('poker_table_state').insert({ code: room.code, state: s });
    return json({ ok: true, code: room.code, channel: room.channel, club, view: publicView(s, Date.now()), mine: null });
  }

  /* ---------- a command on an existing table ---------- */
  const code = String(body.code || '').toUpperCase().slice(0, 5);
  const cmd = body.cmd;
  if (!cmd || !CMDS.has(cmd.t)) return json({ error: 'bad command' }, 400);
  const { data: room } = await db.from('poker_rooms').select('channel, closed_at, club_id').eq('code', code).eq('kind', 'table').maybeSingle();
  if (!room) return json({ error: 'אין שולחן עם הקוד הזה' }, 404);
  for (let attempt = 0; attempt < 6; attempt++) {
    const { data: row } = await db.from('poker_table_state').select('state, ver').eq('code', code).maybeSingle();
    if (!row) return json({ error: 'אין שולחן עם הקוד הזה' }, 404);
    const s = row.state as TS;
    const seated = s.players.some(p => p.id === id);
    if (room.closed_at && cmd.t === 'join' && !seated) return json({ error: 'השולחן הזה כבר נסגר' }, 410);
    // a club's table seats the club's members only
    if (room.club_id && cmd.t === 'join' && !seated && attempt === 0) {
      const { data: role } = await db.rpc('poker_club_role', { p_club: room.club_id, p_player: id });
      if (!role) return json({ error: 'השולחן הזה שייך למועדון. הצטרף למועדון כדי לשבת בו.' }, 403);
    }
    const before = shape(s), wasOver = s.phase === 'over';
    if (cmd.t === 'join') (cmd as { nick: string }).nick = String(cmd.nick || body.nick || 'שחקן');
    const res = applyCmd(s, id, cmd, Date.now(), rnd);
    const { data: ver } = await db.rpc('poker_table_save', { p_code: code, p_state: s, p_ver: row.ver });
    if (ver == null) continue; // someone saved in between: replay on the fresh state
    if (shape(s) !== before) await broadcast(room.channel, s);
    if (s.phase === 'over' && !wasOver) await db.from('poker_rooms').update({ closed_at: new Date().toISOString() }).eq('code', code);
    return json({ ok: res.ok, error: res.error, channel: room.channel, club: room.club_id, view: publicView(s, Date.now()), mine: mine(s, id) });
  }
  return json({ error: 'השולחן עמוס כרגע, נסה שוב' }, 409);
});
