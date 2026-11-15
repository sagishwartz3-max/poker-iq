import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Action } from '../engine/scenarios';

/** `at` = when this player entered the room. The two earliest are the players; anyone later is turned away. */
export interface Peer { id: string; nick: string; host: boolean; at: number }
export type DuelMsg =
  | { type: 'start'; seed: number; round: number; players: string[] }
  | { type: 'answer'; i: number; action: Action | 'timeout'; pts: number; from: string }
  | { type: 'next'; i: number; from: string }
  | { type: 'bye'; from: string };

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const newCode = () => Array.from({ length: 5 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');
export const DUEL_HANDS = 7;
export const DUEL_SECONDS = 20;

/** A two-player room on a Supabase Realtime channel. Both clients build the same hands from a shared seed. */
export class DuelRoom {
  ch: RealtimeChannel | null = null;
  peers: Peer[] = [];
  constructor(public code: string, public me: Peer, private onPeers: (p: Peer[]) => void, private onMsg: (m: DuelMsg) => void, private onStatus: (s: string) => void) {}

  join() {
    const ch = supabase.channel(`pokeriq-duel-${this.code}`, { config: { presence: { key: this.me.id }, broadcast: { self: false } } });
    ch.on('presence', { event: 'sync' }, () => {
      const st = ch.presenceState<Peer>();
      this.peers = Object.values(st).map(list => list[0]).filter(Boolean)
        .map(p => ({ id: p.id, nick: p.nick, host: p.host, at: p.at || 0 }));
      this.onPeers(this.peers);
    });
    ch.on('broadcast', { event: 'msg' }, ({ payload }) => this.onMsg(payload as DuelMsg));
    ch.subscribe(async status => {
      this.onStatus(status);
      if (status === 'SUBSCRIBED') await ch.track(this.me);
    });
    this.ch = ch;
  }
  send(m: DuelMsg) { this.ch?.send({ type: 'broadcast', event: 'msg', payload: m }); }
  leave() {
    if (!this.ch) return;
    try { this.send({ type: 'bye', from: this.me.id }); } catch { /* closing */ }
    supabase.removeChannel(this.ch);
    this.ch = null;
  }
}

/** The two players of a room: the earliest two to enter. */
export const seated = (peers: Peer[]) => [...peers].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id)).slice(0, 2);
