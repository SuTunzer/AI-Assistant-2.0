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
  Copy,
  Merge,
  Sparkles,
  Link as LinkIcon,
} from 'lucide-react';
import {
  MEMORY_LABELS,
  IMPORTANCE_LABELS,
  type Importance,
  type Memory as MemoryRecord,
  type MemoryKind,
} from '../types';
import { useApp } from '../context';
import { api } from '../lib/api';
import { Button, IconButton, Modal, Tag, Empty, SectionTitle } from '../components/ui';
export function Memory() {
  const { data, run } = useApp();
  const [query, setQuery] = useState(''),
    [filter, setFilter] = useState('all'),
    [edit, setEdit] = useState<MemoryRecord | 'new' | null>(null),
    [review, setReview] = useState(false),
    [duplicates, setDuplicates] = useState(false);
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
    .sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        (b.importance || 2) - (a.importance || 2) ||
        b.updatedAt.localeCompare(a.updatedAt),
    );
  return (
    <div className="view">
      <SectionTitle
        eyebrow="MEMORY"
        title="Memory"
        description="What the adviser knows about you. Edit or delete anything."
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
            placeholder="Search memories…"
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
        <button className="review-toggle" onClick={() => setDuplicates(true)}>
          <Copy size={16} />
          Find duplicates
        </button>
      </div>
      <StandingReview />
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
                <Tag
                  tone={
                    m.kind === 'issue' || m.kind === 'risk'
                      ? 'peach'
                      : m.kind === 'goal' || m.kind === 'opportunity'
                        ? 'sage'
                        : 'neutral'
                  }
                >
                  {MEMORY_LABELS[m.kind]}
                </Tag>
                <span className={'importance-dot level-' + (m.importance || 2)}>
                  {IMPORTANCE_LABELS[m.importance || 2]}
                </span>
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
          title={review ? 'All caught up.' : 'No memories yet.'}
          action={
            <Button variant="secondary" onClick={() => setEdit('new')}>
              Add your first memory
            </Button>
          }
        >
          {query
            ? 'No memories match this search.'
            : review
              ? 'Every memory has been reviewed.'
              : 'Add a goal, a person, or context you want the adviser to use.'}
        </Empty>
      )}
      <div className="memory-footnote">
        <Network size={18} />
        <p>
          Each memory keeps its source and certainty. Your edits win over AI guesses, and briefings
          built on a changed memory are removed.
        </p>
      </div>
      {edit && (
        <MemoryEditor memory={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />
      )}
      {duplicates && <DuplicatesPanel onClose={() => setDuplicates(false)} />}
    </div>
  );
}
/**
 * The standing review runs on its own schedule, so this reports what it last
 * did rather than asking for anything. Its findings are already in the review
 * queue and the duplicates panel; the summary is the part that has nowhere
 * else to live.
 */
function StandingReview() {
  const { data, run, reload } = useApp();
  const [busy, setBusy] = useState(false);
  const review = data?.review;
  const running = data?.jobs.some((j) => j.kind === 'review' && j.status !== 'complete');
  const when = review?.at ? new Date(review.at) : null;
  return (
    <section className="standing-review">
      <div>
        <strong>
          <Sparkles size={15} />
          The adviser&rsquo;s own review
        </strong>
        {running ? (
          <p className="small muted">
            Re-reading everything you have saved. This runs in the background — leave the screen if
            you like.
          </p>
        ) : review?.error ? (
          <p className="small">The last review did not finish: {review.error}</p>
        ) : review ? (
          <>
            <p className="small">{review.summary || 'Nothing needed changing.'}</p>
            <p className="small muted">
              {when?.toLocaleDateString()} · read {review.reviewed}, added {review.syntheses},
              re-rated {review.updates}, withdrew {review.retracted}
            </p>
          </>
        ) : (
          <p className="small muted">
            Every so often the adviser re-reads everything on its own, looking for what no single
            note shows: themes across months, goals that have gone quiet, and its own conclusions
            that no longer hold.
          </p>
        )}
      </div>
      <Button
        variant="secondary"
        busy={busy || running}
        disabled={data?.mode === 'demo'}
        onClick={async () => {
          setBusy(true);
          await run(() => api('memories/review', 'POST', {}), 'Review started.');
          await reload();
          setBusy(false);
        }}
      >
        <Sparkles size={16} />
        {running ? 'Reviewing…' : 'Review now'}
      </Button>
    </section>
  );
}
/**
 * Merging is destructive in one direction -- two records become one -- so
 * nothing here happens automatically. The pairs are only a shortlist; the user
 * confirms each one, and dismissing a pair hides it for this visit rather than
 * recording a judgement the model would then have to respect.
 */
