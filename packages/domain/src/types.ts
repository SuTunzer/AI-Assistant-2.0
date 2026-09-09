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
    label: 'Daily priorities',
    description: 'Your top next actions from current tasks.',
    weight: 2,
  },
  {
    id: 'motivation',
    label: 'Motivation',
    description: 'A push to start what you have been avoiding.',
    weight: 1,
  },
  {
    id: 'strategy',
    label: 'Strategic review',
    description: 'Where your tasks and goals line up, and where they do not.',
    weight: 3,
  },
  {
    id: 'reflection',
    label: 'Reflection',
    description: 'Think through one thing on your mind.',
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
  defaultModules: ['priorities', 'motivation', 'strategy'],
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
