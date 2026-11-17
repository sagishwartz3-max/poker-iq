// Product analytics for the website (PostHog). No key configured -> nothing is sent.
import { ENV } from '../env';

type PH = typeof import('posthog-js').default;
let ph: PH | null = null;
let queue: [string, Record<string, unknown>][] = [];
let started = false;

function start() {
  if (started || !ENV.POSTHOG_KEY) return;
  started = true;
  import('posthog-js').then(({ default: posthog }) => {
    posthog.init(ENV.POSTHOG_KEY!, {
      api_host: ENV.POSTHOG_HOST || 'https://eu.i.posthog.com',
      person_profiles: 'identified_only', autocapture: false, capture_pageview: false, disable_session_recording: true
    });
    ph = posthog;
    for (const [e, p] of queue) posthog.capture(e, p);
    queue = [];
  }).catch(() => { /* blocked by an ad blocker: fine */ });
}
export function phCapture(event: string, props: Record<string, unknown> = {}) {
  start();
  if (ph) ph.capture(event, props); else if (ENV.POSTHOG_KEY && queue.length < 50) queue.push([event, props]);
}
export function phIdentify(id: string, props: Record<string, unknown> = {}) {
  start();
  if (ph) ph.identify(id, props); else setTimeout(() => ph?.identify(id, props), 1500);
}
