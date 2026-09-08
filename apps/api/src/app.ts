import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { OAuth2Client } from 'google-auth-library';
import { randomUUID, createHash } from 'node:crypto';
import { z, ZodError } from 'zod';
import { config } from './config.js';
import { store } from './store.js';
import { authenticate, setSecret, safeEqual } from './security.js';
import {
  bootstrap,
  settings,
  saveSettings,
  createMemory,
  editMemory,
  deleteMemory,
  mergeMemories,
  duplicateCandidates,
  addProposal,
  approveProposal,
  retrieve,
  extractMemories,
  ADVISER_SYSTEM,
  recordBase,
  feedbackContext,
} from './services.js';
import {
  createEpisode,
  createCapture,
  runJob,
  cancelJob,
  maintenance,
  retryCapture,
} from './jobs.js';
import {
  googleConnect,
  googleCallback,
  disconnectGoogle,
  patchGoogleTask,
  moveGoogleTask,
} from './google.js';
import { modelText, speech } from './providers.js';
import { reserveCost, settleCost } from './budget.js';
import { readFileData, signedAudio, deleteFile } from './files.js';
import {
  proposalSchema,
  moduleSchema,
  memorySchema,
} from '../../../packages/domain/src/schemas.js';
import { DomainError } from '../../../packages/domain/src/tasks.js';
import { toAud, MODEL_PRICES } from '../../../packages/domain/src/budget.js';
import type {
  Memory,
  Proposal,
  Episode,
  Job,
  Capture,
  Task,
} from '../../../packages/domain/src/types.js';
import { backupMemories, restoreBackup, purgeBackups } from './backups.js';
// Every collection the backend writes, for the Settings data browser.
const DATA_COLLECTIONS = [
  'memories',
  'episodes',
  'captures',
  'proposals',
  'templates',
  'feedback',
  'snapshots',
  'settings',
  'budget',
  'jobs',
  'backups',
  'deletions',
  'devices',
  'meta',
  'vectors',
  'connections',
  'secrets',
  'oauth',
] as const;
// Credential material is never returned, even though it is stored encrypted.
// Push subscription fields count: they let anyone notify the device.
const CREDENTIAL_FIELDS = new Set([
  'refresh',
  'encrypted',
  'verifier',
  'state',
  'endpoint',
  'keys',
  'auth',
  'p256dh',
]);
function redactStored(doc: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(doc))
    out[key] = CREDENTIAL_FIELDS.has(key)
      ? '[redacted]'
      : Array.isArray(value) && value.length > 64 && typeof value[0] === 'number'
        ? `[${value.length} numbers]`
        : value;
  return out;
}
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.APP_MODE === 'cloud' ? 1 : false);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin: (origin, done) => done(null, !origin || origin === config.WEB_ORIGIN),
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Capture-Mode', 'X-Upload-Id'],
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    }),
  );
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET' && req.headers.origin && req.headers.origin !== config.WEB_ORIGIN)
      return res
        .status(403)
        .json({ code: 'ORIGIN_DENIED', message: 'This origin is not allowed.' });
    next();
  });
  app.get('/health', (_req, res) =>
    res.json({ ok: true, service: 'steadier', mode: config.APP_MODE }),
  );
  app.post('/internal/jobs/:id', express.json(), async (req, res) => {
    await verifyWorker(req);
    await runJob(String(req.params.id));
    res.status(204).end();
  });
  app.post('/internal/maintenance', express.json(), async (req, res) => {
    await verifyWorker(req);
    await maintenance();
    res.status(204).end();
  });
  app.get('/api/google/callback', async (req, res) => {
    if (typeof req.query.state !== 'string' || typeof req.query.code !== 'string')
      throw new DomainError(
        'OAUTH_FAILED',
        'Google connection was not completed. Return to Settings.',
        400,
      );
    await googleCallback(req.query.state, req.query.code);
    res.redirect(config.WEB_APP_URL.replace(/\/$/, '') + '/#/settings?connected=1');
  });
  app.use(
    '/api',
    rateLimit({ windowMs: 60000, limit: 180, standardHeaders: true, legacyHeaders: false }),
    authenticate,
  );
  app.post(
    '/api/captures/audio',
    express.raw({ type: ['audio/*', 'application/octet-stream'], limit: '12mb' }),
    async (req, res) => {
      if (!Buffer.isBuffer(req.body) || !req.body.length)
        throw new DomainError('EMPTY_RECORDING', 'There is no recording to upload.');
      const mime = req.headers['content-type']?.split(';')[0] || '';
      if (
        !['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/mpeg', 'audio/aac'].includes(
          mime,
        )
      )
        throw new DomainError('AUDIO_FORMAT', 'This recording format is not supported.');
      const mode = req.headers['x-capture-mode'] === 'temporary' ? 'temporary' : 'remember';
      const key = z.string().min(8).max(100).optional().parse(req.headers['x-upload-id']);
      res.status(202).json(await createCapture('', mode, { bytes: req.body, mimeType: mime }, key));
    },
  );
  app.use('/api/import', express.json({ limit: '10mb' }));
  app.use(express.json({ limit: '256kb' }));
  app.get('/api/bootstrap', async (req, res) =>
    res.json(await bootstrap(req.query.refresh === 'true')),
  );
  app.get('/api/models', (_req, res) =>
    res.json({
      prices: MODEL_PRICES,
      speech: ['gemini-2.5-flash-preview-tts', 'gemini-2.5-pro-preview-tts', 'gpt-4o-mini-tts'],
      voices: {
        gemini: ['Kore', 'Aoede', 'Leda', 'Zephyr', 'Sulafat'],
        openai: ['coral', 'nova', 'marin', 'cedar'],
      },
      pricedAt: '2026-09-08',
    }),
  );
  app.patch('/api/settings', async (req, res) =>
    res.json(await saveSettings({ ...(await settings()), ...req.body })),
  );
  app.post('/api/connections/:provider', async (req, res) => {
    const names: Record<string, string> = {
      anthropic: 'ANTHROPIC_API_KEY',
      gemini: 'GEMINI_API_KEY',
      openai: 'OPENAI_API_KEY',
      news: 'BRAVE_API_KEY',
    };
    const provider = String(req.params.provider);
    if (!names[provider]) throw new DomainError('INVALID_PROVIDER', 'Unknown provider.');
    await setSecret(names[provider], z.string().parse(req.body.key));
    res.json({ connected: true });
  });
  app.post('/api/google/connect', async (_req, res) => res.json({ url: await googleConnect() }));
  app.delete('/api/google/connect', async (_req, res) => {
    await disconnectGoogle();
    res.status(204).end();
  });
  app.get('/api/memories', async (req, res) =>
    res.json(
      typeof req.query.q === 'string'
        ? await retrieve(req.query.q, 50)
        : await store.list('memories'),
    ),
  );
  // Registered before `:id` so neither word is read as a memory id.
  app.get('/api/memories/duplicates', async (_req, res) => res.json(await duplicateCandidates()));
  app.post('/api/memories/merge', async (req, res) =>
    res.json(await mergeMemories(z.array(z.string().max(100)).min(2).max(10).parse(req.body?.ids))),
  );
  app.post('/api/memories', async (req, res) => res.status(201).json(await createMemory(req.body)));
  app.patch('/api/memories/:id', async (req, res) =>
    res.json(
      await editMemory(String(req.params.id), req.body, z.number().int().parse(req.body.version)),
    ),
  );
  app.delete('/api/memories/:id', async (req, res) => {
    await deleteMemory(String(req.params.id));
    res.status(204).end();
  });
  app.post('/api/proposals', async (req, res) =>
    res.status(201).json(await addProposal(proposalSchema.parse(req.body))),
  );
  app.post('/api/proposals/:id/approve', async (req, res) => {
    const edits = proposalSchema.partial().parse(req.body || {});
    res.json(await approveProposal(String(req.params.id), edits));
  });
  app.post('/api/proposals/:id/dismiss', async (req, res) => {
    const p = await store.get<Proposal>('proposals', String(req.params.id));
    if (!p || !['pending', 'uncertain'].includes(p.status))
      throw new DomainError('NOT_FOUND', 'This suggestion is no longer pending.', 404);
    await store.put('proposals', p.id, { ...p, status: 'dismissed' });
    res.status(204).end();
  });
  app.patch('/api/tasks/:listId/:id', async (req, res) => {
    const change = z
      .object({
        status: z.enum(['needsAction', 'completed']).optional(),
        title: z.string().min(1).max(1024).optional(),
        due: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable()
          .optional(),
        etag: z.string().optional(),
        checklist: z
          .object({
            id: z.string().max(200),
            done: z.boolean().optional(),
            title: z.string().min(1).max(500).optional(),
            remove: z.boolean().optional(),
            move: z.enum(['up', 'down']).optional(),
            add: z
              .object({
                id: z.string().max(100),
                title: z.string().min(1).max(500),
                done: z.boolean(),
                createdAt: z.string(),
                createdBy: z.enum(['user', 'ai']),
              })
              .optional(),
          })
          .optional(),
      })
      .parse(req.body);
    if (config.APP_MODE === 'demo') {
      const snap = (await store.get('snapshots', 'tasks'))!;
      const t = snap.tasks.find((t: Task) => t.id === req.params.id);
      if (!t) throw new DomainError('NOT_FOUND', 'Task not found.', 404);
      if (change.status) t.status = change.status;
      if (change.title) t.title = change.title;
      if (change.due !== undefined) t.due = change.due;
      if (change.checklist) {
        const c = change.checklist;
        const at = t.subtasks.findIndex((s: any) => s.id === c.id);
        if (c.add) t.subtasks.push(c.add);
        else if (c.remove) t.subtasks = t.subtasks.filter((s: any) => s.id !== c.id);
        else if (c.move) {
          const to = c.move === 'up' ? at - 1 : at + 1;
          if (at >= 0 && to >= 0 && to < t.subtasks.length)
            [t.subtasks[at], t.subtasks[to]] = [t.subtasks[to], t.subtasks[at]];
        } else if (at >= 0) Object.assign(t.subtasks[at], c);
      }
      await store.put('snapshots', 'tasks', snap);
      return res.json(t);
    }
    res.json(await patchGoogleTask(String(req.params.listId), String(req.params.id), change));
  });
  app.post('/api/tasks/:listId/:id/move', async (req, res) => {
    const { previous } = z
      .object({ previous: z.string().max(200).nullable() })
      .parse(req.body || {});
    if (config.APP_MODE === 'demo') {
      const snap = (await store.get('snapshots', 'tasks'))!;
      const from = snap.tasks.findIndex((t: Task) => t.id === req.params.id);
      if (from < 0) throw new DomainError('NOT_FOUND', 'Task not found.', 404);
      const [moved] = snap.tasks.splice(from, 1);
      const after = previous ? snap.tasks.findIndex((t: Task) => t.id === previous) : -1;
      snap.tasks.splice(after + 1, 0, moved);
      // Restamp positions so the next read comes back in the same order the user
      // just arranged, matching how Google renumbers on a real move.
      snap.tasks.forEach((t: Task, i: number) => (t.position = String(i).padStart(6, '0')));
      await store.put('snapshots', 'tasks', snap);
      return res.json(moved);
    }
    res.json(await moveGoogleTask(String(req.params.listId), String(req.params.id), previous));
  });
  app.post('/api/captures', async (req, res) => {
    const b = z
      .object({
        text: z.string().trim().min(1).max(50000),
        mode: z.enum(['remember', 'temporary']).default('remember'),
        idempotencyKey: z.string().min(8).max(100).optional(),
      })
      .parse(req.body);
    res.status(202).json(await createCapture(b.text, b.mode, undefined, b.idempotencyKey));
  });
  app.get('/api/captures/:id', async (req, res) => {
    const c = await store.get<Capture>('captures', String(req.params.id));
    if (!c || Date.parse(c.expiresAt) < Date.now())
      throw new DomainError('CAPTURE_EXPIRED', 'This temporary capture has expired.', 410);
    res.json({ ...c, audioPath: undefined, text: c.state === 'complete' ? c.text : undefined });
  });
  app.post('/api/captures/:id/retry', async (req, res) =>
    res.status(202).json(await retryCapture(String(req.params.id))),
  );
  app.post('/api/chat', async (req, res) => {
    const b = z
      .object({
        text: z.string().trim().min(1).max(12000),
        mode: z.enum(['remember', 'temporary']).default('remember'),
        style: z.enum(['act', 'reflect', 'strategy', 'challenge']).default('act'),
        useContext: z.boolean().default(true),
        history: z
          .array(z.object({ role: z.enum(['you', 'adviser']), text: z.string().max(12000) }))
          .max(8)
          .default([]),
      })
      .parse(req.body);
    const s = await settings(),
      id = 'chat-' + randomUUID();
    const month = await reserveCost(id, config.APP_MODE === 'demo' ? 0 : toAud(0.4, s), s);
    try {
      const memories = b.useContext ? await retrieve(b.text, 12) : [];
      const snapshot = b.useContext ? await store.get('snapshots', 'tasks') : undefined;
      let text: string,
        usd = 0;
      let memoryIds: string[] = [],
        proposals: Proposal[] = [];
      if (config.APP_MODE === 'demo')
        text =
          'This is a sample response. Pick one action you can finish in the next fifteen minutes and start there. What is blocking the first step?\n\nConnect your private workspace for advice grounded in your own tasks and memories.';
      else {
        const r = await modelText(
          s.adviceProvider,
          s.adviceModel,
          ADVISER_SYSTEM,
          JSON.stringify({
            message: b.text,
            history: b.history,
            style: b.style,
            feedback: await feedbackContext(),
            memories,
            tasks: snapshot?.tasks?.slice(0, 30).map((t: Task) => ({
              id: t.id,
              title: t.title,
              status: t.status,
              due: t.due,
              subtasks: t.subtasks,
            })),
            taskSnapshotAt: snapshot?.syncedAt,
            temporary: b.mode === 'temporary',
          }),
          1800,
        );
        text = r.text;
        usd += r.usd;
        if (b.mode === 'remember') {
          const extracted = await extractMemories(b.text, id, s);
          memoryIds = extracted.memories.map((m) => m.id);
          proposals = extracted.proposals;
          usd += extracted.usd;
        }
      }
      await settleCost(id, month, toAud(usd, s));
      res.json({
        text,
        memoryIds,
        proposals,
        costAud: toAud(usd, s),
        demo: config.APP_MODE === 'demo',
      });
    } catch (e) {
      await settleCost(id, month);
      throw e;
    }
  });
  app.post('/api/episodes', async (req, res) =>
    res.status(202).json(await createEpisode(req.body)),
  );
  app.get('/api/jobs/:id', async (req, res) => {
    const j = await store.get<Job>('jobs', String(req.params.id));
    if (!j) throw new DomainError('NOT_FOUND', 'Job not found.', 404);
    res.json(j);
  });
  app.post('/api/jobs/:id/cancel', async (req, res) =>
    res.json(await cancelJob(String(req.params.id))),
  );
  app.get('/api/episodes/:id/playback', async (req, res) => {
    const ep = await store.get<Episode>('episodes', String(req.params.id));
    if (
      !ep ||
      ep.status !== 'ready' ||
      !ep.audioPath ||
      (!ep.pinned && Date.parse(ep.expiresAt) < Date.now())
    )
      throw new DomainError(
        'AUDIO_UNAVAILABLE',
        'This audio is not available. Create a new episode.',
        404,
      );
    if (config.APP_MODE === 'cloud')
      res.json({
        url: await signedAudio(ep.audioPath),
        checksum: ep.checksum,
        bytes: ep.audioBytes,
      });
    else
      res.json({
        url: '/api/episodes/' + ep.id + '/audio',
        checksum: ep.checksum,
        bytes: ep.audioBytes,
      });
  });
  app.get('/api/episodes/:id/audio', async (req, res) => {
    const ep = await store.get<Episode>('episodes', String(req.params.id));
    if (!ep || ep.status !== 'ready' || !ep.audioPath)
      throw new DomainError('NOT_FOUND', 'Audio not found.', 404);
    res.type('audio/mpeg').send(await readFileData(ep.audioPath));
  });
  app.patch('/api/episodes/:id', async (req, res) => {
    const body = z.object({ pinned: z.boolean() }).parse(req.body);
    const ep = await store.get<Episode>('episodes', String(req.params.id));
    if (!ep) throw new DomainError('NOT_FOUND', 'Episode not found.', 404);
    await store.put('episodes', ep.id, { ...ep, ...body });
    res.json({ ...ep, ...body });
  });
  app.delete('/api/episodes/:id', async (req, res) => {
    const ep = await store.get<Episode>('episodes', String(req.params.id));
    if (ep) {
      const j = await store.get<Job>('jobs', ep.jobId);
      if (j && ['running', 'queued'].includes(j.status)) await cancelJob(j.id);
      if (ep.audioPath) await deleteFile(ep.audioPath);
      await store.remove('episodes', ep.id);
    }
    res.status(204).end();
  });
  app.post('/api/templates', async (req, res) => {
    const body = z
      .object({
        name: z.string().trim().min(1).max(80),
        modules: z.array(moduleSchema).min(1).max(7),
        minutes: z.number().int().min(1).max(30),
        custom: z.string().max(2000).default(''),
      })
      .parse(req.body);
    const t = { ...recordBase(), ...body };
    await store.put('templates', t.id, t);
    res.status(201).json(t);
  });
  app.delete('/api/templates/:id', async (req, res) => {
    await store.remove('templates', String(req.params.id));
    res.status(204).end();
  });
  app.get('/api/push/key', (_req, res) => res.json({ key: config.VAPID_PUBLIC_KEY }));
  app.post('/api/push', async (req, res) => {
    const subscription = z
      .object({
        endpoint: z.string().url(),
        keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
      })
      .parse(req.body);
    const url = new URL(subscription.endpoint);
    if (
      url.protocol !== 'https:' ||
      !['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'].includes(
        url.hostname,
      )
    )
      throw new DomainError('INVALID_PUSH_ENDPOINT', 'This push service is not supported.');
    const id = createHash('sha256').update(subscription.endpoint).digest('hex');
    await store.put('devices', id, { id, subscription, createdAt: new Date().toISOString() });
    res.json({ enabled: true });
  });
  app.delete('/api/push', async (req, res) => {
    const endpoint = z.string().parse(req.body.endpoint);
    await store.remove('devices', createHash('sha256').update(endpoint).digest('hex'));
    res.status(204).end();
  });
  app.post('/api/feedback', async (req, res) => {
    const body = z
      .object({
        kind: z.enum(['useful', 'irrelevant', 'incorrect', 'too_soft', 'too_pushy']),
        targetId: z.string().max(100),
        note: z.string().max(500).default(''),
      })
      .parse(req.body);
    const f = { ...recordBase(), ...body };
    await store.put('feedback', f.id, f);
    res.status(201).json({ saved: true });
  });
  app.get('/api/export', async (_req, res) => {
    res.setHeader('Content-Disposition', 'attachment; filename="steadier-memories.json"');
    res.json({
      format: 'steadier-export',
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: await settings(),
      memories: await store.list('memories'),
      templates: await store.list('templates'),
    });
  });
  app.get('/api/data', (_req, res) => res.json({ collections: DATA_COLLECTIONS }));
  app.get('/api/data/:collection', async (req, res) => {
    const name = z.enum(DATA_COLLECTIONS).parse(req.params.collection);
    const documents = (await store.list(name)).map(redactStored);
    res.json({ collection: name, count: documents.length, documents });
  });
  app.get('/api/backups', async (_req, res) =>
    res.json(
      (await store.list('backups')).map(({ id, createdAt, expiresAt, count }) => ({
        id,
        createdAt,
        expiresAt,
        count,
      })),
    ),
  );
  app.post('/api/backups', async (_req, res) => {
    await backupMemories(true);
    res.json({ saved: config.APP_MODE !== 'demo' });
  });
  app.post('/api/backups/:id/restore', async (req, res) => {
    if (req.body.confirm !== true)
      throw new DomainError('CONFIRMATION_REQUIRED', 'Confirm the backup restore.');
    res.json(await restoreBackup(String(req.params.id)));
  });
  app.post('/api/import', async (req, res) => {
    const b = z
      .object({
        format: z.literal('steadier-export'),
        version: z.literal(1),
        memories: z.array(z.unknown()).max(2000),
      })
      .passthrough()
      .parse(req.body);
    let count = 0;
    const validated = b.memories.map((m) => memorySchema.parse(m));
    for (const m of validated) {
      await createMemory(m);
      count++;
    }
    res.json({ imported: count });
  });
  app.delete('/api/memory', async (req, res) => {
    if (req.body.confirm !== 'DELETE MY MEMORIES')
      throw new DomainError('CONFIRMATION_REQUIRED', 'Type the confirmation phrase first.');
    await purgeBackups();
    for (const j of await store.list<Job>('jobs'))
      if (['running', 'queued'].includes(j.status)) await cancelJob(j.id);
    for (const c of await store.list<Capture>('captures')) {
      await store.put('deletions', c.id, { id: c.id, deletedAt: new Date().toISOString() });
      if (c.audioPath) await deleteFile(c.audioPath);
      await store.remove('captures', c.id);
      if (c.jobId) await store.remove('job_inputs', c.jobId);
    }
    for (const m of await store.list<Memory>('memories')) await deleteMemory(m.id);
    for (const e of await store.list<Episode>('episodes')) {
      if (e.audioPath) await deleteFile(e.audioPath);
      await store.remove('episodes', e.id);
    }
    for (const p of await store.list<Proposal>('proposals')) await store.remove('proposals', p.id);
    for (const f of await store.list('feedback')) await store.remove('feedback', f.id);
    res.status(204).end();
  });
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError)
      return res.status(400).json({
        code: 'INVALID_INPUT',
        message: err.issues[0]?.message || 'Check the supplied values.',
      });
    if (err instanceof DomainError)
      return res.status(err.status).json({ code: err.code, message: err.message });
    if ((err as any)?.type === 'entity.too.large')
      return res
        .status(413)
        .json({ code: 'TOO_LARGE', message: 'This upload is too large. Try a shorter recording.' });
    console.error('Request failed:', err instanceof Error ? err.name : 'UnknownError');
    res.status(500).json({
      code: 'SERVER_ERROR',
      message: 'Something went wrong. Your saved information is safe. Please retry.',
    });
  });
  return app;
}
async function verifyWorker(req: Request) {
  if (config.APP_MODE !== 'cloud') {
    if (
      !config.MAINTENANCE_TOKEN ||
      !safeEqual(req.headers.authorization || '', `Bearer ${config.MAINTENANCE_TOKEN}`)
    )
      throw new DomainError('FORBIDDEN', 'Worker authentication required.', 403);
    return;
  }
  try {
    const token = req.headers.authorization?.replace(/^Bearer /, '') || '';
    const ticket = await new OAuth2Client().verifyIdToken({
      idToken: token,
      audience: config.WORKER_URL,
    });
    if (
      ticket.getPayload()?.email !== config.WORKER_SERVICE_ACCOUNT ||
      !ticket.getPayload()?.email_verified
    )
      throw Error();
  } catch {
    throw new DomainError('FORBIDDEN', 'Worker authentication required.', 403);
  }
}
