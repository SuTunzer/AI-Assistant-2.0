import { api, appMode } from './api';
export async function enableNotifications() {
  if (appMode === 'demo') throw Error('Ready notifications need your connected workspace.');
  if (!('serviceWorker' in navigator) || !('PushManager' in window))
    throw Error(
      'This browser does not support background notifications. Use Chrome on your phone.',
    );
  const permission = await Notification.requestPermission();
  if (permission !== 'granted')
    throw Error('Notifications are disabled. You can change this in Chrome site settings.');
  const { key } = await api<{ key: string }>('push/key');
  if (!key) throw Error('Notifications need VAPID keys on the server. See the setup guide.');
  const ready = await navigator.serviceWorker.ready;
  const padded = key.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (key.length % 4)) % 4);
  const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  const subscription =
    (await ready.pushManager.getSubscription()) ||
    (await ready.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes }));
  await api('push', 'POST', subscription.toJSON());
  return subscription;
}
