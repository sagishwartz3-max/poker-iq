/**
 * Bridge to the native shell. Empty on the website; inside the Expo app the DOM component fills it with
 * functions that run natively (PostHog, haptics, opening links, and later RevenueCat purchases).
 */
export interface NativeBridge {
  track?: (event: string, props?: Record<string, unknown>) => Promise<void> | void;
  identify?: (id: string, props?: Record<string, unknown>) => Promise<void> | void;
  screen?: (name: string) => Promise<void> | void;
  haptic?: (kind: 'light' | 'success' | 'warning' | 'error') => Promise<void> | void;
  openURL?: (url: string) => Promise<void> | void;
  /** the store's own rating prompt (the OS decides whether it shows) */
  review?: () => Promise<void> | void;
}
export const native: NativeBridge = {};
export const inApp = () => !!native.track;

/**
 * Ask for a store rating right after a moment of success, at most every 60 days and only after real use.
 * Ratings are the main growth signal in the stores, so the ask is rare and well timed.
 */
export function maybeAskReview(hands: number) {
  if (!native.review || hands < 25) return;
  try {
    const last = Number(localStorage.getItem('pokeriq-review-at') || 0);
    if (Date.now() - last < 60 * 864e5) return;
    localStorage.setItem('pokeriq-review-at', String(Date.now()));
  } catch { return; }
  setTimeout(() => void native.review?.(), 1200);
}

/** Images under /public: same origin on the web, the public site inside the app (the DOM bundle has no /public). */
export const SITE = 'https://poker-iq-six.vercel.app';
export const asset = (path: string) => (!inApp() && typeof location !== 'undefined' && location.protocol.startsWith('http') ? path : SITE + path);

/** Background art used from CSS, as variables, so the same stylesheet works on the web and inside the app. */
export function applyAssetVars() {
  const r = document.documentElement.style;
  r.setProperty('--img-lounge', `url("${asset('/table/lounge.webp')}")`);
  r.setProperty('--img-rail', `url("${asset('/table/table-reference.webp')}")`);
}
