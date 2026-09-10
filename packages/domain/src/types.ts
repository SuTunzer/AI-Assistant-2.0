// The first seven are things the user said. The last three are what the
// adviser noticed when it read a note against everything else it knows: a
// repeating pattern or psychological barrier, a risk building, an opening not
// being acted on. Those always carry `assistant_hypothesis` certainty.
export type MemoryKind =
  | 'goal'
  | 'person'
  | 'relationship'
  | 'issue'
  | 'decision'
  | 'preference'
  | 'event'
  | 'pattern'
  | 'risk'
  | 'opportunity';
export type Epistemic =
  'user_reported' | 'user_confirmed' | 'assistant_hypothesis' | 'user_corrected';
/** How much a memory should shape future advice: 3 core, 2 supporting, 1 incidental. */
export type Importance = 1 | 2 | 3;
/**
 * `motivation` is retired as a topic of its own: a push to start belongs with
 * the tasks it is pushing towards, so it is folded into `priorities`. The id
 * stays in the union because saved mixes, settings and older episodes still
 * carry it — `normalizeModules` turns it back into `priorities` on the way in.
 */
export type Module =
  'priorities' | 'motivation' | 'strategy' | 'reflection' | 'relationships' | 'news' | 'custom';
export interface BaseRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}
export interface Memory extends BaseRecord {
  kind: MemoryKind;
  title: string;
  text: string;
  status: 'active' | 'resolved' | 'uncertain';
  epistemic: Epistemic;
  importance: Importance;
  tags: string[];
  entityIds: string[];
  taskIds: string[];
  pinned: boolean;
  eventDate?: string;
  sourceId?: string;
  sourceRetained: boolean;
  reviewed: boolean;
  /** Ids folded into this record by a merge, kept so the history stays legible. */
  mergedFrom?: string[];
}
export interface ChecklistItem {
  id: string;
  title: string;
  done: boolean;
  createdAt: string;
  createdBy: 'user' | 'ai';
  [key: string]: unknown;
}
export interface Task {
  id: string;
  listId: string;
  title: string;
  status: 'needsAction' | 'completed';
  due?: string;
  position: string;
  parent?: string;
  notes: string;
  subtasks: ChecklistItem[];
  etag?: string;
  updated?: string;
  tags: string[];
  metadataValid: boolean;
}
export interface TaskList {
  id: string;
  title: string;
}
export interface Proposal extends BaseRecord {
  title: string;
  notes: string;
  reason: string;
  listId: string;
  due?: string;
  status: 'pending' | 'creating' | 'accepted' | 'dismissed' | 'uncertain';
  taskId?: string;
  sourceId?: string;
  error?: string;
}
export interface Source {
  id: string;
  title: string;
  url: string;
  publishedAt?: string;
  summary: string;
}
export interface Episode extends BaseRecord {
  title: string;
  modules: Module[];
  minutes: number;
  durationSeconds: number;
  script: string;
  status: 'queued' | 'working' | 'ready' | 'failed' | 'cancelled' | 'outdated';
  jobId: string;
  pinned: boolean;
  expiresAt: string;
  memoryRevision: number;
  memoryIds: string[];
  taskSyncedAt?: string;
  sources: Source[];
  chapters: { title: string; start: number }[];
  audioPath?: string;
  audioBytes?: number;
  checksum?: string;
  costAud: number;
  model: string;
  voice: string;
  error?: string;
  demo?: boolean;
}
/** What the last whole-store consolidation pass did, for the Memory screen. */
export interface Review {
  at: string;
  summary: string;
  syntheses: number;
  updates: number;
  retracted: number;
  duplicates: number;
  reviewed: number;
  model: string;
  costAud: number;
  error?: string;
}
export interface Job extends BaseRecord {
  kind: 'episode' | 'capture' | 'review';
  targetId: string;
  stage: string;
  status: 'queued' | 'running' | 'complete' | 'failed' | 'cancelled';
  attempts: number;
  leaseUntil?: string;
  cancelRequested: boolean;
  error?: string;
  progress?: { done: number; total: number };
  expiresAt: string;
  dispatchPending: boolean;
}
export interface Capture extends BaseRecord {
  mode: 'remember' | 'temporary';
  state: 'uploading' | 'queued' | 'processing' | 'complete' | 'failed' | 'expired';
  text?: string;
  audioPath?: string;
  mimeType?: string;
  memoryIds: string[];
  proposalIds: string[];
  expiresAt: string;
  jobId?: string;
  response?: string;
  error?: string;
}
export interface Template extends BaseRecord {
  name: string;
  modules: Module[];
  minutes: number;
  custom: string;
}
export interface Settings {
  name: string;
  timezone: string;
  selectedListIds: string[];
  monthlyBudgetAud: number;
  usdToAud: number;
  costBuffer: number;
  adviceProvider: 'anthropic' | 'gemini' | 'openai';
  adviceModel: string;
  /** The model that reads a note for facts. Transcription stays on Gemini (audio). */
  extractionProvider: 'anthropic' | 'gemini';
  extractionModel: string;
  transcriptionModel: string;
  /**
   * After the facts are saved, have the adviser (the advice model) read the
   * note against the whole profile for patterns, risks, opportunities and a
   * next move. The expensive half of a capture; off means facts only.
   */
  reflectOnCapture: boolean;
  /**
   * Let the adviser look things up for the user when a note raises something
   * worth researching. Only impersonal queries the adviser writes leave the
   * app -- never memories, never the note itself.
   */
  researchOnCapture: boolean;
  /**
   * How often the adviser re-reads the whole memory store on its own to
   * consolidate it. 0 turns the standing review off.
   */
  consolidateDays: number;
  voiceProvider: 'gemini' | 'google-cloud' | 'openai';
  voiceModel: string;
  voice: string;
  accent: string;
  newsInterests: string[];
  transcriptHours: 0 | 24;
  episodeDays: number;
  defaultModules: Module[];
  defaultMinutes: number;
}
export interface Budget {
  month: string;
  spentAud: number;
  reservedAud: number;
  limitAud: number;
  remainingAud: number;
}
export interface ConnectionStatus {
  google: boolean;
  anthropic: boolean;
  gemini: boolean;
  openai: boolean;
  news: boolean;
  push: boolean;
  cloudSpeech: boolean;
}
export interface Bootstrap {
  mode: 'demo' | 'local' | 'cloud';
  settings: Settings;
  memories: Memory[];
  tasks: Task[];
  lists: TaskList[];
  proposals: Proposal[];
  episodes: Episode[];
  jobs: Job[];
  templates: Template[];
  budget: Budget;
  connections: ConnectionStatus;
  review?: Review;
  taskSyncedAt?: string;
  taskError?: string;
}
export interface ChatReply {
  text: string;
  memoryIds: string[];
  proposals: Proposal[];
  costAud: number;
  demo?: boolean;
}
export const MODULES: { id: Module; label: string; description: string; weight: number }[] = [
  {
    id: 'priorities',
    label: 'Priorities & motivation',
    description: 'Your next few tasks, and the push to start them.',
    weight: 3,
  },
  {
    id: 'strategy',
    label: 'Strategic review',
    description: 'Your goals: what is moving, what has stalled, what to change.',
    weight: 3,
  },
  {
    id: 'reflection',
    label: 'Reflection',
    description: 'A look back over your goals and what you have saved.',
    weight: 2,
  },
  {
    id: 'relationships',
    label: 'Relationships',
    description: 'Follow-ups and unresolved threads with people.',
    weight: 2,
  },
  {
    id: 'news',
    label: 'News',
    description: 'AI, geopolitics and Melbourne.',
    weight: 3,
  },
  {
    id: 'custom',
    label: 'Custom topic',
    description: 'A specific question you set.',
    weight: 2,
  },
];
/**
 * Ids that no longer stand on their own, and the topic that absorbed them.
 * Anything stored before the change still parses; it just lands in its new
 * home. Kept as data so the next retirement is one more line.
 */
