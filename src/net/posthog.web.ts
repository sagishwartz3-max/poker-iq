// Inside the Expo app: analytics go to the native PostHog SDK through the bridge.
import { native } from '../native';
export function phCapture(event: string, props: Record<string, unknown> = {}) { void native.track?.(event, props); }
export function phIdentify(id: string, props: Record<string, unknown> = {}) { void native.identify?.(id, props); }
