import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import * as StoreReview from 'expo-store-review';
import { useCallback } from 'react';
import { View } from 'react-native';
import { analytics } from '../analytics';
import Game from '../components/Game';

export default function Index() {
  const haptic = useCallback(async (kind: 'light' | 'success' | 'warning' | 'error') => {
    if (kind === 'light') return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const t = kind === 'success' ? Haptics.NotificationFeedbackType.Success : kind === 'warning' ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Error;
    return Haptics.notificationAsync(t);
  }, []);
  const review = useCallback(async () => { if (await StoreReview.hasAction()) await StoreReview.requestReview(); }, []);
  const openURL = useCallback(async (url: string) => { await Linking.openURL(url); }, []);
  return (
    <View style={{ flex: 1, backgroundColor: '#05070d' }}>
      <Game dom={{ style: { flex: 1 }, bounces: false, overScrollMode: 'never', allowsInlineMediaPlayback: true, mediaPlaybackRequiresUserAction: false } as never}
        track={analytics.track} identify={analytics.identify} screen={analytics.screen} haptic={haptic} openURL={openURL} review={review} />
    </View>
  );
}
