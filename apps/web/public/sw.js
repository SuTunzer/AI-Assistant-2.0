/* Only application assets are cached here. Private API responses never enter Cache Storage. */
const base = new URL(self.registration.scope).pathname;
const prefix = 'steadier-shell-' + base.replace(/[^a-z0-9]/gi, '_') + '-';
let activeCache = prefix + '__STEADIER_BUILD__';
self.addEventListener('install', (event) =>
  event.waitUntil(
    (async () => {
      const manifest = await (await fetch(base + 'precache.json', { cache: 'no-store' })).json();
      activeCache = prefix + manifest.version;
      const cache = await caches.open(activeCache);
      await cache.addAll([
        ...new Set([...manifest.urls, base + 'manifest.webmanifest', base + 'sample-briefing.wav']),
      ]);
      // Activation waits for existing clients to close, avoiding a mid-recording application update.
    })(),
  ),
);
self.addEventListener('activate', (event) =>
  event.waitUntil(
    (async () => {
      const keys = (await caches.keys()).filter((k) => k.startsWith(prefix));
      activeCache ||= keys.at(-1);
      await Promise.all(keys.filter((k) => k !== activeCache).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  ),
);
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    !url.pathname.startsWith(base)
  )
    return;
  if (!(
    ['navigate'].includes(event.request.mode) ||
    url.pathname.startsWith(base + 'assets/') ||
    url.pathname.startsWith(base + 'icons/') ||
    ['sample-briefing.wav', 'manifest.webmanifest'].some((p) => url.pathname === base + p)
  ))
    return;
  event.respondWith(
    (async () => {
      const keys = (await caches.keys()).filter((k) => k.startsWith(prefix));
      const cache = await caches.open(activeCache || keys.at(-1) || prefix + 'empty');
      const cached = await cache.match(event.request.mode === 'navigate' ? base : event.request, {
        ignoreVary: true,
      });
      return cached || fetch(event.request);
    })(),
  );
});
self.addEventListener('push', (event) =>
  event.waitUntil(
    (async () => {
      let data = {};
      try {
        data = event.data?.json() || {};
      } catch {}
      await self.registration.showNotification('Your briefing is ready', {
        body: 'A little clarity for your day. Tap to listen.',
        icon: base + 'icons/icon-192.png',
        badge: base + 'icons/icon-192.png',
        tag: 'steadier-ready',
        data: { episodeId: String(data.episodeId || '').replace(/[^a-zA-Z0-9-]/g, '') },
      });
    })(),
  ),
);
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const url =
        self.registration.scope +
        '#/listen?episode=' +
        encodeURIComponent(event.notification.data?.episodeId || '');
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const client = clients.find((c) => c.url.startsWith(self.registration.scope));
      if (client) {
        await client.navigate(url);
        await client.focus();
      } else await self.clients.openWindow(url);
    })(),
  );
});
