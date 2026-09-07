import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const folder = await mkdtemp(join(tmpdir(), 'steadier-api-test-'));
process.env.DATA_DIR = folder;
process.env.APP_MODE = 'demo';
process.env.WEB_ORIGIN = 'http://127.0.0.1:5173';
const { createApp } = await import('../apps/api/src/app');
const { initializeData } = await import('../apps/api/src/services');
const { store } = await import('../apps/api/src/store');
const { runJob, maintenance } = await import('../apps/api/src/jobs');
const { localFile } = await import('../apps/api/src/files');
const app = createApp();
beforeAll(initializeData);
afterAll(async () => {
  await new Promise((r) => setTimeout(r, 100));
  await rm(folder, { recursive: true, force: true });
});
describe('private API behavior', () => {
  it('blocks mutations from another website', async () => {
    const r = await request(app)
      .post('/api/memories')
      .set('Origin', 'https://other.example')
      .send({ kind: 'goal', title: 'No', text: 'No' });
    expect(r.status).toBe(403);
  });
  it('does not expose the worker without its separate identity', async () => {
    expect((await request(app).post('/internal/jobs/test').send({})).status).toBe(403);
  });
  it('requires confirmation before a new task exists and handles duplicate approval', async () => {
    const before = (await request(app).get('/api/bootstrap')).body.tasks.length;
    const p = (
      await request(app)
        .post('/api/proposals')
        .send({ title: 'A proposed action', listId: 'personal' })
    ).body;
    expect(p.status).toBe('pending');
    expect((await request(app).get('/api/bootstrap')).body.tasks).toHaveLength(before);
    const a = await request(app)
      .post('/api/proposals/' + p.id + '/approve')
      .send({});
    expect(a.status).toBe(200);
    await request(app)
      .post('/api/proposals/' + p.id + '/approve')
      .send({});
    expect((await request(app).get('/api/bootstrap')).body.tasks).toHaveLength(before + 1);
  });
  it('preserves fields on a pin edit and rejects stale memory versions', async () => {
    const m = (
      await request(app)
        .post('/api/memories')
        .send({ kind: 'goal', title: 'A steady goal', text: 'Make room for a walk' })
    ).body;
    const updated = await request(app)
      .patch('/api/memories/' + m.id)
      .send({ pinned: true, version: m.version });
    expect(updated.status).toBe(200);
    expect(updated.body.text).toBe(m.text);
    expect(updated.body.pinned).toBe(true);
    expect(
      (
        await request(app)
          .patch('/api/memories/' + m.id)
          .send({ version: m.version, text: 'stale' })
      ).status,
    ).toBe(409);
  });
  it('does not turn a temporary capture into memory and purges its input', async () => {
    const before = (await store.list('memories')).length;
    const c = (
      await request(app)
        .post('/api/captures')
        .send({
          text: 'Do not remember this.',
          mode: 'temporary',
          idempotencyKey: 'temporary-test-1',
        })
    ).body;
    await runJob(c.jobId);
    await new Promise((r) => setTimeout(r, 80));
    const saved = await store.get('captures', c.id);
    expect(saved?.state).toBe('complete');
    expect(saved?.text).toBeUndefined();
    expect((await store.list('memories')).length).toBe(before);
    expect(await store.get('job_inputs', c.jobId)).toBeUndefined();
  });
  it('deduplicates repeated capture submissions', async () => {
    const body = { text: 'A repeat-safe note.', idempotencyKey: 'repeated-note-123' };
    const first = (await request(app).post('/api/captures').send(body)).body;
    const again = (await request(app).post('/api/captures').send(body)).body;
    expect(again.id).toBe(first.id);
    await runJob(first.jobId);
    await new Promise((r) => setTimeout(r, 80));
    expect((await store.list('memories')).filter((m) => m.sourceId === first.id)).toHaveLength(1);
  });
  it('removes expired temporary text and rejects path traversal', async () => {
    await store.put('captures', 'expired', {
      id: 'expired',
      expiresAt: '2000-01-01',
      text: 'sensitive',
    });
    await maintenance();
    expect(await store.get('captures', 'expired')).toBeUndefined();
    expect(() => localFile('temp/../../secrets')).toThrow();
    expect(() => localFile('C:/windows/file')).toThrow();
  });
  it('rejects incompatible models before saving them', async () => {
    expect(
      (await request(app).patch('/api/settings').send({ adviceModel: 'unpriced-model' })).status,
    ).toBe(400);
  });
});
