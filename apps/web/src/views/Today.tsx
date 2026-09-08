import { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  ArrowUp,
  ArrowDown,
  Plus,
  Check,
  ChevronDown,
  ChevronRight,
  Leaf,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useApp } from '../context';
import { api } from '../lib/api';
import type { Bootstrap, Task, Proposal } from '../types';
import { Button, IconButton, Modal, Tag, Empty, SectionTitle } from '../components/ui';
const endpointFor = (t: Task) =>
  `tasks/${encodeURIComponent(t.listId)}/${encodeURIComponent(t.id)}`;
/**
 * Optimistic task writes, the pattern from the standalone task assistant:
 * paint the change into the cache now, send the write in the background,
 * swap in the server's copy when it lands, and only fall back to a full
 * refresh if it fails. The visible list never waits on Google.
 */
function useTaskWrite() {
  const { mutate, reload, setError } = useApp();
  const replace = useCallback(
    (task: Task) =>
      mutate((d) => ({
        ...d,
        tasks: d.tasks.map((t) => (t.id === task.id && t.listId === task.listId ? task : t)),
      })),
    [mutate],
  );
  const write = useCallback(
    async (optimistic: Task, request: () => Promise<Task>) => {
      replace(optimistic);
      try {
        replace(await request());
      } catch (e) {
        setError(e instanceof Error ? e.message : 'That change did not save. Refreshing…');
        void reload();
      }
    },
    [replace, reload, setError],
  );
  return { write, mutate, reload, setError };
}
export function Today() {
  const { data, reload } = useApp();
  const { write, mutate, setError } = useTaskWrite();
  const [selected, setSelected] = useState<{ id: string; listId: string } | null>(null),
    [showCompleted, setShowCompleted] = useState(false),
    [list, setList] = useState('all'),
    [add, setAdd] = useState(false),
    [refreshing, setRefreshing] = useState(false);
  if (!data) return null;
  const tasks = data.tasks.filter(
    (t) => (showCompleted || t.status !== 'completed') && (list === 'all' || t.listId === list),
  );
  const goals = data.memories.filter((m) => m.kind === 'goal' && m.status === 'active');
  const suggestions = data.proposals.filter((p) =>
    ['pending', 'creating', 'uncertain'].includes(p.status),
  );
  const done = data.tasks.filter((t) => t.status === 'completed').length;
  // The order you arrange these in is your priority order. Reordering is
  // limited to top-level open tasks — a nested task moves with its parent.
  const orderedOpen = tasks.filter((t) => !t.parent && t.status !== 'completed');
  const toggleComplete = (t: Task) => {
    const status = t.status === 'completed' ? 'needsAction' : 'completed';
    return write({ ...t, status }, () => api<Task>(endpointFor(t), 'PATCH', { status }));
  };
  const moveTask = (t: Task, dir: -1 | 1) => {
    const siblings = orderedOpen.filter((s) => s.listId === t.listId);
    const from = siblings.findIndex((s) => s.id === t.id);
    const to = from + dir;
    if (to < 0 || to >= siblings.length) return;
    const previous = to === 0 ? null : dir === 1 ? siblings[to] : siblings[to - 1];
    mutate((d: Bootstrap) => {
      const block = [t, ...d.tasks.filter((x) => x.parent === t.id)];
      const ids = new Set(block.map((x) => x.id));
      const rest = d.tasks.filter((x) => !ids.has(x.id));
      const anchor = previous
        ? rest.findIndex((x) => x.id === previous.id)
        : rest.findIndex((x) => x.listId === t.listId) - 1;
      rest.splice(anchor + 1, 0, ...block);
      return { ...d, tasks: rest };
    });
    void (async () => {
      try {
        const updated = await api<Task>(endpointFor(t) + '/move', 'POST', {
          previous: previous?.id ?? null,
        });
        mutate((d) => ({
          ...d,
          tasks: d.tasks.map((x) =>
            x.id === updated.id && x.listId === updated.listId ? updated : x,
          ),
        }));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not reorder. Refreshing…');
        void reload();
      }
    })();
  };
  const openTask = selected
    ? data.tasks.find((t) => t.id === selected.id && t.listId === selected.listId)
    : undefined;
  return (
    <div className="page-enter">
      <div className="today-columns">
        <section className="card tasks-card">
          <SectionTitle
            title="Tasks"
            description="In your priority order — top is next."
            action={
              <div className="button-row compact">
                <IconButton
                  label="Refresh Google Tasks"
                  disabled={refreshing}
                  onClick={async () => {
                    setRefreshing(true);
                    await reload(true);
                    setRefreshing(false);
                  }}
                >
                  <RefreshCw size={17} className={refreshing ? 'spin' : ''} />
                </IconButton>
                <Button variant="secondary" onClick={() => setAdd(true)}>
                  <Plus size={16} /> Add task
                </Button>
              </div>
            }
          />
          <div className="task-toolbar">
            <select aria-label="Task list" value={list} onChange={(e) => setList(e.target.value)}>
              <option value="all">All selected lists</option>
              {data.lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title}
                </option>
              ))}
            </select>
            <span>
              {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}
            </span>
          </div>
          {data.taskError && <p className="inline-warning">{data.taskError}</p>}
          <div className="task-list">
            {tasks.length ? (
              tasks.map((t) => {
                const rank = t.parent
                  ? -1
                  : orderedOpen
                      .filter((s) => s.listId === t.listId)
                      .findIndex((s) => s.id === t.id);
                const movable = rank >= 0;
                const siblingCount = orderedOpen.filter((s) => s.listId === t.listId).length;
                return (
                  <div
                    key={t.listId + t.id}
                    className={`task-row ${t.status === 'completed' ? 'done' : ''} ${t.parent ? 'child-task' : ''}`}
                  >
                    <button
                      className="task-check"
                      aria-label={`${t.status === 'completed' ? 'Reopen' : 'Complete'} ${t.title}`}
                      aria-pressed={t.status === 'completed'}
                      onClick={() => void toggleComplete(t)}
                    >
                      {t.status === 'completed' && <Check size={13} />}
                    </button>
                    <button
                      className="task-body"
                      onClick={() => setSelected({ id: t.id, listId: t.listId })}
                    >
                      <span>{t.title}</span>
                      <div className="task-meta">
                        {t.subtasks.length > 0 && (
                          <span>
                            {t.subtasks.filter((s) => s.done).length}/{t.subtasks.length} steps
                          </span>
                        )}
                        {t.tags.includes('important') && (
                          <span className="priority-dot">Important</span>
                        )}
                      </div>
                    </button>
                    {movable && t.status !== 'completed' && (
                      <div className="task-reorder">
                        <IconButton
                          label={`Move ${t.title} up`}
                          disabled={rank === 0}
                          onClick={() => moveTask(t, -1)}
                        >
                          <ArrowUp size={16} />
                        </IconButton>
                        <IconButton
                          label={`Move ${t.title} down`}
                          disabled={rank === siblingCount - 1}
                          onClick={() => moveTask(t, 1)}
                        >
                          <ArrowDown size={16} />
                        </IconButton>
                      </div>
                    )}
                    <IconButton
                      label={`Open ${t.title}`}
                      onClick={() => setSelected({ id: t.id, listId: t.listId })}
                    >
                      <ChevronRight size={20} />
                    </IconButton>
                  </div>
                );
              })
            ) : (
              <Empty
                icon={<Check />}
                title={data.connections.google ? 'No open tasks' : 'No tasks yet'}
              >
                {data.connections.google
                  ? 'No open tasks in this view.'
                  : 'Connect Google Tasks in Settings to see your tasks here.'}
              </Empty>
            )}
          </div>
          <button
            className="text-button completed-toggle"
            onClick={() => setShowCompleted((v) => !v)}
          >
            <ChevronDown size={15} />
            {showCompleted ? 'Hide' : 'Show'} completed tasks ({done})
          </button>
        </section>
        <aside className="right-stack">
          <section className="card perspective-card">
            <div className="card-kicker">
              <Leaf size={17} />
              <span>CURRENT GOAL</span>
            </div>
            <h3>{goals[0]?.title || 'No goals yet'}</h3>
            <p>{goals[0]?.text || 'Add a goal in Memory and it shows up here.'}</p>
            <a className="text-button" href="#/memory">
              Open Memory <ArrowUpRight size={16} />
            </a>
          </section>
          <section className="card audio-invite">
            <div className="waveform-decoration" aria-hidden="true">
              {[14, 24, 39, 20, 46, 31, 50, 25, 38, 18, 29, 13].map((h, i) => (
                <i key={i} style={{ height: h }} />
              ))}
            </div>
            <span className="eyebrow">DAILY BRIEFING</span>
            <h3>Your day, briefed.</h3>
            <p>Priorities, strategy and news in one audio track.</p>
            <a href="#/listen" className="button secondary">
              Build a briefing <ArrowRight size={16} />
            </a>
          </section>
        </aside>
      </div>
      {suggestions.length > 0 && (
        <section className="suggestion-section">
          <SectionTitle
            title="Suggested actions"
            description="Nothing is added to your tasks until you accept it."
          />
          <div className="suggestion-grid">
            {suggestions.map((p) => (
              <ProposalCard key={p.id} proposal={p} />
            ))}
          </div>
        </section>
      )}
      {openTask && <TaskDialog task={openTask} onClose={() => setSelected(null)} />}
      {add && <NewTaskDialog onClose={() => setAdd(false)} />}
    </div>
  );
}
export function ProposalCard({ proposal: p }: { proposal: Proposal }) {
  const { run, reload } = useApp();
  const [busy, setBusy] = useState(false),
    [edit, setEdit] = useState(false);
  if (p.status === 'uncertain' || p.status === 'creating')
    return (
      <div className="card suggestion-card">
        <Tag tone="peach">{p.status === 'uncertain' ? 'Check Google Tasks' : 'Being added'}</Tag>
        <h3>{p.title}</h3>
        <p>
          {p.status === 'uncertain'
            ? 'Google may have received this action. Check your refreshed task list before creating it again.'
            : 'This action is being processed. Refresh to check its result.'}
        </p>
        <div className="button-row">
          <Button variant="secondary" onClick={() => void reload(true)}>
            <RefreshCw size={15} />
            Refresh tasks
          </Button>
          {p.status === 'uncertain' && (
            <Button
              variant="ghost"
              onClick={() => void run(() => api(`proposals/${p.id}/dismiss`, 'POST', {}))}
            >
              Checked — dismiss
            </Button>
          )}
        </div>
      </div>
    );
  return (
    <div className="card suggestion-card">
      <span className="tag peach">Suggested action</span>
      <h3>{p.title}</h3>
      <p>{p.reason}</p>
      <div className="button-row">
        <Button
          variant="secondary"
          busy={busy}
          onClick={async () => {
            setBusy(true);
            await run(() => api(`proposals/${p.id}/approve`, 'POST', {}), 'Added to your tasks.');
            setBusy(false);
          }}
        >
          <Plus size={15} /> Add to tasks
        </Button>
        <button className="text-button" onClick={() => setEdit(true)}>
          Edit
        </button>
        <button
          className="text-button muted"
          onClick={() => void run(() => api(`proposals/${p.id}/dismiss`, 'POST', {}))}
        >
          Dismiss
        </button>
      </div>
      {edit && <NewTaskDialog existing={p} onClose={() => setEdit(false)} />}
    </div>
  );
}
function TaskDialog({ task: t, onClose }: { task: Task; onClose: () => void }) {
  const { run } = useApp();
  const { write } = useTaskWrite();
  const [step, setStep] = useState(''),
    [title, setTitle] = useState(t.title),
    [savingTitle, setSavingTitle] = useState(false);
  // The dialog stays mounted through optimistic updates, so resync the title
  // field if the task's stored title changes underneath it.
  useEffect(() => setTitle(t.title), [t.title]);
  const path = endpointFor(t);
  const subs = t.subtasks;
  const titleChanged = !!title.trim() && title.trim() !== t.title;
  const patchSteps = (next: Task['subtasks'], checklist: Record<string, unknown>) =>
    write({ ...t, subtasks: next }, () => api<Task>(path, 'PATCH', { checklist }));
  const toggleStep = (id: string) =>
    patchSteps(
      subs.map((s) => (s.id === id ? { ...s, done: !s.done } : s)),
      { id, done: !subs.find((s) => s.id === id)?.done },
    );
  const removeStep = (id: string) =>
    patchSteps(
      subs.filter((s) => s.id !== id),
      { id, remove: true },
    );
  const moveStep = (i: number, dir: -1 | 1) => {
    const to = i + dir;
    if (to < 0 || to >= subs.length) return;
    const next = [...subs];
    [next[i], next[to]] = [next[to], next[i]];
    patchSteps(next, { id: subs[i].id, move: dir === -1 ? 'up' : 'down' });
  };
  const addStep = (e: React.FormEvent) => {
    e.preventDefault();
    const value = step.trim();
    if (!value) return;
    const item = {
      id: crypto.randomUUID(),
      title: value,
      done: false,
      createdAt: new Date().toISOString(),
      createdBy: 'user' as const,
    };
    patchSteps([...subs, item], { id: item.id, add: item });
    setStep('');
  };
  return (
    <Modal title="Task" onClose={onClose}>
      <div className="modal-content">
        <label className="field">
          Task
          <div className="inline-form">
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={1024} />
            {titleChanged && (
              <Button
                variant="secondary"
                busy={savingTitle}
                onClick={async () => {
                  setSavingTitle(true);
                  await run(
                    () => api(path, 'PATCH', { title: title.trim(), etag: t.etag }),
                    'Task updated.',
                  );
                  setSavingTitle(false);
                }}
              >
                Save
              </Button>
            )}
          </div>
        </label>
        {t.notes && <p className="note-block">{t.notes}</p>}
        <div className="section-title small">
          <h3>Steps</h3>
          <Tag>
            {subs.filter((s) => s.done).length}/{subs.length}
          </Tag>
        </div>
        {subs.map((s, i) => (
          <div className="checklist-row" key={s.id}>
            <input
              aria-label={s.title}
              type="checkbox"
              checked={s.done}
              onChange={() => toggleStep(s.id)}
            />
            <span className={s.done ? 'struck' : ''}>{s.title}</span>
            <div className="checklist-reorder">
              <IconButton
                label={`Move ${s.title} up`}
                disabled={i === 0}
                onClick={() => moveStep(i, -1)}
              >
                <ArrowUp size={14} />
              </IconButton>
              <IconButton
                label={`Move ${s.title} down`}
                disabled={i === subs.length - 1}
                onClick={() => moveStep(i, 1)}
              >
                <ArrowDown size={14} />
              </IconButton>
              <IconButton label={`Remove ${s.title}`} onClick={() => removeStep(s.id)}>
                <Trash2 size={14} />
              </IconButton>
            </div>
          </div>
        ))}
        <form className="inline-form" onSubmit={addStep}>
          <input
            aria-label="New checklist step"
            placeholder="Add a step…"
            value={step}
            onChange={(e) => setStep(e.target.value)}
          />
          <Button type="submit" variant="secondary" disabled={!step.trim()}>
            <Plus size={17} />
          </Button>
        </form>
        {!t.metadataValid && (
          <p className="inline-warning">
            This task's old metadata needs repair before checklist changes can be saved.
          </p>
        )}
      </div>
    </Modal>
  );
}
export function NewTaskDialog({ onClose, existing }: { onClose: () => void; existing?: Proposal }) {
  const { data, run } = useApp();
  const [title, setTitle] = useState(existing?.title || ''),
    [notes, setNotes] = useState(existing?.notes || ''),
    [listId, setList] = useState(existing?.listId || data?.lists[0]?.id || '@default'),
    [busy, setBusy] = useState(false),
    [proposal, setProposal] = useState<Proposal | undefined>(existing);
  return (
    <Modal title={proposal ? 'Confirm new task' : 'New task'} onClose={onClose}>
      <form
        className="modal-content"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          if (proposal) {
            const accepted = await run(
              () => api(`proposals/${proposal.id}/approve`, 'POST', { title, notes, listId }),
              'Added to your tasks.',
            );
            if (accepted) onClose();
          } else {
            const p = await run(() =>
              api<Proposal>('proposals', 'POST', {
                title,
                notes,
                listId,
                reason: 'An action you chose.',
              }),
            );
            if (p) setProposal(p);
          }
          setBusy(false);
        }}
      >
        <label className="field">
          Task
          <input
            autoFocus
            required
            maxLength={1024}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs doing?"
          />
        </label>
        <label className="field">
          Notes
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </label>
        <label className="field">
          Task list
          <select value={listId} onChange={(e) => setList(e.target.value)}>
            {data?.lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title}
              </option>
            ))}
            {!data?.lists.length && <option value="@default">Default list</option>}
          </select>
        </label>
        {proposal && (
          <p className="subtle-note">
            This will create a task in{' '}
            {data?.mode === 'demo' ? 'the preview workspace' : 'your Google Tasks account'}.
          </p>
        )}
        <Button type="submit" busy={busy} disabled={!title.trim()}>
          {proposal ? (
            <>
              <Check size={16} />
              Confirm and add task
            </>
          ) : (
            <>
              Review task <ArrowRight size={16} />
            </>
          )}
        </Button>
      </form>
    </Modal>
  );
}
