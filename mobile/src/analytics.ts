import PostHog from 'posthog-react-native';

/**
 * Product analytics (PostHog). Set EXPO_PUBLIC_POSTHOG_KEY (Project API key, phc_…) and optionally
 * EXPO_PUBLIC_POSTHOG_HOST (https://eu.i.posthog.com or https://us.i.posthog.com). Without a key nothing is sent.
 * Only the anonymous player id is identified; nicknames never leave the game.
 */
const KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY;
export const posthog = KEY
  ? new PostHog(KEY, { host: process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com', captureAppLifecycleEvents: true })
  : null;

export const analytics = {
  track: async (event: string, props?: Record<string, unknown>) => { posthog?.capture(event, props as never); },
  identify: async (id: string, props?: Record<string, unknown>) => { posthog?.identify(id, props as never); },
  screen: async (name: string) => { await posthog?.screen(name); }
};
