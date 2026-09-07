// Injected by vite (see `define` in vite.config.ts) so a running tab can always
// be identified. Falls back to a dev marker when the define is absent.
declare const __BUILD_INFO__: { version: string; commit: string; at: string } | undefined;

export const buildInfo =
  typeof __BUILD_INFO__ === 'undefined'
    ? { version: 'dev', commit: 'dev', at: '' }
    : __BUILD_INFO__;

/** Compact single-line stamp, e.g. `build mtrp2k9x · 8e70e8b · 2026-09-07 20:41Z`. */
export const buildLabel = `build ${buildInfo.version} · ${buildInfo.commit}${
  buildInfo.at ? ' · ' + buildInfo.at : ''
}`;
