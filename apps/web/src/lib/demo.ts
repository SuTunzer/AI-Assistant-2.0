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
    if (method === 'GET') result = state.memories;
    else if (method === 'POST') {
      const m: Memory = {
        ...base(),
        status: 'active',
        epistemic: 'user_reported',
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
    const { checklist, ...changes } = body;
    Object.assign(t, changes);
    if (checklist) {
      if (checklist.add) t.subtasks.push(checklist.add);
      else if (checklist.remove) t.subtasks = t.subtasks.filter((s) => s.id !== checklist.id);
      else {
        const s = t.subtasks.find((s) => s.id === checklist.id);
        if (s) Object.assign(s, checklist);
      }
    }
    result = t;
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
            : 'A little clarity for today',
        modules: body.modules,
        minutes: body.minutes,
        durationSeconds: 45,
        script:
          'This is a sample briefing from Steadier. In your connected workspace, this would be created from your own tasks and memories.\n\nStart with one useful action. You do not need to finish everything to make today count. Give the proposal outline fifteen uninterrupted minutes. Write something rough, then decide on the next step.\n\nKeep the bigger picture close. The point of getting organised is to make room for a life that feels meaningful. Your relationships, your health, and time to think are part of that.\n\nTake one small step, then build from there.',
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
      text: 'This is a sample response, rather than AI advice about your life.\n\nTry choosing one task that would make the rest of today feel lighter. Give its first step fifteen minutes, without trying to get it perfect.\n\nYour connected adviser will use your actual tasks and memories to make this specific to you.',
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
