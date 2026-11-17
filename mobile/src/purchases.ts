/**
 * In-app purchases: RevenueCat goes here (planned, not installed yet).
 *
 * When it is time:
 *   1. npx expo install react-native-purchases   (needs a development build, not Expo Go)
 *   2. Purchases.configure({ apiKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY / _ANDROID_KEY, appUserID: playerId })
 *   3. Offer Pro as a subscription (entitlement "pro"); pass `purchasePro` and `restore` to the game as DOM props.
 *
 * Rule: subscriptions only. Game coins are never sold — with coin buy-in tables, selling coins would make the app
 * "real-money gaming" in the stores' eyes.
 */
export const purchases = {
  available: false,
  purchasePro: async (): Promise<boolean> => false,
  restore: async (): Promise<boolean> => false
};
