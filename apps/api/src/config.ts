import 'dotenv/config';
import { resolve } from 'node:path';
import { z } from 'zod';
const schema = z.object({
  APP_MODE: z.enum(['demo', 'local', 'cloud']).default('demo'),
  PORT: z.coerce.number().default(8787),
  HOST: z.string().default('127.0.0.1'),
  DATA_DIR: z.string().default('.data'),
  WEB_ORIGIN: z.string().url().default('http://127.0.0.1:5173'),
  WEB_APP_URL: z.string().url().default('http://127.0.0.1:5173/'),
  OWNER_UID: z.string().default(''),
  GOOGLE_CLOUD_PROJECT: z.string().default(''),
  GOOGLE_CLOUD_REGION: z.string().default('australia-southeast1'),
  QUEUE_NAME: z.string().default('steadier-jobs'),
  WORKER_URL: z.string().default(''),
  WORKER_SERVICE_ACCOUNT: z.string().default(''),
  STORAGE_BUCKET: z.string().default(''),
  TEMP_BUCKET: z.string().default(''),
  BACKUP_BUCKET: z.string().default(''),
  ENCRYPTION_KEY: z.string().default(''),
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GOOGLE_REDIRECT_URI: z.string().default('http://127.0.0.1:8787/api/google/callback'),
  LOCAL_ACCESS_TOKEN: z.string().default(''),
  MAINTENANCE_TOKEN: z.string().default(''),
  FFMPEG_PATH: z.string().default('ffmpeg'),
  NEWS_STORAGE_RIGHTS_CONFIRMED: z.string().default('false'),
  VAPID_PUBLIC_KEY: z.string().default(''),
  VAPID_PRIVATE_KEY: z.string().default(''),
  VAPID_SUBJECT: z.string().default('mailto:owner@example.com'),
});
export const config = schema.parse(process.env);
export function validateConfig() {
  if (config.APP_MODE === 'cloud')
    for (const key of [
      'OWNER_UID',
      'GOOGLE_CLOUD_PROJECT',
      'WORKER_URL',
      'WORKER_SERVICE_ACCOUNT',
      'STORAGE_BUCKET',
      'TEMP_BUCKET',
      'ENCRYPTION_KEY',
    ] as const)
      if (!config[key]) throw new Error(`Missing production setting: ${key}`);
  if (config.APP_MODE === 'local' && config.LOCAL_ACCESS_TOKEN.length < 24)
    throw new Error('LOCAL_ACCESS_TOKEN must be at least 24 characters in local mode.');
  if (config.APP_MODE !== 'cloud' && !['127.0.0.1', 'localhost', '::1'].includes(config.HOST))
    throw new Error('Development modes must bind only to loopback.');
  if (config.ENCRYPTION_KEY && Buffer.from(config.ENCRYPTION_KEY, 'base64').length !== 32)
    throw new Error('ENCRYPTION_KEY must be 32 base64-encoded bytes.');
}
export const dataDir = resolve(config.DATA_DIR);
