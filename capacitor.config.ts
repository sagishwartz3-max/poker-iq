import type { CapacitorConfig } from '@capacitor/cli';

// appId must be unique in the stores. Change "com.pokeriq.app" to your own reverse domain before the first upload.
const config: CapacitorConfig = {
  appId: 'com.pokeriq.app',
  appName: 'Poker IQ',
  webDir: 'dist',
  backgroundColor: '#05070d',
  ios: { contentInset: 'never' },
  android: { backgroundColor: '#05070d' }
};

export default config;