export const MERGED_MODULES: Partial<Record<Module, Module>> = { motivation: 'priorities' };
/** Folds retired ids into their replacement and drops the duplicates that creates. */
export function normalizeModules(modules: Module[]): Module[] {
  return [...new Set(modules.map((m) => MERGED_MODULES[m] ?? m))];
}
/**
 * What each topic is for, in the words the briefing writer is given. Module ids
 * alone left too much to the model's reading of a label: "strategy" drifted
 * into generic advice, and motivation into a pep talk detached from anything on
 * the list. These are the briefs it works from.
 */
export const MODULE_BRIEFS: Record<Exclude<Module, 'motivation'>, string> = {
  priorities:
    'Work through the tasks in the packet in the order given — these are the ones the user has decided to do next, and this is the plan. For each, say what the next concrete move is. Then, about these same tasks, give the push to start: name what is likely making the first one hard to begin and hand them a way in that takes minutes. Motivation here is always about starting and finishing these named tasks; never a general pep talk, and never about work that is not on this list.',
  strategy:
    'Work from the goals in the packet. For each goal that matters right now, say where it actually stands, which of the listed tasks move it and which do not, and what has quietly stalled. Name one change to where the effort is going. Only goals and evidence in the packet — never invent progress.',
  reflection:
    'Look back across the goals and the memories in the packet rather than forward at the task list. What has changed since these were written, what keeps recurring, what no longer fits. Offer one honest observation and one question worth sitting with. Reflect on what is there; do not manufacture a revelation.',
  relationships:
    'Follow-ups and unresolved threads with the people in the packet. Who is owed something, what has gone quiet, what conversation is being put off.',
  news: 'Cover the supplied news items only, briefly, and connect them to the user where the packet supports it. Every claim needs a source id.',
  custom: 'Answer the custom subject directly, using the packet as evidence.',
};
export const DEFAULT_SETTINGS: Settings = {
  name: '',
  timezone: 'Australia/Melbourne',
  selectedListIds: [],
  monthlyBudgetAud: 20,
  usdToAud: 1.6,
  costBuffer: 1.2,
  adviceProvider: 'anthropic',
  adviceModel: 'claude-sonnet-5',
  extractionProvider: 'gemini',
  extractionModel: 'gemini-3.5-flash-lite',
  transcriptionModel: 'gemini-3.5-flash',
  reflectOnCapture: true,
  researchOnCapture: false,
  consolidateDays: 7,
  voiceProvider: 'gemini',
  voiceModel: 'gemini-2.5-flash-preview-tts',
  voice: 'Kore',
  accent: 'British English',
  newsInterests: ['Artificial intelligence', 'Geopolitics', 'Melbourne local news'],
  transcriptHours: 0,
  episodeDays: 7,
  defaultModules: ['priorities', 'strategy'],
  defaultMinutes: 6,
};
export const IMPORTANCE_LABELS: Record<Importance, string> = {
  3: 'Core',
  2: 'Supporting',
  1: 'Incidental',
};
export const MEMORY_LABELS: Record<MemoryKind, string> = {
  goal: 'Goal',
  person: 'Person',
  relationship: 'Relationship',
  issue: 'Issue & risk',
  decision: 'Decision',
  preference: 'Preference',
  event: 'Update',
  pattern: 'Pattern',
  risk: 'Risk',
  opportunity: 'Opportunity',
};