function DuplicatesPanel({ onClose }: { onClose: () => void }) {
  const { data, run } = useApp();
  const [pairs, setPairs] = useState<
      { ids: [string, string]; score: number; basis: 'meaning' | 'wording' | 'review' }[] | null
    >(null),
    [error, setError] = useState(''),
    [dismissed, setDismissed] = useState<string[]>([]),
    [busy, setBusy] = useState('');
  useEffect(() => {
    api<typeof pairs>('memories/duplicates')
      .then((r) => setPairs(r || []))
      .catch((e: Error) => setError(e.message));
  }, []);
  const found = (pairs || []).filter((p) => !dismissed.includes(p.ids.join()));
  return (
    <Modal title="Possible duplicates" onClose={onClose}>
      <div className="form-stack">
        <p className="small muted">
          Memories that say close to the same thing. Merging keeps the oldest record, joins the
          details and returns it to your review queue.
        </p>
        {error && <p className="small">{error}</p>}
        {!pairs && !error && <p className="small muted">Comparing your memories…</p>}
        {pairs && !found.length && <p className="small">Nothing looks duplicated right now.</p>}
        {found.map((pair) => {
          const both = pair.ids
            .map((id) => data?.memories.find((m) => m.id === id))
            .filter(Boolean) as MemoryRecord[];
          if (both.length < 2) return null;
          const key = pair.ids.join();
          return (
            <div className="duplicate-pair" key={key}>
              <span className="small muted">
                {pair.basis === 'review'
                  ? 'Flagged by the adviser’s review'
                  : pair.basis === 'meaning'
                    ? `Similar meaning · ${Math.round(pair.score * 100)}%`
                    : `Similar wording · ${Math.round(pair.score * 100)}%`}
              </span>
              {both.map((m) => (
                <div key={m.id}>
                  <strong>{m.title}</strong>
                  <p className="small muted">{m.text}</p>
                </div>
              ))}
              <div className="form-footer">
                <Button variant="ghost" onClick={() => setDismissed([...dismissed, key])}>
                  Not a duplicate
                </Button>
                <Button
                  busy={busy === key}
                  onClick={async () => {
                    setBusy(key);
                    await run(
                      () => api('memories/merge', 'POST', { ids: pair.ids }),
                      'Memories merged.',
                    );
                    setBusy('');
                    setDismissed((d) => [...d, key]);
                  }}
                >
                  <Merge size={16} />
                  Merge
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
/**
 * Links to other memories and tasks. A native multi-select needed Ctrl-click
 * to deselect and offered no way at all to deselect by touch, so a tick that
 * toggles both ways is the whole point here.
 */
function LinkPicker({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { id: string; title: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <div className="link-picker">
      <span className="link-picker-label">
        {label}
        {selected.length > 0 && <Tag>{selected.length}</Tag>}
      </span>
      {options.length ? (
        <div className="link-picker-list">
          {options.map((o) => (
            <label key={o.id}>
              <input
                type="checkbox"
                checked={selected.includes(o.id)}
                onChange={(e) =>
                  onChange(
                    e.target.checked ? [...selected, o.id] : selected.filter((id) => id !== o.id),
                  )
                }
              />
              <span>{o.title}</span>
            </label>
          ))}
        </div>
      ) : (
        <p className="small muted">Nothing to link to yet.</p>
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
    [importance, setImportance] = useState<Importance>(memory?.importance || 2),
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
          importance,
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
    <Modal title={memory ? 'Edit memory' : 'New memory'} onClose={onClose}>
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
          How much should this shape advice?
          <select
            value={importance}
            onChange={(e) => setImportance(Number(e.target.value) as Importance)}
          >
            <option value={3}>Core — bring this up often</option>
            <option value={2}>Supporting — useful context</option>
            <option value={1}>Incidental — keep, but rarely relevant</option>
          </select>
        </label>
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} />
        </label>
        <label>
          Details
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
          <LinkPicker
            label="Related memories"
            options={(data?.memories || [])
              .filter((m) => m.id !== memory?.id)
              .map((m) => ({ id: m.id, title: m.title }))}
            selected={entityIds}
            onChange={setEntities}
          />
          <LinkPicker
            label="Related tasks"
            options={(data?.tasks || []).map((t) => ({ id: t.id, title: t.title }))}
            selected={taskIds}
            onChange={setTasks}
          />
        </details>
        {memory && (
          <p className="small muted">
            Updated {new Date(memory.updatedAt).toLocaleString()}.{' '}
            {memory.sourceRetained
              ? 'Source transcript kept temporarily.'
              : 'Source transcript not retained.'}
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
