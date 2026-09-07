import webpush from 'web-push';
import { config } from './config.js';
import { store } from './store.js';
export async function notifyReady(episodeId: string) {
  if (!config.VAPID_PUBLIC_KEY || !config.VAPID_PRIVATE_KEY) return;
  webpush.setVapidDetails(config.VAPID_SUBJECT, config.VAPID_PUBLIC_KEY, config.VAPID_PRIVATE_KEY);
  for (const item of await store.list('devices')) {
    try {
      await webpush.sendNotification(
        item.subscription,
        JSON.stringify({
          title: 'Your briefing is ready',
          body: 'A little clarity for your day. Tap to listen.',
          episodeId,
        }),
        { TTL: 3600, urgency: 'normal', timeout: 10000 },
      );
    } catch (e: any) {
      if (e.statusCode === 404 || e.statusCode === 410) await store.remove('devices', item.id);
    }
  }
}
