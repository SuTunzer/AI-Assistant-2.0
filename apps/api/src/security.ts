import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { getAuth } from 'firebase-admin/auth';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { config } from './config.js';
import { firebase, store } from './store.js';
import { DomainError } from '../../../packages/domain/src/tasks.js';
const allowedSecrets = new Set([
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
  'OPENAI_API_KEY',
  'BRAVE_API_KEY',
]);
export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function encrypt(text: string) {
  if (!config.ENCRYPTION_KEY)
    throw new DomainError(
      'ENCRYPTION_NOT_CONFIGURED',
      'Configure server encryption before connecting accounts.',
      503,
    );
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', Buffer.from(config.ENCRYPTION_KEY, 'base64'), iv);
  const bytes = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), bytes]).toString('base64');
}
export function decrypt(text: string) {
  const b = Buffer.from(text, 'base64');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(config.ENCRYPTION_KEY, 'base64'),
    b.subarray(0, 12),
  );
  decipher.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([decipher.update(b.subarray(28)), decipher.final()]).toString('utf8');
}
export const authenticate: RequestHandler = async (req, res, next) => {
  try {
    if (config.APP_MODE === 'demo') return next();
    const token = req.headers.authorization?.replace(/^Bearer /, '') || '';
    if (config.APP_MODE === 'local') {
      if (!safeEqual(token, config.LOCAL_ACCESS_TOKEN))
        throw new DomainError('UNAUTHORIZED', 'Sign in to continue.', 401);
      return next();
    }
    firebase();
    const decoded = await getAuth().verifyIdToken(token, true);
    if (decoded.uid !== config.OWNER_UID)
      throw new DomainError('FORBIDDEN', 'This is a private personal workspace.', 403);
    res.locals.uid = decoded.uid;
    next();
  } catch (e) {
    next(
      e instanceof DomainError ? e : new DomainError('UNAUTHORIZED', 'Please sign in again.', 401),
    );
  }
};
const secretCache = new Map<string, { value: string; until: number }>();
export async function getSecret(name: string): Promise<string> {
  if (!allowedSecrets.has(name)) throw new Error('Unsupported secret');
  if (process.env[name]) return process.env[name]!;
  const cached = secretCache.get(name);
  if (cached && cached.until > Date.now()) return cached.value;
  if (config.APP_MODE === 'cloud') {
    try {
      const client = new SecretManagerServiceClient();
      const [v] = await client.accessSecretVersion({
        name: `projects/${config.GOOGLE_CLOUD_PROJECT}/secrets/steadier-${name.toLowerCase().replaceAll('_', '-')}/versions/latest`,
      });
      const value = v.payload?.data?.toString() || '';
      secretCache.set(name, { value, until: Date.now() + 60000 });
      return value;
    } catch {
      return '';
    }
  }
  const saved = await store.get('secrets', name);
  return saved ? decrypt(saved.encrypted) : '';
}
export async function setSecret(name: string, value: string) {
  if (!allowedSecrets.has(name)) throw new DomainError('INVALID_PROVIDER', 'Unsupported provider.');
  if (value.length < 10 || value.length > 1000)
    throw new DomainError('INVALID_KEY', 'Check your API key.');
  if (config.APP_MODE === 'demo')
    throw new DomainError('DEMO_MODE', 'API keys cannot be saved in demo mode.');
  if (process.env[name])
    throw new DomainError(
      'MANAGED_KEY',
      'This key is managed by your server environment. Update it in the deployment configuration.',
      409,
    );
  if (config.APP_MODE === 'cloud') {
    const client = new SecretManagerServiceClient();
    const id = `steadier-${name.toLowerCase().replaceAll('_', '-')}`;
    const parent = `projects/${config.GOOGLE_CLOUD_PROJECT}`;
    await client.addSecretVersion({
      parent: parent + '/secrets/' + id,
      payload: { data: Buffer.from(value) },
    });
  } else await store.put('secrets', name, { encrypted: encrypt(value) });
  secretCache.delete(name);
}
