export type MemoryKind =
  'goal' | 'person' | 'relationship' | 'issue' | 'decision' | 'preference' | 'event';
export type Epistemic =
  'user_reported' | 'user_confirmed' | 'assistant_hypothesis' | 'user_corrected';
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
  tags: string[];
  entityIds: string[];
  taskIds: string[];
  pinned: boolean;
  eventDate?: string;
  sourceId?: string;
  sourceRetained: boolean;
  reviewed: boolean;
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
export interface Job extends BaseRecord {
  kind: 'episode' | 'capture';
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
  extractionModel: string;
  transcriptionModel: string;
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
    description: 'Find your most useful next steps.',
    weight: 2,
  },
  {
    id: 'motivation',
    label: 'A little motivation',
    description: 'Reconnect with your reason to begin.',
    weight: 1,
  },
  {
    id: 'strategy',
    label: 'The bigger picture',
    description: 'Make room for what matters long term.',
    weight: 3,
  },
  {
    id: 'reflection',
    label: 'Space to reflect',
    description: 'Untangle what is on your mind.',
    weight: 2,
  },
  {
    id: 'relationships',
    label: 'Your relationships',
    description: 'Give your connections some attention.',
    weight: 2,
  },
  {
    id: 'news',
    label: 'Your world, informed',
    description: 'AI, geopolitics and Melbourne.',
    weight: 3,
  },
  {
    id: 'custom',
    label: 'Something specific',
    description: 'Choose a question of your own.',
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
  extractionModel: 'gemini-2.5-flash-lite',
  transcriptionModel: 'gemini-2.5-flash',
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
export const MEMORY_LABELS: Record<MemoryKind, string> = {
  goal: 'Goal',
  person: 'Person',
  relationship: 'Relationship',
  issue: 'Issue & risk',
  decision: 'Decision',
  preference: 'Preference',
  event: 'Life update',
};
