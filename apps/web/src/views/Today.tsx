import { useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Mic,
  Headphones,
  Plus,
  Check,
  ChevronDown,
  ChevronRight,
  Leaf,
  Target,
  RefreshCw,
  CalendarDays,
  Send,
  Trash2,
} from 'lucide-react';
import { useApp } from '../context';
import { api } from '../lib/api';
import type { Task, Proposal } from '../types';
import { Button, IconButton, Modal, Tag, Empty, SectionTitle } from '../components/ui';
export function Today() {
  const { data, run, reload } = useApp();
  const [selected, setSelected] = useState<Task | null>(null),
    [showCompleted, setShowCompleted] = useState(false),
    [list, setList] = useState('all'),
    [add, setAdd] = useState(false),
    [refreshing, setRefreshing] = useState(false);
  if (!data) return null;
  const tasks = data.tasks.filter(
    (t) => (showCompleted || t.status !== 'completed') && (list === 'all' || t.listId === list),
  );
  const done = data.tasks.filter((t) => t.status === 'completed').length;
  const goals = data.memories.filter((m) => m.kind === 'goal' && m.status === 'active');
  const suggestions = data.proposals.filter((p) =>
    ['pending', 'creating', 'uncertain'].includes(p.status),
  );
  return (
    <div className="page-enter">
      <div className="quick-actions">
        <a className="button primary" href="#/capture">
          <Mic size={17} /> Record a note
        </a>
        <a className="button secondary" href="#/listen">
          <Headphones size={17} /> Build a briefing
        </a>
      </div>
      <div className="stat-grid">
        <Stat
          icon={<Target size={19} />}
          value={data.tasks.filter((t) => t.status === 'needsAction').length}
          label="open tasks"
        />
        <Stat icon={<Leaf size={19} />} value={goals.length} label="active goals" />
        <Stat icon={<Check size={19} />} value={done} label="completed" />
      </div>
      <div className="today-columns">
        <section className="card tasks-card">
          <SectionTitle
            title="Tasks"
            description="Straight from Google Tasks."
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
              tasks.map((t) => (
                <div
                  key={t.listId + t.id}
                  className={`task-row ${t.status === 'completed' ? 'done' : ''} ${t.parent ? 'child-task' : ''}`}
                >
                  <button
                    className="task-check"
                    aria-label={`${t.status === 'completed' ? 'Reopen' : 'Complete'} ${t.title}`}
                    aria-pressed={t.status === 'completed'}
                    onClick={() =>
                      void run(() =>
                        api(
                          `tasks/${encodeURIComponent(t.listId)}/${encodeURIComponent(t.id)}`,
                          'PATCH',
                          {
                            status: t.status === 'completed' ? 'needsAction' : 'completed',
                            etag: t.etag,
                          },
                        ),
                      )
                    }
                  >
                    {t.status === 'completed' && <Check size={13} />}
                  </button>
                  <button className="task-body" onClick={() => setSelected(t)}>
                    <span>{t.title}</span>
                    <div className="task-meta">
                      {t.subtasks.length > 0 && (
                        <span>
                          {t.subtasks.filter((s) => s.done).length}/{t.subtasks.length} steps
                        </span>
                      )}
                      {t.due && (
                        <span>
                          <CalendarDays size={11} />
                          {new Date(t.due + 'T12:00:00').toLocaleDateString('en-AU', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      )}
                      {t.tags.includes('important') && (
                        <span className="priority-dot">Important</span>
                      )}
                    </div>
                  </button>
                  <IconButton label={`Open ${t.title}`} onClick={() => setSelected(t)}>
                    <ChevronRight size={20} />
                  </IconButton>
                </div>
              ))
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
      {selected && (
        <TaskDialog
          task={
            data.tasks.find((t) => t.id === selected.id && t.listId === selected.listId) || selected
          }
          onClose={() => setSelected(null)}
        />
      )}
      {add && <NewTaskDialog onClose={() => setAdd(false)} />}
    </div>
  );
}
function Stat({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="stat">
      <span className="stat-icon">{icon}</span>
      <strong>{value}</strong>
      <span>{label}</span>
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
  const [step, setStep] = useState(''),
    [title, setTitle] = useState(t.title),
    [due, setDue] = useState(t.due || '');
  const endpoint = `tasks/${encodeURIComponent(t.listId)}/${encodeURIComponent(t.id)}`;
  return (
    <Modal title="Task details" onClose={onClose}>
      <div className="modal-content">
        <label className="field">
          Task
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="field">
          Due date
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </label>
        <Button
          variant="secondary"
          disabled={!title.trim()}
          onClick={() =>
            void run(
              () => api(endpoint, 'PATCH', { title, due: due || null, etag: t.etag }),
              'Task updated.',
            )
          }
        >
          Save details
        </Button>
        {t.notes && <p className="note-block">{t.notes}</p>}
        <div className="section-title small">
          <h3>Steps</h3>
          <Tag>
            {t.subtasks.filter((s) => s.done).length}/{t.subtasks.length}
          </Tag>
        </div>
        {t.subtasks.map((s) => (
          <div className="checklist-row" key={s.id}>
            <input
              aria-label={s.title}
              type="checkbox"
              checked={s.done}
              onChange={() =>
                void run(() =>
                  api(endpoint, 'PATCH', { checklist: { id: s.id, done: !s.done }, etag: t.etag }),
                )
              }
            />
            <span className={s.done ? 'struck' : ''}>{s.title}</span>
            <IconButton
              label={`Remove ${s.title}`}
              onClick={() =>
                void run(() =>
                  api(endpoint, 'PATCH', { checklist: { id: s.id, remove: true }, etag: t.etag }),
                )
              }
            >
              <Trash2 size={14} />
            </IconButton>
          </div>
        ))}
        <form
          className="inline-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!step.trim()) return;
            await run(() =>
              api(endpoint, 'PATCH', {
                checklist: {
                  id: crypto.randomUUID(),
                  add: {
                    id: crypto.randomUUID(),
                    title: step.trim(),
                    done: false,
                    createdAt: new Date().toISOString(),
                    createdBy: 'user',
                  },
                },
                etag: t.etag,
              }),
            );
            setStep('');
          }}
        >
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
    [due, setDue] = useState(existing?.due || ''),
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
              () =>
                api(`proposals/${proposal.id}/approve`, 'POST', {
                  title,
                  notes,
                  listId,
                  ...(due ? { due } : {}),
                }),
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
                ...(due ? { due } : {}),
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
        <div className="form-grid">
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
          <label className="field">
            Due date (optional)
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </label>
        </div>
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
