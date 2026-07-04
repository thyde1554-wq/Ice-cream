import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';

import { DetectionReason } from '../dsp/detector';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function ensureNotificationPermission(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

const REASON_COPY: Record<Exclude<DetectionReason, null>, string> = {
  'level-rise': 'The motor sounds like it is straining — the mixture has thickened.',
  'level-drop': 'The machine has gone quiet — it may have finished or shut off.',
  'variance-shift': "The sound's texture changed noticeably from the baseline.",
};

export async function notifyChurnDone(reason: DetectionReason): Promise<void> {
  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '🍦 Ice cream is ready!',
      body: reason ? REASON_COPY[reason] : 'Your ice cream maker sounds done.',
      sound: true,
    },
    trigger: null,
  });
}
