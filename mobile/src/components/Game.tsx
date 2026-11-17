'use dom';

// The whole Poker IQ game (shared with the website) running as an Expo DOM component.
import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import '../../../src/styles.css';
import '../../../src/room.css';

// The shared game is type-checked by the website build (../tsconfig.json); here it stays opaque.
/* eslint-disable @typescript-eslint/no-require-imports */
const App: ComponentType = require('../../../src/App').default;
const { applyAssetVars, native } = require('../../../src/native') as { applyAssetVars: () => void; native: Record<string, unknown> };

type Props = {
  dom?: import('expo/dom').DOMProps;
  track: (event: string, props?: Record<string, unknown>) => Promise<void>;
  identify: (id: string, props?: Record<string, unknown>) => Promise<void>;
  screen: (name: string) => Promise<void>;
  haptic: (kind: 'light' | 'success' | 'warning' | 'error') => Promise<void>;
  openURL: (url: string) => Promise<void>;
  review: () => Promise<void>;
};

export default function Game({ track, identify, screen, haptic, openURL, review }: Props) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    Object.assign(native, { track, identify, screen, haptic, openURL, review });
    // the same page setup the website's index.html has: Hebrew right-to-left, Rubik, edge-to-edge with safe areas
    const html = document.documentElement;
    html.lang = 'he'; html.dir = 'rtl';
    const vp = document.querySelector('meta[name="viewport"]');
    vp?.setAttribute('content', 'width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no');
    if (!document.getElementById('rubik')) {
      const l = document.createElement('link');
      l.id = 'rubik'; l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;600;700;800;900&display=swap';
      document.head.appendChild(l);
    }
    const root = document.getElementById('root');
    if (root) root.style.display = 'block';
    applyAssetVars();
    // links that leave the game (WhatsApp, privacy page, store pages) open outside the web view
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a) return;
      const href = a.getAttribute('href') || '';
      if (/^(https?:|mailto:|tel:|whatsapp:)/.test(href) || a.target === '_blank' || href.startsWith('./privacy')) {
        e.preventDefault();
        void openURL(href.startsWith('./') ? `https://poker-iq-six.vercel.app/${href.slice(2)}` : href);
      }
    };
    document.addEventListener('click', onClick, true);
    setReady(true);
    return () => document.removeEventListener('click', onClick, true);
  }, [track, identify, screen, haptic, openURL, review]);
  return ready ? <App /> : null;
}
