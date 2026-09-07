import { useEffect, useState } from 'react';
import {
  Headphones,
  ArrowUpRight,
  Play,
  Download,
  Clock,
  Check,
  SlidersHorizontal,
  Plus,
  Trash2,
  Pin,
  Bell,
  FileText,
  LoaderCircle,
  RefreshCw,
} from 'lucide-react';
import { MODULES, type Module, type Episode, type Template } from '../types';
import { useApp } from '../context';
import { api, appMode } from '../lib/api';
import { usePlayer, time } from '../player';
import {
  Button,
  IconButton,
  Tag,
  Empty,
  Modal,
  SectionTitle,
  Money,
  External,
} from '../components/ui';
import { episodeEstimate } from '../../../../packages/domain/src/budget';
import { enableNotifications } from '../lib/notifications';
export function Listen() {
  const { data, run, reload, setError, toast } = useApp();
  const player = usePlayer();
  const [modules, setModules] = useState<Module[]>(
      data?.settings.defaultModules || ['priorities', 'motivation', 'strategy'],
    ),
    [minutes, setMinutes] = useState(data?.settings.defaultMinutes || 6),
    [custom, setCustom] = useState(''),
    [busy, setBusy] = useState(false),
    [details, setDetails] = useState<Episode | null>(null),
    [save, setSave] = useState(false),
    [name, setName] = useState(''),
    [tab, setTab] = useState<'all' | 'saved' | 'offline'>('all');
  const working = data?.episodes.filter((e) => ['queued', 'working'].includes(e.status)) || [];
  useEffect(() => {
    if (!working.length) return;
    const timer = setInterval(() => void reload(), 3000);
    return () => clearInterval(timer);
  }, [working.length]);
  if (!data) return null;
  const estimate =
    appMode === 'demo' ? 0 : episodeEstimate(data.settings, minutes, modules.includes('news'));
  async function create() {
    setBusy(true);
    await run(
      () =>
        api('episodes', 'POST', { modules, minutes, custom, idempotencyKey: crypto.randomUUID() }),
      appMode === 'demo'
        ? 'Your sample episode is ready.'
        : 'Your briefing is underway. You can leave this screen.',
    );
    setBusy(false);
  }
  function preset(t: Template) {
    setModules(t.modules);
    setMinutes(t.minutes);
    setCustom(t.custom);
    toast('Mix loaded.');
  }
  const episodes = data.episodes
    .filter((e) => tab === 'all' || (tab === 'saved' ? e.pinned : player.downloaded.has(e.id)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <div className="view listen-view">
      <SectionTitle
        eyebrow="BRIEFING"
        title="Build a briefing."
        description="Audio for your commute or run. Choose the topics and the length."
      />
      <div className="listen-layout">
        <section className="card mix-card">
          <div className="section-title">
            <h3>Topics</h3>
            <SlidersHorizontal size={19} />
          </div>
          <p className="muted small">Pick topics. They are combined into one track.</p>
          <div className="module-grid">
            {MODULES.map((m) => (
              <label
                key={m.id}
                className={'module-option ' + (modules.includes(m.id) ? 'chosen' : '')}
              >
                <input
                  type="checkbox"
                  checked={modules.includes(m.id)}
                  onChange={(e) =>
                    setModules(
                      e.target.checked ? [...modules, m.id] : modules.filter((v) => v !== m.id),
                    )
                  }
                />
                <span className="module-check">
                  {modules.includes(m.id) && <Check size={13} />}
                </span>
                <span>
                  <strong>{m.label}</strong>
                  <small>{m.description}</small>
                </span>
              </label>
            ))}
          </div>
          {modules.includes('custom') && (
            <label className="custom-subject">
              What should it cover?
              <textarea
                rows={3}
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                maxLength={2000}
                placeholder="Prep me for a difficult conversation with my manager, using what you know…"
              />
            </label>
          )}
          <div className="length-control">
            <div>
              <span>
                <Clock size={16} /> Length
              </span>
              <strong>
                {minutes} <small>min</small>
              </strong>
            </div>
            <input
              aria-label="Episode length in minutes"
              type="range"
              min="1"
              max="30"
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
            />
            <div className="length-presets">
              {[1, 2, 3, 6, 10, 20, 30].map((n) => (
                <button
                  className={minutes === n ? 'selected' : ''}
                  key={n}
                  onClick={() => setMinutes(n)}
                >
                  {n} min
                </button>
              ))}
            </div>
            <p className="small muted">
              A target length; the finished narration may vary slightly.
            </p>
          </div>
          <div className="mix-footer">
            <Button variant="ghost" disabled={!modules.length} onClick={() => setSave(true)}>
              <Plus size={15} />
              Save this mix
            </Button>
            <span className="small muted">
              {appMode === 'demo' ? (
                'Free sample narration'
              ) : (
                <>
                  Up to <Money amount={estimate} /> reserved
                </>
              )}
            </span>
          </div>
          <Button
            className="create-episode"
            busy={busy}
            disabled={
              !modules.length ||
              (modules.includes('custom') && !custom.trim()) ||
              data.budget.remainingAud < estimate
            }
            onClick={() => void create()}
          >
            <Headphones size={19} />
            {appMode === 'demo' ? 'Try a sample briefing' : 'Create my briefing'}
            <ArrowUpRight size={19} />
          </Button>
          <p className="creation-note">
            Google Tasks are refreshed when generation starts.
            <br />
            {appMode === 'demo'
              ? 'The preview plays a short example, whatever length you select.'
              : 'Usually a few minutes. Longer mixes take longer.'}
          </p>
        </section>
        <aside className="listen-aside">
          <div className="listening-art">
            <div className="sun-disc" />
            <div className="waveform">
              {Array.from({ length: 29 }, (_, i) => (
                <span
                  key={i}
                  style={{
                    height: 15 + Math.sin(i * 0.7) ** 2 * 55 + Math.sin(i * 0.2) ** 2 * 35 + 'px',
                  }}
                />
              ))}
            </div>
            <span className="eyebrow">AUDIO</span>
            <h3>
              Listen on
              <br />
              the move.
            </h3>
            <p>Built from your tasks and memories.</p>
          </div>
          <div className="card notification-card">
            <Bell size={20} />
            <div>
              <h4>Get notified when it's ready.</h4>
              <p className="small muted">A push notification when the audio is done.</p>
              <Button
                variant="ghost"
                onClick={() =>
                  void enableNotifications()
                    .then(() => {
                      toast('Ready notifications enabled.');
                      void reload();
                    })
                    .catch((e) => setError(e.message))
                }
              >
                {data.connections.push ? 'Check this device' : 'Enable notifications'}
                <ArrowUpRight size={15} />
              </Button>
            </div>
          </div>
          {data.templates.length > 0 && (
            <div className="saved-mixes">
              <p className="eyebrow">Your saved mixes</p>
              {data.templates.map((t) => (
                <div key={t.id}>
                  <button onClick={() => preset(t)}>
                    <span>
                      {t.name}
                      <small>
                        {t.minutes} min · {t.modules.length} topics
                      </small>
                    </span>
                    <ArrowUpRight size={16} />
                  </button>
                  <IconButton
                    label={'Delete mix ' + t.name}
                    onClick={() => void run(() => api('templates/' + t.id, 'DELETE'))}
                  >
                    <Trash2 size={14} />
                  </IconButton>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
      <section className="episode-library">
        <SectionTitle title="Library" />
        <div className="filter-tabs">
          {(['all', 'saved', 'offline'] as const).map((t) => (
            <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
              {t === 'all' ? 'All episodes' : t === 'saved' ? 'Saved' : 'Offline'}
            </button>
          ))}
        </div>
        {!episodes.length ? (
          <Empty icon={<Headphones size={27} />} title="No episodes yet.">
            Build a briefing above and it shows up here.
          </Empty>
        ) : (
          <div className="episodes">
            {episodes.map((e) => (
              <article className="card episode-row" key={e.id}>
                <button
                  className={'episode-art ' + (e.status === 'ready' ? 'ready' : '')}
                  aria-label={'Play ' + e.title}
                  disabled={e.status !== 'ready' || player.loading}
                  onClick={() => void player.play(e)}
                >
                  {['queued', 'working'].includes(e.status) ? (
                    <LoaderCircle className="spin" size={23} />
                  ) : (
                    <Play size={23} fill="currentColor" />
                  )}
                </button>
                <div className="episode-info">
                  <button onClick={() => setDetails(e)}>
                    <h3>{e.title}</h3>
                  </button>
                  <p>
                    <span>
                      {new Date(e.createdAt).toLocaleDateString(undefined, {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </span>
                    <span>
                      {e.demo
                        ? 'Sample · about 45 sec'
                        : e.status === 'ready'
                          ? time(e.durationSeconds)
                          : e.minutes + ' min target'}
                    </span>
                    <span>
                      {e.modules.map((m) => MODULES.find((x) => x.id === m)?.label).join(' · ')}
                    </span>
                  </p>
                  {['queued', 'working'].includes(e.status) && (
                    <div className="job-status">
                      <span className="pulse-dot" />
                      {data.jobs.find((j) => j.id === e.jobId)?.stage || 'Queued'}{' '}
                      <button
                        onClick={() => void run(() => api('jobs/' + e.jobId + '/cancel', 'POST'))}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                  {e.error && <p className="inline-error">{e.error}</p>}
                  {e.status === 'outdated' && (
                    <p className="small muted">
                      Memories changed. Create a fresh version to use your corrections.
                    </p>
                  )}
                </div>
                <div className="episode-actions">
                  {player.downloaded.has(e.id) && <Tag>Offline</Tag>}
                  <IconButton label={'Read transcript of ' + e.title} onClick={() => setDetails(e)}>
                    <FileText size={17} />
                  </IconButton>
                  {e.status === 'ready' && (
                    <>
                      <IconButton
                        label={'Download ' + e.title}
                        onClick={() => void player.download(e)}
                        disabled={player.loading}
                      >
                        <Download size={18} />
                      </IconButton>
                      <IconButton
                        label={e.pinned ? 'Unpin episode' : 'Keep episode'}
                        className={e.pinned ? 'pinned' : ''}
                        onClick={() =>
                          void run(() => api('episodes/' + e.id, 'PATCH', { pinned: !e.pinned }))
                        }
                      >
                        <Pin size={17} fill={e.pinned ? 'currentColor' : 'none'} />
                      </IconButton>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      {save && (
        <Modal title="Save mix" onClose={() => setSave(false)}>
          <div className="form-stack">
            <label>
              Mix name
              <input
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
                placeholder="Morning focus"
              />
            </label>
            <Button
              disabled={!name.trim()}
              onClick={async () => {
                const result = await run(
                  () => api('templates', 'POST', { name, modules, minutes, custom }),
                  'Mix saved.',
                );
                if (result) {
                  setSave(false);
                  setName('');
                }
              }}
            >
              Save mix
            </Button>
          </div>
        </Modal>
      )}
      {details && <EpisodeDetails episode={details} onClose={() => setDetails(null)} />}
    </div>
  );
}
function EpisodeDetails({ episode: e, onClose }: { episode: Episode; onClose: () => void }) {
  const { run } = useApp();
  const player = usePlayer();
  const [deleting, setDeleting] = useState(false);
  return (
    <Modal title={e.title} onClose={onClose} wide>
      <div className="episode-detail">
        <div className="button-row">
          {e.status === 'ready' && (
            <Button onClick={() => void player.play(e)}>
              <Play size={16} />
              Listen
            </Button>
          )}
          <Tag tone="neutral">{e.demo ? 'Sample narration' : e.model}</Tag>
        </div>
        {e.taskSyncedAt && (
          <p className="small muted">Tasks checked {new Date(e.taskSyncedAt).toLocaleString()}.</p>
        )}
        <div className="prose transcript">
          {e.script || e.error || 'Your transcript will appear when the briefing is written.'}
        </div>
        {e.sources.length > 0 && (
          <div className="source-list">
            <h4>News sources</h4>
            {e.sources.map((s) => (
              <External key={s.id} url={s.url}>
                {s.title}
              </External>
            ))}
          </div>
        )}
        <div className="feedback-bar">
          <span className="small muted">Feedback</span>
          {(['useful', 'irrelevant', 'incorrect', 'too_soft', 'too_pushy'] as const).map((k) => (
            <button
              key={k}
              onClick={() =>
                void run(
                  () => api('feedback', 'POST', { targetId: e.id, kind: k }),
                  'Feedback saved for future briefings.',
                )
              }
            >
              {k.replaceAll('_', ' ')}
            </button>
          ))}
        </div>
        {deleting ? (
          <div className="danger-panel">
            <p>Delete this episode and its downloaded copy?</p>
            <Button
              variant="danger"
              onClick={async () => {
                const ok = await run(async () => {
                  await api('episodes/' + e.id, 'DELETE');
                  return true;
                }, 'Episode deleted.');
                if (ok) onClose();
              }}
            >
              Delete episode
            </Button>
            <Button variant="ghost" onClick={() => setDeleting(false)}>
              Keep it
            </Button>
          </div>
        ) : (
          <Button variant="ghost" onClick={() => setDeleting(true)}>
            <Trash2 size={15} />
            Delete episode
          </Button>
        )}
      </div>
    </Modal>
  );
}
