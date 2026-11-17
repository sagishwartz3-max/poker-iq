// Inside the Expo app the game is bundled by Metro as a DOM component (platform "web"), which picks this file.
// EXPO_PUBLIC_* values are inlined at build time; analytics there go through the native PostHog SDK.
declare const process: { env: Record<string, string | undefined> };
export const ENV = {
  SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL as string | undefined,
  SUPABASE_KEY: process.env.EXPO_PUBLIC_SUPABASE_KEY as string | undefined,
  PUBLIC_URL: process.env.EXPO_PUBLIC_PUBLIC_URL as string | undefined,
  POSTHOG_KEY: undefined as string | undefined,
  POSTHOG_HOST: undefined as string | undefined
};
