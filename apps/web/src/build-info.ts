// Injected by vite (see `define` in vite.config.ts) so a running tab can always
// be identified. Falls back to a dev marker when the define is absent.
declare const __BUILD_INFO__: { version: string; commit: string; at: string } | undefined;

export const buildInfo =
  typeof __BUILD_INFO__ === 'undefined'
    ? { version: 'dev', commit: 'dev', at: '' }
    : __BUILD_INFO__;

/** Compact single-line stamp, e.g. `build mtrp9ue8 · 4780b15 · 2026-09-07 20:35Z`. */
export const buildLabel = `build ${buildInfo.version} · ${buildInfo.commit}${
  buildInfo.at ? ' · ' + buildInfo.at : ''
}`;

/**
 * The service worker serves cached assets first and waits for every tab to
 * close before activating a new build, so a published change can stay
 * invisible indefinitely. This drops the shell caches and unregisters the
 * worker so the next load fetches the current build.
 */
export async function loadLatestBuild() {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((r) => r.unregister()));
  }
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k.startsWith('steadier-shell-')).map((k) => caches.delete(k)),
    );
  }
  location.reload();
}
