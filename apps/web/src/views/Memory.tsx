import { useState, useEffect } from 'react';
import {
  Search,
  Plus,
  Pin,
  BookOpen,
  ArrowUpRight,
  Trash2,
  Check,
  Network,
  Link as LinkIcon,
} from 'lucide-react';
import { MEMORY_LABELS, type Memory as MemoryRecord, type MemoryKind } from '../types';
import { useApp } from '../context';
import { api } from '../lib/api';
import { Button, IconButton, Modal, Tag, Empty, SectionTitle } from '../components/ui';
export function Memory() {
  const { data, run } = useApp();
  const [query, setQuery] = useState(''),
    [filter, setFilter] = useState('all'),
    [edit, setEdit] = useState<MemoryRecord | 'new' | null>(null),
    [review, setReview] = useState(false);
  useEffect(() => {
    const id = new URLSearchParams(location.hash.split('?')[1]).get('edit');
    if (id && data) setEdit(data.memories.find((m) => m.id === id) || null);
  }, [data?.memories.length]);
  if (!data) return null;
  const items = data.memories
    .filter(
      (m) =>
        (filter === 'all' || m.kind === filter) &&
        (!review || !m.reviewed) &&
        (!query ||
          [m.title, m.text, ...m.tags].join(' ').toLowerCase().includes(query.toLowerCase())),
    )
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt));
  return (
    <div className="view">
      <SectionTitle
        eyebrow="Your second brain"
        title="The threads of your life."
        description="An understanding that grows with you. Always yours to correct."
        action={
          <Button onClick={() => setEdit('new')}>
            <Plus size={17} />
            Add a memory
          </Button>
        }
      />
      <div className="memory-toolbar">
        <div className="search-field">
          <Search size={18} />
          <input
            aria-label="Search memories"
            placeholder="Find a thought, person or goal…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button
          className={'review-toggle ' + (review ? 'selected' : '')}
          onClick={() => setReview(!review)}
        >
          <Check size={16} />
          To review <span>{data.memories.filter((m) => !m.reviewed).length}</span>
        </button>
      </div>
      <div className="filter-tabs" aria-label="Memory categories">
        <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
          Everything <span>{data.memories.length}</span>
        </button>
        {Object.entries(MEMORY_LABELS).map(([key, label]) => (
          <button
            key={key}
            className={filter === key ? 'active' : ''}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {items.length ? (
        <div className="memory-grid">
          {items.map((m) => (
            <article className={'card memory-card ' + m.kind} key={m.id}>
              <div className="card-kicker">
                <Tag tone={m.kind === 'issue' ? 'peach' : m.kind === 'goal' ? 'sage' : 'neutral'}>
                  {MEMORY_LABELS[m.kind]}
                </Tag>
                <IconButton
                  label={m.pinned ? 'Unpin memory' : 'Pin memory'}
                  className={m.pinned ? 'pinned' : ''}
                  onClick={() =>
                    void run(() =>
                      api('memories/' + m.id, 'PATCH', { version: m.version, pinned: !m.pinned }),
                    )
                  }
                >
                  <Pin size={16} fill={m.pinned ? 'currentColor' : 'none'} />
                </IconButton>
              </div>
              <button className="memory-main" onClick={() => setEdit(m)}>
                <h3>{m.title}</h3>
                <p>{m.text}</p>
              </button>
              <div className="memory-tags">
                {m.tags.map((t) => (
                  <span key={t}>#{t}</span>
                ))}
              </div>
              <footer>
                <span>
                  {m.epistemic === 'assistant_hypothesis'
                    ? 'Possible interpretation'
                    : m.epistemic === 'user_corrected'
                      ? 'Corrected by you'
                      : m.reviewed
                        ? 'Reviewed by you'
                        : 'Not yet reviewed'}
                  {m.status !== 'active' ? ' · ' + m.status : ''}
                </span>
                <IconButton label={'Edit ' + m.title} onClick={() => setEdit(m)}>
                  <ArrowUpRight size={17} />
                </IconButton>
              </footer>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          icon={<BookOpen size={28} />}
          title={review ? 'All caught up.' : 'A little space for what matters.'}
          action={
            <Button variant="secondary" onClick={() => setEdit('new')}>
              Add your first memory
            </Button>
          }
        >
          {query
            ? 'No memories match this search.'
            : review
              ? 'Your memories have been reviewed.'
              : 'Start with a goal, a person, or something you want your adviser to understand.'}
        </Empty>
      )}
      <div className="memory-footnote">
        <Network size={18} />
        <p>
          Memories carry their source and certainty. Your corrections take priority; affected
          briefings are removed so old advice does not keep playing.
        </p>
      </div>
      {edit && (
        <MemoryEditor memory={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />
      )}
    </div>
  );
}
function MemoryEditor({ memory, onClose }: { memory?: MemoryRecord; onClose: () => void }) {
  const { data, run } = useApp();
  const [title, setTitle] = useState(memory?.title || ''),
    [text, setText] = useState(memory?.text || ''),
    [kind, setKind] = useState<MemoryKind>(memory?.kind || 'goal'),
    [tags, setTags] = useState(memory?.tags.join(', ') || ''),
    [status, setStatus] = useState(memory?.status || 'active'),
    [entityIds, setEntities] = useState(memory?.entityIds || []),
    [taskIds, setTasks] = useState(memory?.taskIds || []),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false);
  async function save() {
    setBusy(true);
    const r = await run(
      () =>
        api(memory ? 'memories/' + memory.id : 'memories', memory ? 'PATCH' : 'POST', {
          version: memory?.version,
          title,
          text,
          kind,
          status,
          tags: tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
          entityIds,
          taskIds,
          reviewed: true,
          epistemic: memory ? 'user_corrected' : 'user_reported',
          pinned: memory?.pinned || false,
        }),
      'Memory saved.',
    );
    setBusy(false);
    if (r) onClose();
  }
  return (
    <Modal
      title={memory ? 'Your memory, your words.' : 'Something worth remembering.'}
      onClose={onClose}
    >
      <div className="form-stack">
        <div className="form-pair">
          <label>
            Category
            <select value={kind} onChange={(e) => setKind(e.target.value as MemoryKind)}>
              {Object.entries(MEMORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
              <option value="active">Current</option>
              <option value="resolved">Resolved</option>
              <option value="uncertain">Needs clarification</option>
            </select>
          </label>
        </div>
        <label>
          A short title
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} />
        </label>
        <label>
          What should be understood?
          <textarea
            rows={6}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={4000}
          />
        </label>
        <label>
          Tags <span className="muted">(comma separated)</span>
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="work, health, family"
          />
        </label>
        <details className="link-details">
          <summary>
            <LinkIcon size={15} />
            Connect to people, memories and tasks
          </summary>
          <label>
            Related memories
            <select
              multiple
              value={entityIds}
              onChange={(e) => setEntities(Array.from(e.target.selectedOptions, (o) => o.value))}
            >
              {data?.memories
                .filter((m) => m.id !== memory?.id)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Related tasks
            <select
              multiple
              value={taskIds}
              onChange={(e) => setTasks(Array.from(e.target.selectedOptions, (o) => o.value))}
            >
              {data?.tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
          <p className="small muted">On a computer, hold Ctrl or Command to select several.</p>
        </details>
        {memory && (
          <p className="small muted">
            Updated {new Date(memory.updatedAt).toLocaleString()}.{' '}
            {memory.sourceRetained
              ? 'Source transcript temporarily retained.'
              : 'Original transcript is not retained.'}
          </p>
        )}
        {confirm ? (
          <div className="danger-panel">
            <p>Delete this memory and any audio that uses it? This cannot be undone.</p>
            <Button
              variant="danger"
              busy={busy}
              onClick={async () => {
                setBusy(true);
                const result = await run(async () => {
                  await api('memories/' + memory!.id, 'DELETE');
                  return true;
                }, 'Memory deleted.');
                setBusy(false);
                if (result) onClose();
              }}
            >
              Delete memory
            </Button>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Keep it
            </Button>
          </div>
        ) : (
          <div className="form-footer">
            {memory ? (
              <Button variant="ghost" onClick={() => setConfirm(true)}>
                <Trash2 size={16} />
                Delete
              </Button>
            ) : (
              <span />
            )}
            <Button
              busy={busy}
              disabled={!title.trim() || !text.trim()}
              onClick={() => void save()}
            >
              <Check size={17} />
              {memory ? 'Save & mark reviewed' : 'Save memory'}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
