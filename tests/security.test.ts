import { afterAll, it, expect } from 'vitest';
import request from 'supertest';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const folder = await mkdtemp(join(tmpdir(), 'steadier-security-test-'));
process.env.APP_MODE = 'local';
process.env.DATA_DIR = folder;
process.env.LOCAL_ACCESS_TOKEN = randomBytes(32).toString('base64url');
process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64');
const { createApp } = await import('../apps/api/src/app');
const { encrypt, decrypt } = await import('../apps/api/src/security');
const { store } = await import('../apps/api/src/store');
const { backupMemories, restoreBackup, purgeBackups } = await import('../apps/api/src/backups');
const { readFileData } = await import('../apps/api/src/files');
const app = createApp();
afterAll(() => rm(folder, { recursive: true, force: true }));
it('rejects missing and incorrect local access tokens', async () => {
  expect((await request(app).get('/api/bootstrap')).status).toBe(401);
  expect(
    (await request(app).get('/api/bootstrap').set('Authorization', 'Bearer wrong')).status,
  ).toBe(401);
  expect(
    (
      await request(app)
        .get('/api/bootstrap')
        .set('Authorization', 'Bearer ' + process.env.LOCAL_ACCESS_TOKEN)
    ).status,
  ).toBe(200);
});
it('encrypts secrets with unique nonces and rejects ciphertext changes', () => {
  const one = encrypt('test-secret-value'),
    two = encrypt('test-secret-value');
  expect(one).not.toBe(two);
  expect(decrypt(one)).toBe('test-secret-value');
  const corrupted = Buffer.from(one, 'base64');
  corrupted[20] ^= 1;
  expect(() => decrypt(corrupted.toString('base64'))).toThrow();
});
it('keeps raw text out of encrypted backups and respects deletion tombstones during restore', async () => {
  const m = {
    id: 'memory-backup-test',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1,
    kind: 'goal',
    title: 'A private goal',
    text: 'Sensitive remembered context',
    status: 'active',
    epistemic: 'user_reported',
    tags: [],
    entityIds: [],
    taskIds: [],
    pinned: false,
    reviewed: true,
    sourceRetained: false,
  };
  await store.put('memories', m.id, m);
  await backupMemories(true);
  const backup = (await store.list('backups'))[0];
  expect((await readFileData(backup.key)).toString()).not.toContain(m.text);
  await store.remove('memories', m.id);
  expect((await restoreBackup(backup.id)).restored).toBe(1);
  await store.remove('memories', m.id);
  await store.put('deletions', m.id, { id: m.id });
  expect((await restoreBackup(backup.id)).restored).toBe(0);
  await purgeBackups();
  expect(await store.list('backups')).toEqual([]);
});
