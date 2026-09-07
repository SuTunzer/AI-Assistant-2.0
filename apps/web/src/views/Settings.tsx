import { useState } from 'react';
import {
  Check,
  ArrowUpRight,
  Shield,
  Download,
  Upload,
  KeyRound,
  Link,
  Headphones,
  Bell,
  Trash2,
  LogOut,
  RotateCcw,
  Cloud,
} from 'lucide-react';
import { useApp } from '../context';
import { api, appMode } from '../lib/api';
import { logout } from '../lib/auth';
import { clearPrivateCache } from '../lib/idb';
import { enableNotifications } from '../lib/notifications';
import { Button, Modal, SectionTitle, Tag, Money } from '../components/ui';
import type { Settings as SettingsType, ConnectionStatus } from '../types';
import { MODEL_PRICES } from '../../../../packages/domain/src/budget';
export function Settings() {
  const { data, run, reload, setError, toast } = useApp();
  const [form, setForm] = useState<SettingsType>(data!.settings),
    [busy, setBusy] = useState(false),
    [provider, setProvider] = useState(''),
    [key, setKey] = useState(''),
    [deleteOpen, setDelete] = useState(false),
    [phrase, setPhrase] = useState(''),
    [disconnect, setDisconnect] = useState(false),
    [backups, setBackups] = useState<{ id: string; createdAt: string; count: number }[] | null>(
      null,
    );
  if (!data) return null;
  function update<K extends keyof SettingsType>(key: K, value: SettingsType[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  async function save() {
    setBusy(true);
    await run(() => api('settings', 'PATCH', form), 'Settings saved.');
    setBusy(false);
  }
  async function downloadExport() {
    try {
      const value = await api('export');
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = 'steadier-memories-' + new Date().toISOString().slice(0, 10) + '.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="view settings-view">
      <SectionTitle
        eyebrow="SETTINGS"
        title="Settings"
        description="Connections, models, voice, budget and data."
        action={
          <Button busy={busy} onClick={() => void save()}>
            <Check size={17} />
            Save preferences
          </Button>
        }
      />
      {appMode === 'demo' && (
        <div className="setup-banner">
          <Cloud size={23} />
          <div>
            <strong>You are exploring the preview.</strong>
            <p>
              These are example memories and tasks, stored on this device. Follow the project's
              setup guide to connect your own private workspace.
            </p>
          </div>
        </div>
      )}
      <div className="settings-grid">
        <div className="settings-main">
          <section className="card settings-section">
            <h3>You</h3>
            <div className="form-pair">
              <label>
                Name
                <input
                  value={form.name}
                  maxLength={80}
                  placeholder="Your first name"
                  onChange={(e) => update('name', e.target.value)}
                />
              </label>
              <label>
                Your timezone
                <input
                  value={form.timezone}
                  onChange={(e) => update('timezone', e.target.value)}
                  list="timezones"
                />
                <datalist id="timezones">
                  <option>Australia/Melbourne</option>
                  <option>Australia/Sydney</option>
                  <option>Europe/London</option>
                  <option>America/New_York</option>
                </datalist>
              </label>
            </div>
          </section>
          <section className="card settings-section">
            <h3>Connections</h3>
            <p className="muted">Connect Google Tasks and your AI providers.</p>
            <div className="connection-row">
              <span className="provider-icon google">G</span>
              <div>
                <strong>Google Tasks</strong>
                <p>
                  {data.connections.google
                    ? 'Connected. Your existing app can continue to work alongside this one.'
                    : 'Your current actions, including your checklist subtasks.'}
                </p>
              </div>
              <Button
                variant="secondary"
                onClick={async () => {
                  if (data.connections.google) {
                    setDisconnect(true);
                    return;
                  }
                  try {
                    const { url } = await api<{ url: string }>('google/connect', 'POST');
                    location.assign(url);
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                {data.connections.google ? 'Disconnect' : 'Connect'}
                <ArrowUpRight size={15} />
              </Button>
            </div>
            {!!data.lists.length && (
              <div className="list-selection">
                <p className="small muted">
                  Lists to use in your briefings. With none selected, the first list is used.
                </p>
                {data.lists.map((l) => (
                  <label key={l.id}>
                    <input
                      type="checkbox"
                      checked={form.selectedListIds.includes(l.id)}
                      onChange={(e) =>
                        update(
                          'selectedListIds',
                          e.target.checked
                            ? [...form.selectedListIds, l.id]
                            : form.selectedListIds.filter((id) => id !== l.id),
                        )
                      }
                    />
                    {l.title}
                  </label>
                ))}
              </div>
            )}
            {[
              ['anthropic', 'Anthropic', 'Advice and briefing scripts with Claude.'],
              ['gemini', 'Google Gemini', 'Memory extraction, transcription and voice.'],
              ['openai', 'OpenAI', 'Alternative adviser and voice.'],
              ['news', 'Brave Search', 'Sources for the news module.'],
            ].map(([id, label, desc]) => (
              <div className="connection-row" key={id}>
                <span className={'provider-icon ' + id}>{label[0]}</span>
                <div>
                  <strong>
                    {label}
                    {data.connections[id as keyof ConnectionStatus] && <Check size={14} />}
                  </strong>
                  <p>{desc}</p>
                </div>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setProvider(id);
                    setKey('');
                  }}
                >
                  {data.connections[id as keyof ConnectionStatus] ? 'Update key' : 'Connect'}
                  <ArrowUpRight size={15} />
                </Button>
              </div>
            ))}
          </section>
          <section className="card settings-section">
            <h3>Models</h3>
            <p className="muted">Pick models with a known price so spending can be estimated.</p>
            <div className="form-pair">
              <label>
                Advice provider
                <select
                  value={form.adviceProvider}
                  onChange={(e) => {
                    const p = e.target.value as SettingsType['adviceProvider'];
                    update('adviceProvider', p);
                    update(
                      'adviceModel',
                      p === 'anthropic'
                        ? 'claude-sonnet-5'
                        : p === 'gemini'
                          ? 'gemini-2.5-flash'
                          : 'gpt-4.1-mini',
                    );
                  }}
                >
                  <option value="anthropic">Anthropic</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="openai">OpenAI</option>
                </select>
              </label>
              <label>
                Advice model
                <select
                  value={form.adviceModel}
                  onChange={(e) => update('adviceModel', e.target.value)}
                >
                  {Object.keys(MODEL_PRICES)
                    .filter((m) =>
                      form.adviceProvider === 'anthropic'
                        ? m.startsWith('claude')
                        : form.adviceProvider === 'gemini'
                          ? m.startsWith('gemini')
                          : m.startsWith('gpt'),
                    )
                    .map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                </select>
              </label>
            </div>
            <div className="form-pair">
              <label>
                Memory extraction
                <select
                  value={form.extractionModel}
                  onChange={(e) => update('extractionModel', e.target.value)}
                >
                  <option>gemini-2.5-flash-lite</option>
                  <option>gemini-2.5-flash</option>
                </select>
              </label>
              <label>
                Transcription
                <select
                  value={form.transcriptionModel}
                  onChange={(e) => update('transcriptionModel', e.target.value)}
                >
                  <option>gemini-2.5-flash</option>
                  <option>gemini-2.5-flash-lite</option>
                </select>
              </label>
            </div>
          </section>
          <section className="card settings-section">
            <h3>Voice</h3>
            <div className="form-pair">
              <label>
                Voice provider
                <select
                  value={form.voiceProvider}
                  onChange={(e) => {
                    const p = e.target.value as SettingsType['voiceProvider'];
                    update('voiceProvider', p);
                    update(
                      'voiceModel',
                      p === 'openai' ? 'gpt-4o-mini-tts' : 'gemini-2.5-flash-preview-tts',
                    );
                    update('voice', p === 'openai' ? 'coral' : 'Kore');
                  }}
                >
                  <option value="gemini">Gemini API</option>
                  <option value="google-cloud">Google Cloud speech</option>
                  <option value="openai">OpenAI</option>
                </select>
              </label>
              <label>
                Voice
                <select value={form.voice} onChange={(e) => update('voice', e.target.value)}>
                  {(form.voiceProvider === 'openai'
                    ? ['coral', 'nova', 'marin', 'cedar']
                    : ['Kore', 'Aoede', 'Leda', 'Zephyr', 'Sulafat']
                  ).map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-pair">
              <label>
                Speech model
                <select
                  value={form.voiceModel}
                  onChange={(e) => update('voiceModel', e.target.value)}
                >
                  {(form.voiceProvider === 'openai'
                    ? ['gpt-4o-mini-tts']
                    : ['gemini-2.5-flash-preview-tts', 'gemini-2.5-pro-preview-tts']
                  ).map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </label>
              <label>
                Accent and delivery
                <input
                  value={form.accent}
                  maxLength={100}
                  onChange={(e) => update('accent', e.target.value)}
                  placeholder="British English"
                />
              </label>
            </div>
            <p className="small muted">
              Kore is the default English woman's voice. Voice and accent quality depend on the
              provider.
            </p>
          </section>
          <section className="card settings-section">
            <h3>News</h3>
            <label>
              News interests <span className="muted">(one per line)</span>
              <textarea
                rows={4}
                value={form.newsInterests.join('\n')}
                onChange={(e) => update('newsInterests', e.target.value.split('\n'))}
              />
            </label>
            <p className="small muted">
              Briefings link to their sources. News works only when your search account permits
              storing and reusing results in audio.
            </p>
          </section>
        </div>
        <aside className="settings-aside">
          <section className="card budget-card">
            <span className="eyebrow">BUDGET</span>
            <h3>Monthly budget</h3>
            <div className="budget-number">
              <Money amount={data.budget.spentAud} />
              <small> of A${data.budget.limitAud}</small>
            </div>
            <div className="budget-track">
              <i
                style={{
                  width:
                    Math.min(
                      100,
                      ((data.budget.spentAud + data.budget.reservedAud) / data.budget.limitAud) *
                        100,
                    ) + '%',
                }}
              />
            </div>
            <p className="small muted">
              <Money amount={data.budget.reservedAud} /> reserved ·{' '}
              <Money amount={data.budget.remainingAud} /> available
            </p>
            <label>
              Monthly limit (AUD)
              <input
                type="number"
                min="1"
                max="1000"
                value={form.monthlyBudgetAud}
                onChange={(e) => update('monthlyBudgetAud', Number(e.target.value))}
              />
            </label>
            <details>
              <summary>How estimates work</summary>
              <p className="small muted">
                Jobs reserve an estimate before starting. Some charges remain estimates when
                providers do not return final usage. The app leaves an infrastructure allowance;
                your provider invoices are authoritative.
              </p>
              <label>
                AUD per USD
                <input
                  type="number"
                  step="0.01"
                  min="0.5"
                  max="5"
                  value={form.usdToAud}
                  onChange={(e) => update('usdToAud', Number(e.target.value))}
                />
              </label>
              <label>
                Cost buffer
                <input
                  type="number"
                  step="0.05"
                  min="1"
                  max="2"
                  value={form.costBuffer}
                  onChange={(e) => update('costBuffer', Number(e.target.value))}
                />
              </label>
            </details>
          </section>
          <section className="card settings-section">
            <h3>Data retention</h3>
            <label>
              Original transcripts
              <select
                value={form.transcriptHours}
                onChange={(e) => update('transcriptHours', Number(e.target.value) as 0 | 24)}
              >
                <option value={0}>Delete after processing</option>
                <option value={24}>Keep for 24 hours</option>
              </select>
            </label>
            <label>
              Unpinned audio expires after
              <select
                value={form.episodeDays}
                onChange={(e) => update('episodeDays', Number(e.target.value))}
              >
                {[1, 3, 7, 14, 30].map((n) => (
                  <option key={n} value={n}>
                    {n} days
                  </option>
                ))}
              </select>
            </label>
            <p className="small muted">
              Recordings are deleted after processing. Temporary conversations never update memory.
              AI providers apply their own account retention policies.
            </p>
            <Button
              variant="secondary"
              onClick={() =>
                void enableNotifications()
                  .then(() => toast('Ready notifications enabled.'))
                  .catch((e) => setError(e.message))
              }
            >
              <Bell size={16} />
              Ready notifications
            </Button>
          </section>
          <section className="card settings-section">
            <h3>Your data</h3>
            <Button
              variant="ghost"
              onClick={() =>
                void api<{ id: string; createdAt: string; count: number }[]>('backups')
                  .then(setBackups)
                  .catch((e) => setError(e.message))
              }
            >
              <Cloud size={16} />
              Encrypted backups
            </Button>
            <Button variant="ghost" onClick={() => void downloadExport()}>
              <Download size={16} />
              Export memories
            </Button>
            <label className="button ghost import-button">
              <Upload size={16} />
              Import memories
              <input
                type="file"
                accept="application/json,.json"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const value = JSON.parse(await file.text());
                    await run(() => api('import', 'POST', value), 'Memories imported.');
                  } catch {
                    setError('Choose a valid Steadier memory export.');
                  }
                  e.target.value = '';
                }}
              />
            </label>
            <Button
              variant="ghost"
              onClick={() =>
                void clearPrivateCache().then(() =>
                  toast('Recordings and offline audio removed from this device.'),
                )
              }
            >
              <Shield size={16} />
              Clear this device's files
            </Button>
            <Button variant="ghost" onClick={() => setDelete(true)}>
              <Trash2 size={16} />
              Delete all memories
            </Button>
            {appMode === 'demo' ? (
              <Button
                variant="ghost"
                onClick={() => void run(() => api('reset', 'POST'), 'Preview reset.')}
              >
                <RotateCcw size={16} />
                Reset sample workspace
              </Button>
            ) : appMode === 'cloud' ? (
              <Button
                variant="ghost"
                onClick={async () => {
                  await clearPrivateCache();
                  await logout();
                  location.reload();
                }}
              >
                <LogOut size={16} />
                Sign out
              </Button>
            ) : null}
          </section>
        </aside>
      </div>
      <div className="settings-save">
        <Button busy={busy} onClick={() => void save()}>
          Save preferences
          <Check size={17} />
        </Button>
      </div>
      {backups && (
        <Modal title="Your encrypted backups" onClose={() => setBackups(null)}>
          <div className="form-stack">
            <p className="small muted">
              Daily snapshots are kept for seven days. Restore adds missing memories, without
              replacing newer corrections or reviving deleted memories.
            </p>
            {!backups.length && (
              <p>No backups yet. They start after your private workspace is connected.</p>
            )}
            {backups.map((b) => (
              <div className="draft-row" key={b.id}>
                <div>
                  <strong>{new Date(b.createdAt).toLocaleDateString()}</strong>
                  <p className="small muted">{b.count} memories</p>
                </div>
                <Button
                  variant="secondary"
                  onClick={async () => {
                    const ok = await run(
                      () => api('backups/' + b.id + '/restore', 'POST', { confirm: true }),
                      'Missing memories restored. Review them in Memory.',
                    );
                    if (ok) setBackups(null);
                  }}
                >
                  Restore missing memories
                </Button>
              </div>
            ))}
            <Button
              variant="secondary"
              onClick={async () => {
                await run(() => api('backups', 'POST'), 'Backup requested.');
                setBackups(await api('backups'));
              }}
            >
              Back up now
            </Button>
          </div>
        </Modal>
      )}
      {provider && (
        <Modal
          title={'Connect ' + (provider === 'news' ? 'Brave Search' : provider)}
          onClose={() => setProvider('')}
        >
          <div className="form-stack">
            <p className="muted">
              Your key is sent to your private server and stored securely. It is never returned to
              the browser.
            </p>
            <label>
              API key
              <input
                type="password"
                autoComplete="off"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="Paste your API key"
              />
            </label>
            <Button
              disabled={!key.trim()}
              busy={busy}
              onClick={async () => {
                setBusy(true);
                const ok = await run(
                  () => api('connections/' + provider, 'POST', { key }),
                  'Connection key saved.',
                );
                setBusy(false);
                if (ok) {
                  setProvider('');
                  setKey('');
                }
              }}
            >
              <KeyRound size={16} />
              Save connection
            </Button>
          </div>
        </Modal>
      )}
      {deleteOpen && (
        <Modal title="Delete all memories?" onClose={() => setDelete(false)}>
          <div className="form-stack">
            <p>
              This removes every memory, capture and any audio built from them. Your Google Tasks
              are kept. This cannot be undone.
            </p>
            <label>
              Type DELETE MY MEMORIES
              <input
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                autoComplete="off"
              />
            </label>
            <Button
              variant="danger"
              disabled={phrase !== 'DELETE MY MEMORIES'}
              onClick={async () => {
                const ok = await run(async () => {
                  await api('memory', 'DELETE', { confirm: phrase });
                  await clearPrivateCache();
                  return true;
                }, 'Your memories have been deleted.');
                if (ok) {
                  setDelete(false);
                  setPhrase('');
                }
              }}
            >
              Delete my memories
            </Button>
          </div>
        </Modal>
      )}
      {disconnect && (
        <Modal title="Disconnect Google Tasks?" onClose={() => setDisconnect(false)}>
          <div className="form-stack">
            <p>Steadier stops reading and updating your tasks. They stay in Google.</p>
            <Button
              variant="danger"
              onClick={async () => {
                await run(async () => {
                  await api('google/connect', 'DELETE');
                  return true;
                }, 'Google Tasks disconnected.');
                setDisconnect(false);
              }}
            >
              Disconnect
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
