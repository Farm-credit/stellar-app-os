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
export async function notify(title: string, body: string, secondsFromNow = 1): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: 'default',
    },
    trigger: {
      seconds: secondsFromNow,
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
    },
  });
}

/**
 * Tree lifecycle and sponsor achievement event types that can be delivered
 * to subscribed screens in real time.
 */
export type TreeEventType =
  | 'tree_planted'
  | 'tree_survival_1y'
  | 'tree_milestone_5y'
  | 'achievement_unlocked';

/**
 * Payload describing a tree lifecycle or achievement event.
 */
export interface TreeEvent {
  type: TreeEventType;
  /** Identifier of the tree the event relates to. */
  treeId: string;
  /** Optional identifier of the sponsor who owns the tree. */
  sponsorId?: string;
  /** Optional identifier of the unlocked achievement (for achievement_unlocked). */
  achievementId?: string;
  /** Optional human-readable title for the achievement. */
  achievementTitle?: string;
  /** Optional species name of the tree. */
  species?: string;
  /** Optional location label of the tree. */
  location?: string;
  /** Optional timestamp (ms since epoch) when the event occurred. */
  occurredAt?: number;
}

/**
 * Typed handlers for each supported tree event type.
 */
export type TreeEventHandlers = {
  [K in TreeEventType]?: (event: Extract<TreeEvent, { type: K }>) => void;
};

/**
 * Returned by subscribeToTreeEvents so callers can stop listening.
 */
export interface TreeEventSubscription {
  unsubscribe: () => void;
}

const EVENT_TITLES: Record<TreeEventType, string> = {
  tree_planted: 'Tree planted 🌱',
  tree_survival_1y: '1-year survival 🌳',
  tree_milestone_5y: '5-year milestone 🎉',
  achievement_unlocked: 'Achievement unlocked 🏆',
};

function buildNotificationBody(event: TreeEvent): string {
  const subject = event.species
    ? `${event.species}${event.location ? ` in ${event.location}` : ''}`
    : event.location ?? 'Your tree';

  switch (event.type) {
    case 'tree_planted':
      return `${subject} has been planted. Thank you for your sponsorship!`;
    case 'tree_survival_1y':
      return `${subject} has survived its first year. Great news!`;
    case 'tree_milestone_5y':
      return `${subject} has reached its 5-year milestone. Incredible impact!`;
    case 'achievement_unlocked':
      return event.achievementTitle
        ? `You unlocked "${event.achievementTitle}". Keep up the great work!`
        : 'You unlocked a new sponsor achievement. Keep up the great work!';
    default:
      return 'You have a new sponsorship update.';
  }
}

/**
 * Subscribe to tree lifecycle and sponsor achievement events.
 *
 * Each event is delivered to the matching typed handler and, unless
 * `options.silent` is set, also surfaced as a local notification through the
 * existing `notify()` path so the user sees real-time milestone updates.
 *
 * Returns a subscription whose `unsubscribe()` stops further delivery.
 */
export function subscribeToTreeEvents(
  handlers: TreeEventHandlers,
  options: { silent?: boolean } = {}
): TreeEventSubscription {
  let active = true;

  const emit = (event: TreeEvent): void => {
    if (!active) return;

    const handler = handlers[event.type] as
      | ((event: TreeEvent) => void)
      | undefined;
    if (handler) {
      try {
        handler(event);
      } catch {
        // A faulty handler must not prevent other subscribers from reacting.
      }
    }

    if (!options.silent) {
      void notify(EVENT_TITLES[event.type], buildNotificationBody(event)).catch(
        () => {
          // Notification delivery is best-effort; ignore failures.
        }
      );
    }
  };

  return {
    unsubscribe: () => {
      active = false;
    },
    // Exposed internally for the event source to push events into subscribers.
    ...({ emit } as { emit: (event: TreeEvent) => void }),
  };
}