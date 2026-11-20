// Friends' tables run on the server (edge function poker-table). This module sends commands and listens for the
// public table view on the table's realtime channel. Emoji reactions go straight between players on the channel.
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { TCfg, View } from '../engine/holdem';
import type { TableCmd } from '../engine/tableops';
import type { Progress } from '../game/progress';
import { supabase } from './supabase';

export interface TableReply { ok?: boolean; error?: string; code?: string; channel?: string; club?: string | null; view?: View; mine?: { hand: number; cards: number[] } | null }

async function call(p: Progress, body: Record<string, unknown>): Promise<TableReply> {
  const { data, error } = await supabase.functions.invoke('poker-table', { body: { id: p.id, secret: p.secret, ...body } });
  if (error) {
    let msg = 'אין חיבור לשרת. בדוק שיש אינטרנט ונסה שוב.';
    try { const j = await (error as { context?: Response }).context?.json(); if (j?.error) msg = j.error; } catch { /* keep the generic message */ }
    return { ok: false, error: msg };
  }
  return data as TableReply;
}
/** A private table, or a club's table when `club` is given (club owner and managers only). */
export const createTable = (p: Progress, cfg: TCfg, club?: string) => call(p, { create: cfg, nick: p.nick || 'מנהל', ...(club ? { club } : {}) });
export const tableCmd = (p: Progress, code: string, cmd: TableCmd) => call(p, { code, cmd });

/** The table's realtime channel: server pushes of the public view, and emoji between players. */
export class TableLive {
  private ch: RealtimeChannel | null = null;
  constructor(private channel: string, private onView: (v: View) => void, private onEmoji: (from: string, e: string) => void) {}
  join() {
    const ch = supabase.channel(`pokeriq-table-${this.channel}`, { config: { broadcast: { self: false } } });
    ch.on('broadcast', { event: 'st' }, ({ payload }) => this.onView(payload as View));
    ch.on('broadcast', { event: 'em' }, ({ payload }) => this.onEmoji(String(payload?.from || ''), String(payload?.e || '').slice(0, 8)));
    ch.subscribe();
    this.ch = ch;
  }
  emoji(from: string, e: string) { this.ch?.send({ type: 'broadcast', event: 'em', payload: { from, e } }); }
  leave() { if (this.ch) { supabase.removeChannel(this.ch); this.ch = null; } }
}
