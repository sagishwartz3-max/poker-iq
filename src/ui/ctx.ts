import { createContext, useContext } from 'react';
import type { Progress } from '../game/progress';

export type Screen = 'home' | 'duel' | 'board' | 'learn' | 'profile' | 'play' | 'daily' | 'pro' | 'table' | 'diagnose' | 'path';
export interface PlayArgs { mode: 'stage' | 'free' | 'daily' | 'review' | 'drill'; w?: number; l?: number; drill?: string;
  /** a knowledge-level checkpoint (drill mode): 8 of 10 good decisions passes the level */ level?: number;
  /** where to return when the round ends */ back?: Screen }
export interface AppCtx {
  P: Progress;
  update: (fn: (p: Progress) => void) => void;
  term: (key: string) => void;
  toast: (msg: string) => void;
  go: (s: Screen, play?: PlayArgs) => void;
  sync: () => void;
}
export const Ctx = createContext<AppCtx>(null as unknown as AppCtx);
export const useApp = () => useContext(Ctx);
