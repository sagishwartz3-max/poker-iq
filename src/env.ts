// Build-time settings for the web build (Vite). The app build (Expo) reads env.web.ts instead.
export const ENV = {
  SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  SUPABASE_KEY: import.meta.env.VITE_SUPABASE_KEY as string | undefined,
  PUBLIC_URL: import.meta.env.VITE_PUBLIC_URL as string | undefined,
  POSTHOG_KEY: import.meta.env.VITE_POSTHOG_KEY as string | undefined,
  POSTHOG_HOST: import.meta.env.VITE_POSTHOG_HOST as string | undefined
};
