import { config } from './config.js';
import { store } from './store.js';
import { encrypt, decrypt } from './security.js';
import { saveFile, readFileData, deleteFile } from './files.js';
import { DomainError } from '../../../packages/domain/src/tasks.js';
import { memorySchema } from '../../../packages/domain/src/schemas.js';
export async function backupMemories(force = false) {
  if (
    config.APP_MODE === 'demo' ||
    !config.ENCRYPTION_KEY ||
    (config.APP_MODE === 'cloud' && !config.BACKUP_BUCKET)
  )
    return;
  const day = new Date().toISOString().slice(0, 10),
    id = 'backup-' + day;
  if (!force && (await store.get('backups', id))) return;
  const epoch = (await store.get('meta', 'privacy'))?.epoch || 0;
  const payload = {
    format: 'steadier-backup',
    version: 1,
    memories: await store.list('memories'),
    templates: await store.list('templates'),
  };
  const key = 'backup/' + id + '.enc';
  await saveFile(key, Buffer.from(encrypt(JSON.stringify(payload))), 'application/octet-stream');
  await store.put('backups', id, {
    id,
    key,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    count: payload.memories.length,
  });
  if (((await store.get('meta', 'privacy'))?.epoch || 0) !== epoch) {
    await deleteFile(key);
    await store.remove('backups', id);
  }
  for (const row of await store.list('backups'))
    if (Date.parse(row.expiresAt) < Date.now()) {
      await deleteFile(row.key);
      await store.remove('backups', row.id);
    }
}
export async function purgeBackups() {
  await store.atomic<any, void>('meta', 'privacy', (v) => ({
    value: { epoch: (v?.epoch || 0) + 1 },
    result: undefined,
  }));
  for (const row of await store.list('backups')) {
    await deleteFile(row.key);
    await store.remove('backups', row.id);
  }
}
export async function restoreBackup(id: string) {
  const row = await store.get('backups', id);
  if (!row || Date.parse(row.expiresAt) < Date.now())
    throw new DomainError('NOT_FOUND', 'That backup has expired.', 404);
  const payload = JSON.parse(decrypt((await readFileData(row.key)).toString()));
  if (payload.format !== 'steadier-backup')
    throw new DomainError('BACKUP_INVALID', 'This backup is not valid.');
  let restored = 0;
  for (const raw of payload.memories) {
    if ((await store.get('deletions', raw.id)) || (await store.get('memories', raw.id))) continue;
    const m = memorySchema.parse(raw);
    const created = await store.atomic<any, boolean>('memories', raw.id, (current) =>
      current
        ? { value: current, result: false }
        : { value: { ...raw, ...m, sourceRetained: false, reviewed: false }, result: true },
    );
    if (created) {
      if (await store.get('deletions', raw.id)) await store.remove('memories', raw.id);
      else restored++;
    }
  }
  await store.atomic<any, void>('meta', 'memory', (v) => ({
    value: { revision: (v?.revision || 0) + 1 },
    result: undefined,
  }));
  return { restored };
}
