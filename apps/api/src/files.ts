import { mkdir, readFile, writeFile, unlink, readdir, stat } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';
import { Storage } from '@google-cloud/storage';
import { config, dataDir } from './config.js';
const cloud = new Storage();
export function localFile(key: string) {
  if (!/^(temp|audio|backup)\/[a-zA-Z0-9._/-]+$/.test(key) || key.includes('..'))
    throw new Error('Invalid file key');
  const root = resolve(dataDir, 'files');
  const path = resolve(root, key);
  if (!path.startsWith(root + sep)) throw new Error('Invalid file key');
  return path;
}
function bucket(key: string) {
  return cloud.bucket(
    key.startsWith('temp/')
      ? config.TEMP_BUCKET
      : key.startsWith('backup/')
        ? config.BACKUP_BUCKET
        : config.STORAGE_BUCKET,
  );
}
export async function saveFile(key: string, data: Buffer, type: string) {
  localFile(key);
  if (config.APP_MODE === 'cloud') {
    await bucket(key)
      .file(key)
      .save(data, {
        resumable: false,
        metadata: { contentType: type, cacheControl: 'private, no-store' },
      });
  } else {
    const p = localFile(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, data, { mode: 0o600 });
  }
}
export async function readFileData(key: string) {
  localFile(key);
  return config.APP_MODE === 'cloud'
    ? (await bucket(key).file(key).download())[0]
    : readFile(localFile(key));
}
export async function deleteFile(key: string) {
  localFile(key);
  if (config.APP_MODE === 'cloud') await bucket(key).file(key).delete({ ignoreNotFound: true });
  else
    await unlink(localFile(key)).catch((e: any) => {
      if (e.code !== 'ENOENT') throw e;
    });
}
export async function signedAudio(key: string) {
  const [url] = await bucket(key)
    .file(key)
    .getSignedUrl({ action: 'read', expires: Date.now() + 15 * 60000 });
  return url;
}
