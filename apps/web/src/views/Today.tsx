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
  MoreHorizontal,
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
      <section className="welcome-card">
        <div className="welcome-copy">
          <span className="eyebrow">A LITTLE CLARITY. A MEANINGFUL NEXT STEP.</span>
          <h1>
            Make room for
            <br />
            <em>what matters.</em>
          </h1>
          <p>
            Your thoughts, your bigger picture, and the next small
            <br className="desktop-only" /> step forward. All in one place.
          </p>
          <div className="button-row">
            <a className="button primary" href="#/capture">
              <Mic size={17} /> Record a thought
            </a>
            <a className="button secondary" href="#/listen">
              <Headphones size={17} /> Create your briefing
            </a>
          </div>
        </div>
        <div className="welcome-illustration" aria-hidden="true">
          <div className="orbit one" />
          <div className="orbit two" />
          <div className="orbit three" />
          <span className="orbit-dot a" />
          <span className="orbit-dot b" />
          <span className="orbit-dot c" />
          <div className="plant">
            <svg viewBox="0 0 150 160">
              <path d="M75 145C78 100 75 70 72 30" fill="none" stroke="#6b8263" strokeWidth="3" />
              <path d="M76 116C29 113 20 86 21 67C61 67 77 89 76 116" fill="#a1b18b" />
              <path d="M77 90C118 83 132 51 125 33C87 41 76 60 77 90" fill="#6b8263" />
              <path d="M72 62C41 60 33 41 35 23C62 28 74 41 72 62" fill="#c2c9a7" />
              <path d="M72 34C61 11 74 0 83 0C91 17 82 29 72 34" fill="#8f9f77" />
            </svg>
          </div>
          <span className="floating-label">
            <span className="tiny-dot" /> A little more grounded
          </span>
        </div>
      </section>
      <div className="stat-grid">
        <Stat
          icon={<Target size={19} />}
          value={data.tasks.filter((t) => t.status === 'needsAction').length}
          label="things to move forward"
        />
        <Stat icon={<Leaf size={19} />} value={goals.length} label="goals to keep in view" />
        <Stat icon={<Check size={19} />} value={done} label="tasks marked complete" />
      </div>
      <div className="today-columns">
        <section className="card tasks-card">
          <SectionTitle
            title="One thing at a time"
            description="Your actions, straight from Google Tasks."
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
                    <MoreHorizontal size={19} />
                  </IconButton>
                </div>
              ))
            ) : (
              <Empty
                icon={<Check />}
                title={
                  data.connections.google
                    ? 'A little breathing room'
                    : 'Bring your actions into view'
                }
              >
                {data.connections.google
                  ? 'No open tasks in this view.'
                  : 'Connect Google Tasks in Settings to see your current actions here.'}
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
              <span>KEEP THE BIGGER PICTURE CLOSE</span>
            </div>
            <h3>{goals[0]?.title || 'What are you making room for?'}</h3>
            <p>
              {goals[0]?.text ||
                'Start with a thought about what matters to you. Your goals can grow from there.'}
            </p>
            <a className="text-button" href="#/memory">
              Explore your memories <ArrowUpRight size={16} />
            </a>
          </section>
          <section className="card audio-invite">
            <div className="waveform-decoration" aria-hidden="true">
              {[14, 24, 39, 20, 46, 31, 50, 25, 38, 18, 29, 13].map((h, i) => (
                <i key={i} style={{ height: h }} />
              ))}
            </div>
            <span className="eyebrow">A FRESH PERSPECTIVE, IN YOUR EARS</span>
            <h3>Your day. Talked through.</h3>
            <p>A personal mix of focus, encouragement and the bigger picture.</p>
            <a href="#/listen" className="button secondary">
              Make a little space to listen <ArrowRight size={16} />
            </a>
          </section>
        </aside>
      </div>
      {suggestions.length > 0 && (
        <section className="suggestion-section">
          <SectionTitle
            title="A possible next step"
            description="Ideas to consider. Nothing is added to your tasks until you choose."
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
              I checked — dismiss this notice
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
    <Modal title="A little more detail" onClose={onClose}>
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
          <h3>Small steps</h3>
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
            placeholder="Add one small step…"
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
    <Modal title={proposal ? 'Confirm your new task' : 'An action worth taking'} onClose={onClose}>
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
          What would you like to do?
          <input
            autoFocus
            required
            maxLength={1024}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Make the next step specific"
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
