import { z } from 'zod';
export const moduleSchema = z.enum([
  'priorities',
  'motivation',
  'strategy',
  'reflection',
  'relationships',
  'news',
  'custom',
]);
export const memorySchema = z.object({
  kind: z.enum(['goal', 'person', 'relationship', 'issue', 'decision', 'preference', 'event']),
  title: z.string().trim().min(1).max(160),
  text: z.string().trim().min(1).max(4000),
  status: z.enum(['active', 'resolved', 'uncertain']).default('active'),
  epistemic: z
    .enum(['user_reported', 'user_confirmed', 'assistant_hypothesis', 'user_corrected'])
    .default('user_reported'),
  tags: z.array(z.string().max(60)).max(12).default([]),
  entityIds: z.array(z.string().max(100)).max(20).default([]),
  taskIds: z.array(z.string().max(200)).max(20).default([]),
  pinned: z.boolean().default(false),
  eventDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export const proposalSchema = z.object({
  title: z.string().trim().min(1).max(1024),
  notes: z.string().max(4000).default(''),
  reason: z.string().max(1000).default('Suggested action'),
  listId: z.string().max(200).default('@default'),
  due: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export const episodeSchema = z
  .object({
    modules: z
      .array(moduleSchema)
      .min(1)
      .max(7)
      .transform((v) => [...new Set(v)]),
    minutes: z.number().int().min(1).max(30),
    custom: z.string().trim().max(2000).default(''),
    idempotencyKey: z.string().min(8).max(100),
  })
  .refine((v) => !v.modules.includes('custom') || v.custom.length > 0, {
    message: 'Add your custom subject first.',
  });
export const settingsSchema = z.object({
  name: z.string().max(80),
  timezone: z
    .string()
    .max(80)
    .refine((v) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }, 'Choose a valid timezone'),
  selectedListIds: z.array(z.string().max(200)).max(20),
  monthlyBudgetAud: z.number().min(1).max(1000),
  usdToAud: z.number().min(0.5).max(5),
  costBuffer: z.number().min(1).max(2),
  adviceProvider: z.enum(['anthropic', 'gemini', 'openai']),
  adviceModel: z.string().regex(/^[a-zA-Z0-9._-]{1,100}$/),
  extractionModel: z.string().regex(/^gemini-[a-zA-Z0-9._-]{1,90}$/),
  transcriptionModel: z.string().regex(/^gemini-[a-zA-Z0-9._-]{1,90}$/),
  voiceProvider: z.enum(['gemini', 'google-cloud', 'openai']),
  voiceModel: z.string().regex(/^[a-zA-Z0-9._-]{1,100}$/),
  voice: z.string().regex(/^[a-zA-Z0-9_-]{1,60}$/),
  accent: z.string().max(100),
  newsInterests: z.array(z.string().max(150)).max(12),
  transcriptHours: z.union([z.literal(0), z.literal(24)]),
  episodeDays: z.number().int().min(1).max(30),
  defaultModules: z.array(moduleSchema).min(1).max(7),
  defaultMinutes: z.number().int().min(1).max(30),
});
export const extractionSchema = z.object({
  memories: z.array(memorySchema.extend({ evidence: z.string().min(1).max(1500) })).max(15),
  actions: z.array(proposalSchema).max(5),
  reply: z.string().max(5000).default(''),
});
