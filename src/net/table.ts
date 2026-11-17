// Friends' table networking over a Supabase Realtime channel.
// The host's device runs the game. Hole cards and player commands are encrypted end to end
// (ECDH P-256 + AES-GCM) so other people in the room cannot read cards or act for someone else.
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { TAction, View } from '../engine/holdem';
import { supabase } from './supabase';

export interface TPeer { id: string; nick: string; host: boolean; pub: JsonWebKey; at: number }
export type Cmd = { t: 'hello' } | { t: 'act'; hand: number; a: TAction } | { t: 'rebuy' } | { t: 'emoji'; e: string } | { t: 'pay' } | { t: 'unpay' };
interface Sealed { iv: string; ct: string }
type Wire =
  | { k: 'st'; v: View }
  | ({ k: 'cd'; to: string; hand: number } & Sealed)
  | ({ k: 'cm'; from: string } & Sealed)
  | { k: 'em'; from: string; e: string };

const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)));
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const EC = { name: 'ECDH', namedCurve: 'P-256' } as const;

export interface TableHandlers {
  onPeers: (p: TPeer[]) => void;
  onState: (v: View) => void;
  onCards: (hand: number, cards: number[]) => void;
  onCmd: (from: string, c: Cmd) => void;
  onEmoji: (from: string, e: string) => void;
  onStatus: (s: string) => void;
}

export class TableNet {
  ch: RealtimeChannel | null = null;
  peers: TPeer[] = [];
  private priv!: CryptoKey;
  private pub!: JsonWebKey;
  private keys = new Map<string, CryptoKey>();
  constructor(public code: string, public channel: string, public me: { id: string; nick: string }, public isHost: boolean, private h: TableHandlers) {}

  private async loadKeys() {
    const k = `pokeriq-tkey-${this.code}-${this.me.id}`;
    try {
      const saved = JSON.parse(localStorage.getItem(k) || 'null');
      if (saved) { this.priv = await crypto.subtle.importKey('jwk', saved.priv, EC, false, ['deriveKey']); this.pub = saved.pub; return; }
    } catch { /* make a new pair */ }
    const pair = await crypto.subtle.generateKey(EC, true, ['deriveKey']);
    this.priv = pair.privateKey;
    this.pub = await crypto.subtle.exportKey('jwk', pair.publicKey);
    try { localStorage.setItem(k, JSON.stringify({ priv: await crypto.subtle.exportKey('jwk', pair.privateKey), pub: this.pub })); } catch { /* storage off */ }
  }
  private async shared(peer: TPeer) {
    const tag = peer.id + (peer.pub.x || '');
    let key = this.keys.get(tag);
    if (!key) {
      const theirs = await crypto.subtle.importKey('jwk', peer.pub, EC, false, []);
      key = await crypto.subtle.deriveKey({ name: 'ECDH', public: theirs }, this.priv, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      this.keys.set(tag, key);
    }
    return key;
  }
  private async seal(peer: TPeer, data: unknown): Promise<Sealed> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await this.shared(peer), new TextEncoder().encode(JSON.stringify(data)));
    return { iv: b64(iv), ct: b64(ct) };
  }
  private async open(peer: TPeer, m: Sealed) {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(m.iv) }, await this.shared(peer), unb64(m.ct));
    return JSON.parse(new TextDecoder().decode(pt));
  }
  get host() { return this.peers.filter(p => p.host).sort((a, b) => a.at - b.at)[0]; }

  async join() {
    await this.loadKeys();
    const ch = supabase.channel(`pokeriq-table-${this.channel}`, { config: { presence: { key: this.me.id }, broadcast: { self: false } } });
    ch.on('presence', { event: 'sync' }, () => {
      const st = ch.presenceState<TPeer>();
      this.peers = Object.values(st).map(l => l[0]).filter(p => p && p.pub).map(p => ({ id: p.id, nick: p.nick, host: !!p.host, pub: p.pub, at: p.at || 0 }));
      this.h.onPeers(this.peers);
    });
    ch.on('broadcast', { event: 'w' }, async ({ payload }) => {
      const m = payload as Wire;
      try {
        if (m.k === 'st') { if (!this.isHost) this.h.onState(m.v); }
        else if (m.k === 'em') this.h.onEmoji(m.from, String(m.e).slice(0, 8));
        else if (m.k === 'cd') { if (m.to === this.me.id && this.host) this.h.onCards(m.hand, await this.open(this.host, m)); }
        else if (m.k === 'cm' && this.isHost) {
          const peer = this.peers.find(p => p.id === m.from);
          if (peer) this.h.onCmd(m.from, await this.open(peer, m));
        }
      } catch { /* not for us, or tampered with */ }
    });
    ch.subscribe(async status => {
      this.h.onStatus(status);
      if (status === 'SUBSCRIBED') await ch.track({ id: this.me.id, nick: this.me.nick, host: this.isHost, pub: this.pub, at: Date.now() });
    });
    this.ch = ch;
  }
  private send(m: Wire) { this.ch?.send({ type: 'broadcast', event: 'w', payload: m }); }
  sendState(v: View) { this.send({ k: 'st', v }); }
  async sendCards(toId: string, hand: number, cards: number[]) {
    const peer = this.peers.find(p => p.id === toId);
    if (peer) this.send({ k: 'cd', to: toId, hand, ...(await this.seal(peer, cards)) });
  }
  async sendCmd(c: Cmd) {
    if (c.t === 'emoji') { this.send({ k: 'em', from: this.me.id, e: c.e }); return; }
    const host = this.host;
    if (host) this.send({ k: 'cm', from: this.me.id, ...(await this.seal(host, c)) });
  }
  leave() { if (this.ch) { supabase.removeChannel(this.ch); this.ch = null; } }
}
