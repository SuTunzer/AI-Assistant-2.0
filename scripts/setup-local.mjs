import { readFile, writeFile, access } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
const path = new URL('../.env', import.meta.url);
try {
  await access(path);
  console.error('A .env file already exists. Edit it directly; it has not been overwritten.');
  process.exit(1);
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}
const token = randomBytes(32).toString('base64url');
let text = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
const values = {
  APP_MODE: 'local',
  VITE_APP_MODE: 'local',
  LOCAL_ACCESS_TOKEN: token,
  VITE_LOCAL_ACCESS_TOKEN: token,
  ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  MAINTENANCE_TOKEN: randomBytes(32).toString('base64url'),
};
for (const [k, v] of Object.entries(values))
  text = text.replace(new RegExp('^' + k + '=.*$', 'm'), k + '=' + v);
await writeFile(path, text, { mode: 0o600 });
console.log(
  'Private loopback configuration created in .env. Add your Google OAuth client, install FFmpeg, then run npm run dev. Provider keys can be added in Settings. Never publish .env.',
);
