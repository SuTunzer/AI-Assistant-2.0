import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const url = process.argv[2] || 'http://127.0.0.1:4174/steadier/';
const browser = await chromium.launch({
  channel: process.platform === 'win32' ? 'chrome' : undefined,
  headless: true,
});
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.getByRole('heading', { name: 'Know what to do next.' }).waitFor();
  const manifest = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]');
    return (await fetch(link.href)).json();
  });
  assert.equal(manifest.scope, new URL(url).pathname);
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  assert.equal(scope, url);
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('heading', { name: 'Know what to do next.' }).waitFor();
  await page.goto(url + '#/listen');
  await page.getByRole('button', { name: 'Try a sample briefing' }).click();
  await page.getByRole('button', { name: 'Play Daily briefing', exact: true }).click();
  await page.getByRole('button', { name: 'Pause audio', exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log('Repository-path install manifest, service worker and offline playback passed.');
} finally {
  await browser.close();
}
