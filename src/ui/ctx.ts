import { createContext, useContext } from 'react';
import type { Progress } from '../game/progress';

export type Screen = 'home' | 'duel' | 'board' | 'learn' | 'profile' | 'play' | 'daily' | 'pro' | 'table';
export interface PlayArgs { mode: 'stage' | 'free' | 'daily' | 'review' | 'drill'; w?: number; l?: number; drill?: string }
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
