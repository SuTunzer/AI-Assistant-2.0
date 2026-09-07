import { mkdir, writeFile, access } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import webpush from 'web-push';
const directory = new URL('../.data/cloud-secrets/', import.meta.url);
await mkdir(directory, { recursive: true });
try {
  await access(new URL('encryption-key.txt', directory));
  console.error('Cloud keys already exist. They were not replaced.');
  process.exit(1);
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}
const vapid = webpush.generateVAPIDKeys();
await writeFile(new URL('encryption-key.txt', directory), randomBytes(32).toString('base64'), {
  mode: 0o600,
});
await writeFile(new URL('vapid-private-key.txt', directory), vapid.privateKey, { mode: 0o600 });
await writeFile(new URL('vapid-public-key.txt', directory), vapid.publicKey);
console.log('Cloud encryption and push keys created under .data/cloud-secrets (gitignored).');
console.log('Public VAPID key for cloud.config.json: ' + vapid.publicKey);
console.log('Keep the encryption key securely: backups and Google refresh tokens depend on it.');
