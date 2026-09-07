import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const base = env.VITE_BASE_PATH || '/';
  if (!base.startsWith('/') || !base.endsWith('/') || base.includes('..'))
    throw new Error('VITE_BASE_PATH must start and end with a slash.');
  const version = Date.now().toString(36);
  if (mode === 'production' && env.VITE_APP_MODE === 'local')
    throw new Error(
      'Local authentication must never be built for public hosting. Choose cloud or demo mode.',
    );
  return {
    root: 'apps/web',
    envDir: process.cwd(),
    base,
    plugins: [
      react(),
      {
        name: 'steadier-offline-manifest',
        generateBundle(_options, bundle) {
          const urls = Object.keys(bundle)
            .filter((name) => !name.endsWith('.map'))
            .map((name) => base + name);
          this.emitFile({
            type: 'asset',
            fileName: 'precache.json',
            source: JSON.stringify({
              version,
              urls: [base, ...urls, base + 'icons/icon-192.png', base + 'icons/icon-512.png'],
            }),
          });
          this.emitFile({
            type: 'asset',
            fileName: 'sw.js',
            source: readFileSync(resolve('apps/web/public/sw.js'), 'utf8').replace(
              '__STEADIER_BUILD__',
              version,
            ),
          });
          this.emitFile({
            type: 'asset',
            fileName: 'manifest.webmanifest',
            source: JSON.stringify({
              id: base,
              name: 'Steadier — your second brain',
              short_name: 'Steadier',
              description: 'Capture notes, track your tasks, and get a daily audio briefing.',
              start_url: base,
              scope: base,
              display: 'standalone',
              background_color: '#f7f8f2',
              theme_color: '#173f36',
              icons: [
                { src: base + 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
                {
                  src: base + 'icons/icon-512.png',
                  sizes: '512x512',
                  type: 'image/png',
                  purpose: 'any maskable',
                },
              ],
            }),
          });
        },
      },
    ],
    server: { port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:8787' } },
    preview: { port: 4173, strictPort: true },
    build: { outDir: resolve('dist/web'), emptyOutDir: true, sourcemap: false },
  };
});
