import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const folder = await mkdtemp(join(tmpdir(), 'steadier-memory-test-'));
process.env.DATA_DIR = folder;
// Demo mode short-circuits extraction into a single verbatim note, so these run
// against the real path with the provider scripted instead.
process.env.APP_MODE = 'local';
process.env.LOCAL_ACCESS_TOKEN = 'a-local-token-of-sufficient-length';
const provider = vi.hoisted(() => ({ modelJson: vi.fn(), searchWeb: vi.fn() }));
vi.mock('../apps/api/src/providers', async (original) => ({
  ...(await original<typeof import('../apps/api/src/providers')>()),
  modelJson: provider.modelJson,
  searchWeb: provider.searchWeb,
  embed: async () => undefined,
}));
const {
  extractMemories,
  reflect,
  consolidate,
  profile,
  createMemory,
  mergeMemories,
  duplicateCandidates,
  retrieve,
  saveSettings,
} = await import('../apps/api/src/services');
const { captureEstimate } = await import('../packages/domain/src/budget');
const { geminiThinking } = await import('../apps/api/src/providers');
const { store } = await import('../apps/api/src/store');
const { DEFAULT_SETTINGS } = await import('../packages/domain/src/types');
const settings = { ...DEFAULT_SETTINGS, selectedListIds: ['personal'] };
/** Scripts one extraction response in the shape `modelJson` returns. */
function reply(data: unknown) {
  provider.modelJson.mockResolvedValueOnce({
    text: '',
    inputTokens: 0,
    outputTokens: 0,
    usd: 0,
    data,
  });
}
const candidate = (title: string, evidence: string, extra: object = {}) => ({
  kind: 'event',
  title,
  text: title,
  evidence,
  ...extra,
});
beforeAll(() => provider.modelJson.mockReset());
afterAll(async () => {
  await new Promise((r) => setTimeout(r, 100));
  await rm(folder, { recursive: true, force: true });
});
describe('memory extraction', () => {
  it('keeps a faithful quote whose punctuation the model tidied', async () => {
    const note =
      'I told Priya I’d take the lead on the migration —\n    the deadline is the end of March.';
    reply({
      // Straightened quote, dash swapped, line break collapsed: still the user's words.
      memories: [candidate('Leading the migration', "I told Priya I'd take the lead")],
      actions: [],
      reply: 'Noted.',
    });
    const r = await extractMemories(note, 'source-tidy', settings);
    expect(r.memories.map((m) => m.title)).toEqual(['Leading the migration']);
  });
  it('drops a quote the note never contained', async () => {
    reply({
      memories: [
        candidate('Real', 'the deadline is the end of March'),
        candidate('Invented', 'my doctor diagnosed me with burnout last winter'),
      ],
      actions: [],
      reply: '',
    });
    const r = await extractMemories('The deadline is the end of March.', 'source-invent', settings);
    expect(r.memories.map((m) => m.title)).toEqual(['Real']);
  });
  it('keeps every distinct point in a dense note instead of capping at a headline few', async () => {
    const points = Array.from({ length: 20 }, (_, i) => `Point number ${i} matters to me.`);
    reply({
      memories: points.map((p, i) => candidate('Point ' + i, p, { importance: (i % 3) + 1 })),
      actions: [],
      reply: '',
    });
    const r = await extractMemories(points.join(' '), 'source-dense', settings);
    expect(r.memories).toHaveLength(20);
    expect(r.memories.filter((m) => m.importance === 3).length).toBeGreaterThan(0);
  });
  it('revises an existing memory in place rather than stacking a near-duplicate', async () => {
    const existing = await createMemory({
      kind: 'goal',
      title: 'Run a marathon',
      text: 'I want to run a marathon.',
      importance: 2,
    });
    const before = (await store.list('memories')).length;
    reply({
      memories: [],
      updates: [
        {
          id: existing.id,
          text: 'I have entered the April marathon.',
          importance: 3,
          reason: 'The plan firmed up.',
          evidence: 'I have entered the April marathon',
        },
      ],
      actions: [],
      reply: '',
    });
    const r = await extractMemories(
      'I have entered the April marathon, so training starts now.',
      'source-revise',
      settings,
    );
    expect((await store.list('memories')).length).toBe(before);
    const after = await store.get('memories', existing.id);
    expect(after.text).toBe('I have entered the April marathon.');
    expect(after.importance).toBe(3);
    expect(after.version).toBe(existing.version + 1);
    // A model-derived revision is not the user's own correction and nobody has
    // read it yet, so it returns to the review queue with its certainty intact.
    expect(after.epistemic).toBe('user_reported');
    expect(after.reviewed).toBe(false);
    expect(r.memories.map((m) => m.id)).toContain(existing.id);
  });
  it('never lets an inferred revision overwrite what the user corrected', async () => {
    const corrected = await createMemory({
      kind: 'preference',
      title: 'Coaching tone',
      text: 'Direct, no guilt trips.',
      epistemic: 'user_corrected',
    });
    reply({
      memories: [],
      updates: [
        {
          id: corrected.id,
          text: 'Prefers gentle encouragement.',
          reason: 'Reinterpreting the tone.',
          evidence: 'Prefers gentle encouragement',
        },
      ],
      actions: [],
      reply: '',
    });
    await extractMemories('Prefers gentle encouragement.', 'source-override', settings);
    const after = await store.get('memories', corrected.id);
    expect(after.text).toBe('Direct, no guilt trips.');
    expect(after.version).toBe(corrected.version);
  });
  it('ignores a revision whose evidence is not in the note', async () => {
    const existing = await createMemory({
      kind: 'goal',
      title: 'Learn Spanish',
      text: 'I would like to learn Spanish.',
    });
    reply({
      memories: [],
      updates: [
        {
          id: existing.id,
          status: 'resolved',
          reason: 'Invented completion.',
          evidence: 'I am now fluent in Spanish',
        },
      ],
      actions: [],
      reply: '',
    });
    await extractMemories('I booked a Spanish class for Tuesday.', 'source-bad-update', settings);
    expect((await store.get('memories', existing.id)).status).toBe('active');
  });
});
describe('memory reconciliation', () => {
  it('folds duplicates into the oldest record and repoints what referenced them', async () => {
    const first = await createMemory({
      kind: 'goal',
      title: 'Marathon training',
      text: 'Training for a marathon.',
      importance: 1,
      tags: ['Health'],
    });
    await new Promise((r) => setTimeout(r, 5));
    const second = await createMemory({
      kind: 'goal',
      title: 'Running a marathon in April',
      text: 'The marathon is in April.',
      importance: 3,
      tags: ['Running'],
      pinned: true,
    });
    await store.put('episodes', 'e-merge', {
      id: 'e-merge',
      memoryIds: [second.id],
      pinned: false,
      audioPath: undefined,
    } as never);
    const merged = await mergeMemories([second.id, first.id]);
    expect(merged.id).toBe(first.id);
    expect(merged.text).toContain('Training for a marathon.');
    expect(merged.text).toContain('The marathon is in April.');
    // A merge must not quietly demote or unpin: the strongest claim survives.
    expect(merged.importance).toBe(3);
    expect(merged.pinned).toBe(true);
    expect(merged.tags).toEqual(expect.arrayContaining(['Health', 'Running']));
    expect(merged.mergedFrom).toEqual([second.id]);
    expect(merged.reviewed).toBe(false);
    expect(await store.get('memories', second.id)).toBeUndefined();
    expect((await store.get('episodes', 'e-merge')).memoryIds).toEqual([first.id]);
    // Folding a duplicate in is not a deletion: the shared source stays usable.
    expect(await store.get('deletions', second.id)).toBeUndefined();
  });
  it('refuses a merge that would not join two surviving records', async () => {
    const only = await createMemory({ kind: 'event', title: 'Alone', text: 'One record.' });
    await expect(mergeMemories([only.id, 'does-not-exist'])).rejects.toThrow();
  });
  it('shortlists near-identical memories by meaning when embeddings exist', async () => {
    const a = await createMemory({
      kind: 'issue',
      title: 'Car needs a service',
      text: 'The car is overdue for a service.',
    });
    const b = await createMemory({
      kind: 'issue',
      title: 'Book the car in',
      text: 'I still have not booked the car service.',
    });
    const vector = Array.from({ length: 32 }, (_, i) => Math.sin(i));
    await store.put('vectors', a.id, { id: a.id, memoryId: a.id, values: vector });
    await store.put('vectors', b.id, {
      id: b.id,
      memoryId: b.id,
      values: vector.map((v) => v + 0.01),
    });
    const pairs = await duplicateCandidates();
    const hit = pairs.find((p) => p.ids.includes(a.id) && p.ids.includes(b.id));
    expect(hit?.basis).toBe('meaning');
    expect(hit!.score).toBeGreaterThan(0.86);
  });
});
describe('memory importance', () => {
  it('carries a core memory over an incidental one that matches the same words', async () => {
    const core = await createMemory({
      kind: 'goal',
      title: 'Quarterly proposal',
      text: 'The quarterly proposal is my main focus.',
      importance: 3,
    });
    const aside = await createMemory({
      kind: 'event',
      title: 'Proposal font',
      text: 'The quarterly proposal template uses the wrong font.',
      importance: 1,
    });
    const ranked = (await retrieve('quarterly proposal', 30)).map((m) => m.id);
    expect(ranked.indexOf(core.id)).toBeLessThan(ranked.indexOf(aside.id));
  });
});
describe('reflection', () => {
  it('turns what the adviser noticed into hypotheses tied to the evidence it was shown', async () => {
    const goal = await createMemory({
      kind: 'goal',
      title: 'Finish the thesis draft',
      text: 'The thesis draft is the priority this year.',
      importance: 3,
    });
    await store.put('snapshots', 'tasks', {
      tasks: [
        {
          id: 't-draft',
          listId: 'personal',
          title: 'Write chapter four',
          status: 'needsAction',
          position: '0',
          notes: '',
          subtasks: [],
          tags: [],
          metadataValid: true,
        },
      ],
      lists: [],
      syncedAt: new Date().toISOString(),
    });
    reply({
      insights: [
        {
          kind: 'pattern',
          title: 'Starting is the hard part',
          text: 'Three notes now describe circling the draft without opening it.',
          importance: 3,
          confidence: 'medium',
          basedOn: [goal.id, 't-draft', 'not-in-packet'],
        },
        {
          kind: 'risk',
          title: 'Unfounded worry',
          text: 'Rests on nothing shown.',
          importance: 2,
          confidence: 'high',
          basedOn: ['made-up'],
        },
      ],
      actions: [{ title: 'Open chapter four for ten minutes', notes: '', reason: 'Small start.' }],
      reply: 'You keep circling the draft. Open it for ten minutes today.',
    });
    const r = await reflect(
      'I did not open the draft again today.',
      'source-reflect',
      settings,
      [],
    );
    expect(r.reply).toContain('ten minutes');
    expect(r.insights.map((m) => m.title)).toEqual(['Starting is the hard part']);
    const saved = r.insights[0];
    expect(saved.kind).toBe('pattern');
    expect(saved.epistemic).toBe('assistant_hypothesis');
    expect(saved.reviewed).toBe(false);
    expect(saved.entityIds).toEqual([goal.id]);
    expect(saved.taskIds).toEqual(['t-draft']);
    expect(r.proposals).toHaveLength(1);
  });
  it('updates an earlier hypothesis by title instead of stacking a twin', async () => {
    const before = (await store.list('memories')).length;
    reply({
      insights: [
        {
          kind: 'pattern',
          title: 'Starting is the hard part',
          text: 'Confirmed again: the draft was avoided for a fourth day.',
          importance: 3,
          confidence: 'high',
          basedOn: ['t-draft'],
        },
      ],
      actions: [],
      reply: '',
    });
    const r = await reflect('Fourth day, still not opened.', 'source-reflect-2', settings, []);
    expect((await store.list('memories')).length).toBe(before);
    expect(r.insights[0].text).toContain('fourth day');
    expect(r.insights[0].status).toBe('active');
    expect(r.insights[0].version).toBe(2);
  });
  it('gives the adviser the core profile whatever the note is about', async () => {
    const p = await profile('completely unrelated words zzz', settings);
    expect(p.core.some((m) => m.title === 'Finish the thesis draft')).toBe(true);
    expect(p.hypotheses.some((m) => m.title === 'Starting is the hard part')).toBe(true);
    expect(p.tasks.map((t) => t.id)).toContain('t-draft');
    expect(p.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
describe('research', () => {
  it('sends only the adviser’s impersonal query and cites what it used', async () => {
    const goal = await createMemory({
      kind: 'goal',
      title: 'Leave the current job',
      text: 'Planning to resign this quarter.',
      importance: 3,
    });
    provider.searchWeb.mockResolvedValueOnce([
      {
        id: 'web-0',
        title: 'Notice periods in Victoria',
        url: 'https://example.gov.au/a',
        summary: 'Four weeks.',
      },
      {
        id: 'web-1',
        title: 'Unrelated',
        url: 'https://example.com/b',
        summary: 'Nothing to do with it.',
      },
    ]);
    reply({
      insights: [],
      actions: [],
      research: [
        { query: 'minimum notice period resignation Victoria', why: 'They are resigning.' },
      ],
      reply: 'You sound ready to go.',
    });
    reply({ text: 'Four weeks is the usual minimum here.', sourceIds: ['web-0'] });
    const r = await reflect(
      'I want to hand in my notice at Acme next month.',
      'source-research',
      { ...settings, researchOnCapture: true },
      [goal],
    );
    const [sent] = provider.searchWeb.mock.calls.at(-1)!;
    expect(sent).toEqual(['minimum notice period resignation Victoria']);
    // The note and the memories must never reach the search provider.
    expect(JSON.stringify(sent)).not.toMatch(/Acme|resign this quarter/i);
    expect(r.reply).toContain('You sound ready to go.');
    expect(r.reply).toContain('Four weeks');
    expect(r.sources.map((s) => s.id)).toEqual(['web-0']);
  });
  it('keeps the coaching when the search fails', async () => {
    provider.searchWeb.mockRejectedValueOnce(new Error('Connect a search provider in Settings.'));
    reply({
      insights: [],
      actions: [],
      research: [{ query: 'anything', why: 'because' }],
      reply: 'Here is what I think.',
    });
    const r = await reflect(
      'A note.',
      'source-research-fail',
      { ...settings, researchOnCapture: true },
      [],
    );
    expect(r.reply).toBe('Here is what I think.');
    expect(r.sources).toEqual([]);
  });
  it('does not search at all when the setting is off', async () => {
    provider.searchWeb.mockClear();
    reply({
      insights: [],
      actions: [],
      research: [{ query: 'something', why: 'why' }],
      reply: 'No lookup wanted.',
    });
    await reflect('A note.', 'source-no-research', settings, []);
    expect(provider.searchWeb).not.toHaveBeenCalled();
  });
});
describe('the standing review', () => {
  it('consolidates the whole store without rewriting what the user wrote', async () => {
    const mine = await createMemory({
      kind: 'issue',
      title: 'The garage is a mess',
      text: 'My own words about the garage.',
      importance: 2,
      epistemic: 'user_corrected',
    });
    const stale = await createMemory({
      kind: 'pattern',
      title: 'Avoids weekend chores',
      text: 'An earlier conclusion.',
      epistemic: 'assistant_hypothesis',
    });
    const quiet = await createMemory({
      kind: 'goal',
      title: 'Learn the piano',
      text: 'Wanted to start lessons.',
      importance: 3,
    });
    const twin = await createMemory({
      kind: 'goal',
      title: 'Start piano lessons',
      text: 'Meaning to book a teacher.',
      importance: 2,
    });
    reply({
      syntheses: [
        {
          kind: 'pattern',
          title: 'Projects start strong then stall',
          text: 'Visible across the piano goal and the garage.',
          importance: 3,
          confidence: 'high',
          basedOn: [quiet.id, mine.id],
        },
        {
          kind: 'risk',
          title: 'Groundless',
          text: 'Rests on nothing.',
          importance: 2,
          confidence: 'high',
          basedOn: ['nope'],
        },
      ],
      updates: [
        { id: quiet.id, importance: 1, reason: 'Nothing has moved on it in months.' },
        { id: mine.id, status: 'resolved', reason: 'Should not be allowed to touch this.' },
      ],
      retractions: [
        { id: stale.id, reason: 'Later notes contradict it.' },
        { id: mine.id, reason: 'Not the adviser’s to withdraw.' },
      ],
      duplicates: [{ ids: [quiet.id, twin.id], reason: 'Say the same thing.' }],
      summary: 'Tidied the picture and withdrew one old conclusion.',
    });
    const review = await consolidate(settings);
    expect(review.summary).toContain('Tidied the picture');
    expect(review.reviewed).toBeGreaterThan(3);
    expect(review.syntheses).toBe(1);
    expect(review.retracted).toBe(1);
    // Re-rating a user memory is allowed; resolving one the user corrected is not.
    expect((await store.get('memories', quiet.id)).importance).toBe(1);
    const untouched = await store.get('memories', mine.id);
    expect(untouched.status).toBe('active');
    expect(untouched.text).toBe('My own words about the garage.');
    expect(untouched.version).toBe(mine.version);
    // A withdrawn conclusion is resolved and says why, never deleted.
    const withdrawn = await store.get('memories', stale.id);
    expect(withdrawn.status).toBe('resolved');
    expect(withdrawn.text).toContain('Later notes contradict it.');
    const synth = (await store.list('memories')).find(
      (m) => m.title === 'Projects start strong then stall',
    );
    expect(synth.epistemic).toBe('assistant_hypothesis');
    expect(synth.reviewed).toBe(false);
    expect(synth.entityIds).toEqual(expect.arrayContaining([quiet.id, mine.id]));
    expect((await store.list('memories')).some((m) => m.title === 'Groundless')).toBe(false);
  });
  it('offers the pairs it flagged for merging ahead of the embedding guesses', async () => {
    const pairs = await duplicateCandidates();
    expect(pairs[0].basis).toBe('review');
    expect(pairs[0].ids).toHaveLength(2);
    // A memory the review just resolved is no longer a merge candidate.
    const withdrawn = (await store.list('memories')).find(
      (m) => m.title === 'Avoids weekend chores',
    );
    expect(pairs.some((p) => p.ids.includes(withdrawn.id))).toBe(false);
  });
});
describe('model selection', () => {
  it('lets memory work run on Claude and prices the reflection pass into a capture', async () => {
    const saved = await saveSettings({
      ...settings,
      extractionProvider: 'anthropic',
      extractionModel: 'claude-opus-5',
    });
    expect(saved.extractionModel).toBe('claude-opus-5');
    await expect(
      saveSettings({
        ...settings,
        extractionProvider: 'anthropic',
        extractionModel: 'gemini-3.8-flash',
      }),
    ).rejects.toThrow();
    const withReflection = captureEstimate({ ...settings, reflectOnCapture: true });
    const factsOnly = captureEstimate({ ...settings, reflectOnCapture: false });
    expect(withReflection).toBeGreaterThan(factsOnly);
    expect(factsOnly).toBeGreaterThan(0);
  });
  it('accepts any priced model and still refuses an unpriced one', async () => {
    const saved = await saveSettings({ ...settings, extractionModel: 'gemini-3.8-flash' });
    expect(saved.extractionModel).toBe('gemini-3.8-flash');
    await expect(
      saveSettings({ ...settings, extractionModel: 'gemini-4-imaginary' }),
    ).rejects.toThrow();
    await expect(saveSettings({ ...settings, adviceModel: 'gemini-3.8-flash' })).rejects.toThrow();
  });
  it('speaks each Gemini generation’s own thinking dialect', () => {
    expect(geminiThinking('gemini-3.8-flash')).toEqual({
      thinkingConfig: { thinkingLevel: 'low' },
    });
    expect(geminiThinking('gemini-3.5-flash-lite')).toEqual({
      thinkingConfig: { thinkingLevel: 'low' },
    });
    expect(geminiThinking('gemini-2.5-flash')).toEqual({ thinkingConfig: { thinkingBudget: 0 } });
    expect(geminiThinking('gemini-embedding-001')).toEqual({});
  });
});
