interface PushNotificationPayload {
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export function dispatchPushNotification(payload: PushNotificationPayload): void {
  if (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    window.Notification.permission === 'granted'
  ) {
    new window.Notification(payload.title, {
      body: payload.body,
      data: payload.data,
    });
  }
}
