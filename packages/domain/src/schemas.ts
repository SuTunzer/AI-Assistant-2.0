import { z } from 'zod';
import { normalizeModules, type Module } from './types.js';
export const moduleSchema = z.enum([
  'priorities',
  'motivation',
  'strategy',
  'reflection',
  'relationships',
  'news',
  'custom',
]);
// Records written before importance existed read as ordinary supporting context.
export const importanceSchema = z
  .union([z.literal(1), z.literal(2), z.literal(3)])
  .default(2)
  .catch(2);
export const memorySchema = z.object({
  kind: z.enum([
    'goal',
    'person',
    'relationship',
    'issue',
    'decision',
    'preference',
    'event',
    'pattern',
    'risk',
    'opportunity',
  ]),
  title: z.string().trim().min(1).max(160),
  text: z.string().trim().min(1).max(4000),
  status: z.enum(['active', 'resolved', 'uncertain']).default('active'),
  importance: importanceSchema,
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
      .transform((v) => normalizeModules(v as Module[])),
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
  extractionProvider: z.enum(['anthropic', 'gemini']).default('gemini'),
  extractionModel: z.string().regex(/^[a-zA-Z0-9._-]{1,100}$/),
  transcriptionModel: z.string().regex(/^gemini-[a-zA-Z0-9._-]{1,90}$/),
  reflectOnCapture: z.boolean().default(true),
  researchOnCapture: z.boolean().default(false),
  consolidateDays: z.number().int().min(0).max(90).default(7),
  voiceProvider: z.enum(['gemini', 'google-cloud', 'openai']),
  voiceModel: z.string().regex(/^[a-zA-Z0-9._-]{1,100}$/),
  voice: z.string().regex(/^[a-zA-Z0-9_-]{1,60}$/),
  accent: z.string().max(100),
  newsInterests: z.array(z.string().max(150)).max(12),
  transcriptHours: z.union([z.literal(0), z.literal(24)]),
  episodeDays: z.number().int().min(1).max(30),
  defaultModules: z
    .array(moduleSchema)
    .min(1)
    .max(7)
    .transform((v) => normalizeModules(v as Module[])),
  defaultMinutes: z.number().int().min(1).max(30),
});
// Every candidate carries the words it came from. The ceilings are a guard
// against a runaway response, not a budget for how much a note may say: a long,
// dense note is expected to fill them.
const evidenceSchema = z.string().min(1).max(1500);
export const extractionSchema = z.object({
  memories: z.array(memorySchema.extend({ evidence: evidenceSchema })).max(40),
  // A note that revises something already known updates it in place instead of
  // stacking a near-duplicate beside it.
  updates: z
    .array(
      z.object({
        id: z.string().max(100),
        title: z.string().trim().min(1).max(160).optional(),
        text: z.string().trim().min(1).max(4000).optional(),
        status: z.enum(['active', 'resolved', 'uncertain']).optional(),
        importance: importanceSchema.optional(),
        reason: z.string().max(500).default(''),
        evidence: evidenceSchema,
      }),
    )
    .max(20)
    .default([]),
  actions: z.array(proposalSchema).max(8),
  reply: z.string().max(5000).default(''),
});
// What the adviser returns after reading a note against the whole profile.
// Insights are inferences, not facts, so they are stored as hypotheses and
// must point at the memories or tasks they rest on.
export const reflectionSchema = z.object({
  insights: z
    .array(
      z.object({
        kind: z.enum(['issue', 'pattern', 'risk', 'opportunity']),
        title: z.string().trim().min(1).max(160),
        text: z.string().trim().min(1).max(4000),
        importance: importanceSchema,
        confidence: z.enum(['low', 'medium', 'high']).default('medium'),
        basedOn: z.array(z.string().max(200)).max(20).default([]),
      }),
    )
    .max(6)
    .default([]),
  actions: z.array(proposalSchema).max(4).default([]),
  // Impersonal search queries the adviser wants answered on the user's behalf.
  // These are the only text that ever leaves for a search engine.
  research: z
    .array(z.object({ query: z.string().trim().min(3).max(150), why: z.string().max(300) }))
    .max(3)
    .default([]),
  reply: z.string().max(6000).default(''),
});
export const researchSchema = z.object({
  text: z.string().max(6000).default(''),
  sourceIds: z.array(z.string().max(50)).max(12).default([]),
});
/**
 * The standing review: the adviser re-reading the whole store on its own. It
 * may add syntheses, re-rate and resolve, withdraw its own past conclusions
 * and flag duplicates -- but it never rewrites the words of a user's memory.
 */
export const consolidationSchema = z.object({
  syntheses: z
    .array(
      z.object({
        kind: z.enum(['issue', 'pattern', 'risk', 'opportunity']),
        title: z.string().trim().min(1).max(160),
        text: z.string().trim().min(1).max(4000),
        importance: importanceSchema,
        confidence: z.enum(['low', 'medium', 'high']).default('medium'),
        basedOn: z.array(z.string().max(200)).max(30).default([]),
      }),
    )
    .max(6)
    .default([]),
  updates: z
    .array(
      z.object({
        id: z.string().max(200),
        importance: importanceSchema.optional(),
        status: z.enum(['active', 'resolved', 'uncertain']).optional(),
        reason: z.string().max(300).default(''),
      }),
    )
    .max(40)
    .default([]),
  retractions: z
    .array(z.object({ id: z.string().max(200), reason: z.string().max(300).default('') }))
    .max(20)
    .default([]),
  duplicates: z
    .array(
      z.object({
        ids: z.array(z.string().max(200)).min(2).max(6),
        reason: z.string().max(300).default(''),
      }),
    )
    .max(20)
    .default([]),
  summary: z.string().max(4000).default(''),
});
