import { demoSeed } from '../../../../packages/domain/src/seed';
import type { Bootstrap, Memory, Episode, Job, Proposal, Capture } from '../types';
import { localGet, localPut } from './idb';
let cached: Bootstrap | undefined;
const base = () => {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), createdAt: now, updatedAt: now, version: 1 };
};
export async function demoRequest<T>(path: string, method = 'GET', body: any = {}): Promise<T> {
  cached ??= (await localGet<Bootstrap>('state', 'demo')) || demoSeed();
  const state = cached;
  const p = path.split('?')[0].split('/').filter(Boolean);
  let result: any = {};
  if (p[0] === 'bootstrap') result = state;
  else if (p[0] === 'settings') {
    state.settings = { ...state.settings, ...body };
    state.budget.limitAud = state.settings.monthlyBudgetAud;
    state.budget.remainingAud = state.budget.limitAud;
    result = state.settings;
  } else if (p[0] === 'memories') {
    // The preview has no embeddings, so duplicates are shortlisted on shared
    // words alone. It is the same review-then-confirm flow, just a blunter net.
    if (p[1] === 'review')
      throw Error(
        'The standing review needs your connected workspace and an AI provider. It is not available in this preview.',
      );
    if (p[1] === 'duplicates') {
      const words = (m: Memory) =>
        new Set(
          (m.title + ' ' + m.text)
            .toLowerCase()
            .replace(/[^\p{L}\p{N}\s]/gu, ' ')
            .split(/\s+/)
            .filter(Boolean),
        );
      const pairs = [];
      for (let i = 0; i < state.memories.length; i++)
        for (let j = i + 1; j < state.memories.length; j++) {
          const a = words(state.memories[i]),
            b = words(state.memories[j]);
          let shared = 0;
          for (const w of a) if (b.has(w)) shared++;
          const score = shared / (a.size + b.size - shared);
          if (score >= 0.6)
            pairs.push({
              ids: [state.memories[i].id, state.memories[j].id],
              score: Math.round(score * 100) / 100,
              basis: 'wording',
            });
        }
      result = pairs;
    } else if (p[1] === 'merge') {
      const ids: string[] = body.ids || [];
      const found = state.memories.filter((m) => ids.includes(m.id));
      if (found.length < 2) throw Error('Two existing memories are needed to merge.');
      found.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const [keep, ...rest] = found;
      Object.assign(keep, {
        text: found.map((m) => m.text.trim()).join('\n\n'),
        tags: [...new Set(found.flatMap((m) => m.tags))],
        importance: Math.max(...found.map((m) => m.importance || 2)),
        pinned: found.some((m) => m.pinned),
        mergedFrom: rest.map((m) => m.id),
        reviewed: false,
        version: keep.version + 1,
        updatedAt: new Date().toISOString(),
      });
      const gone = rest.map((m) => m.id);
      state.memories = state.memories.filter((m) => !gone.includes(m.id));
      state.episodes = state.episodes.filter((e) => !e.memoryIds.some((id) => gone.includes(id)));
      result = keep;
    } else if (method === 'GET') result = state.memories;
    else if (method === 'POST') {
      const m: Memory = {
        ...base(),
        status: 'active',
        epistemic: 'user_reported',
        importance: 2,
        tags: [],
        entityIds: [],
        taskIds: [],
        pinned: false,
        sourceRetained: false,
        reviewed: true,
        ...body,
      };
      state.memories.unshift(m);
      result = m;
    } else if (method === 'PATCH') {
      const m = state.memories.find((m) => m.id === p[1]);
      if (!m) throw Error('Memory not found.');
      Object.assign(m, body, {
        version: m.version + 1,
        epistemic: 'user_corrected',
        reviewed: true,
        updatedAt: new Date().toISOString(),
      });
      result = m;
    } else {
      state.memories = state.memories.filter((m) => m.id !== p[1]);
      state.episodes = state.episodes.filter((e) => !e.memoryIds.includes(p[1]));
    }
  } else if (p[0] === 'tasks') {
    const t = state.tasks.find((t) => t.id === p[2]);
    if (!t) throw Error('Task not found.');
    if (p[3] === 'move') {
      const from = state.tasks.indexOf(t);
      state.tasks.splice(from, 1);
      const after = body.previous ? state.tasks.findIndex((x) => x.id === body.previous) : -1;
      state.tasks.splice(after + 1, 0, t);
      state.tasks.forEach((x, i) => (x.position = String(i).padStart(6, '0')));
      result = t;
    } else {
      const { checklist, ...changes } = body;
      Object.assign(t, changes);
      if (checklist) {
        const at = t.subtasks.findIndex((s) => s.id === checklist.id);
        if (checklist.add) t.subtasks.push(checklist.add);
        else if (checklist.remove) t.subtasks = t.subtasks.filter((s) => s.id !== checklist.id);
        else if (checklist.move) {
          const to = checklist.move === 'up' ? at - 1 : at + 1;
          if (at >= 0 && to >= 0 && to < t.subtasks.length)
            [t.subtasks[at], t.subtasks[to]] = [t.subtasks[to], t.subtasks[at]];
        } else if (at >= 0) Object.assign(t.subtasks[at], checklist);
      }
      result = t;
    }
  } else if (p[0] === 'proposals') {
    if (p.length === 1) {
      const proposal: Proposal = { ...base(), ...body, status: 'pending' };
      state.proposals.unshift(proposal);
      result = proposal;
    } else {
      const proposal = state.proposals.find((x) => x.id === p[1]);
      if (!proposal) throw Error('Suggestion not found.');
      if (p[2] === 'approve' && proposal.status === 'pending') {
        Object.assign(proposal, body);
        proposal.status = 'accepted';
        proposal.taskId = crypto.randomUUID();
        state.tasks.unshift({
          id: proposal.taskId,
          listId: proposal.listId || 'personal',
          title: proposal.title,
          notes: proposal.notes,
          status: 'needsAction',
          position: '0000',
          subtasks: [],
          tags: [],
          metadataValid: true,
          due: proposal.due,
        });
      } else if (p[2] === 'dismiss') proposal.status = 'dismissed';
      result = proposal;
    }
  } else if (p[0] === 'captures') {
    if (method === 'POST') {
      if (p[1] === 'audio')
        throw Error(
          'Audio transcription needs your connected workspace. You can try a typed note in this preview.',
        );
      const c: Capture = {
        ...base(),
        mode: body.mode,
        state: 'complete',
        memoryIds: [],
        proposalIds: [],
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      };
      if (body.mode === 'remember') {
        const m: Memory = {
          ...base(),
          kind: 'event',
          title: body.text.slice(0, 72),
          text: body.text,
          status: 'active',
          epistemic: 'user_reported',
          importance: 2,
          tags: ['Your note'],
          entityIds: [],
          taskIds: [],
          pinned: false,
          reviewed: false,
          sourceRetained: false,
        };
        state.memories.unshift(m);
        c.memoryIds = [m.id];
        c.response = 'Saved as a note. AI organisation is available in your connected workspace.';
      } else c.response = 'This temporary note has not been added to memory.';
      await localPut('state', 'capture-' + c.id, c);
      result = c;
    } else result = await localGet('state', 'capture-' + p[1]);
  } else if (p[0] === 'episodes') {
    if (method === 'POST') {
      const e: Episode = {
        ...base(),
        title:
          body.modules.length === 1 && body.modules[0] === 'custom'
            ? body.custom.slice(0, 80)
            : 'Daily briefing',
        modules: body.modules,
        minutes: body.minutes,
        durationSeconds: 45,
        script:
          'This is a sample briefing from Steadier. In your connected workspace, it would be built from your own tasks and memories.\n\nStart with one task. You do not have to finish everything today. Give the proposal outline fifteen uninterrupted minutes, write a rough version, then pick the next step.\n\nKeep the wider picture in view. Getting organised is a means to an end: more room for the work, people and decisions that matter. Your relationships, your health and your thinking time count.\n\nDo one thing, then the next.',
        status: 'ready',
        jobId: 'demo-' + crypto.randomUUID(),
        pinned: false,
        expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
        memoryRevision: 0,
        memoryIds: [],
        sources: [],
        chapters: [],
        costAud: 0,
        model: 'Sample narration',
        voice: 'Sample voice',
        demo: true,
      };
      state.episodes.unshift(e);
      result = e;
    } else if (p[2] === 'playback')
      result = { url: import.meta.env.BASE_URL + 'sample-briefing.wav' };
    else if (method === 'PATCH') {
      const e = state.episodes.find((e) => e.id === p[1]);
      if (e) Object.assign(e, body);
      result = e;
    } else if (method === 'DELETE') state.episodes = state.episodes.filter((e) => e.id !== p[1]);
  } else if (p[0] === 'chat')
    result = {
      text: 'This is a sample response, not real advice about your situation.\n\nPick the one task that would clear the most weight off the rest of today. Give its first step fifteen minutes and do not aim for perfect.\n\nOnce connected, the adviser uses your real tasks and memories to make this specific to you.',
      memoryIds: [],
      proposals: [],
      costAud: 0,
      demo: true,
    };
  else if (p[0] === 'templates') {
    if (method === 'DELETE') state.templates = state.templates.filter((t) => t.id !== p[1]);
    else {
      const t = { ...base(), ...body };
      state.templates.push(t);
      result = t;
    }
  } else if (p[0] === 'data') {
    const collections: Record<string, unknown[]> = {
      memories: state.memories,
      episodes: state.episodes,
      proposals: state.proposals,
      templates: state.templates,
      jobs: state.jobs,
      settings: [state.settings],
      budget: [state.budget],
      snapshots: [{ id: 'tasks', lists: state.lists, tasks: state.tasks }],
      captures: [],
      feedback: [],
      backups: [],
      deletions: [],
      devices: [],
      meta: [],
      vectors: [],
      connections: [],
      secrets: [],
      oauth: [],
    };
    if (!p[1]) result = { collections: Object.keys(collections) };
    else {
      const documents = collections[p[1]] || [];
      result = { collection: p[1], count: documents.length, documents };
    }
  } else if (p[0] === 'export')
    result = {
      format: 'steadier-export',
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: state.settings,
      memories: state.memories,
      templates: state.templates,
    };
  else if (p[0] === 'import') {
    if (body.format !== 'steadier-export' || !Array.isArray(body.memories))
      throw Error('Choose a Steadier memory export.');
    const { memorySchema } = await import('../../../../packages/domain/src/schemas');
    const values = body.memories.map((m: unknown) => memorySchema.parse(m));
    for (const m of values)
      state.memories.unshift({ ...base(), ...m, reviewed: false, sourceRetained: false });
    result = { imported: values.length };
  } else if (p[0] === 'backups') {
    if (method === 'GET') result = [];
    else throw Error('Encrypted backups are available in your connected workspace.');
  } else if (p[0] === 'memory' && method === 'DELETE') {
    state.memories = [];
    state.episodes = [];
    state.proposals = [];
  } else if (p[0] === 'feedback') result = { saved: true };
  else if (p[0] === 'reset') {
    cached = demoSeed();
    await localPut('state', 'demo', cached);
    return cached as T;
  } else if (p[0] === 'jobs') result = { id: p[1], status: 'complete', stage: 'Ready' };
  else
    throw Error(
      'This connection is available in your private workspace. See the setup guide to connect it.',
    );
  await localPut('state', 'demo', state);
  return structuredClone(result) as T;
}
