import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Request push notification permission and return the Expo push token when
 * granted. On iOS simulators push tokens are unavailable; callers should
 * treat a null token as "notifications disabled on this device".
 */
export async function registerForPushNotifications(): Promise<string | null> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('sponsorship', {
      name: 'Sponsorship updates',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const token = await Notifications.getExpoPushTokenAsync();
  return token.data;
}

/**
 * Schedule a local notification (e.g. when a sponsorship is queued offline
 * and will sync later, or when growth milestones are fetched).
 */
export async function notify(
  title: string,
  body: string,
  secondsFromNow = 1
): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: 'default',
    },
    trigger: { seconds: secondsFromNow, type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL },
  });
}
