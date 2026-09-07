import { useEffect, useState } from 'react';
import {
  Mic,
  Square,
  Pause,
  Play,
  ArrowUpRight,
  Shield,
  NotebookPen,
  Trash2,
  Check,
  RotateCcw,
  LoaderCircle,
} from 'lucide-react';
import { useApp } from '../context';
import { api, appMode, uploadRecording } from '../lib/api';
import { useRecorder, drafts, deleteDraft, type Draft } from '../lib/recording';
import { localPut } from '../lib/idb';
import { Button, Tag, SectionTitle } from '../components/ui';
import { time } from '../player';
import type { Capture as CaptureRecord } from '../types';
export function Capture() {
  const { data, reload, setError, toast } = useApp();
  const [mode, setMode] = useState<'remember' | 'temporary'>('remember'),
    [tab, setTab] = useState<'voice' | 'write'>('voice'),
    [text, setText] = useState(''),
    [saved, setSaved] = useState<Draft[]>([]),
    [busy, setBusy] = useState(false),
    [capture, setCapture] = useState<CaptureRecord | null>(null);
  const rec = useRecorder(setError);
  const active = ['recording', 'paused'].includes(rec.status);
  useEffect(() => {
    void drafts()
      .then(setSaved)
      .catch(() => setError('Local recording storage is unavailable.'));
  }, [rec.status]);
  useEffect(() => {
    if (!capture || !['queued', 'processing'].includes(capture.state)) return;
    const id = capture.id;
    const timer = setInterval(() => {
      void api<CaptureRecord>('captures/' + id)
        .then((c) => {
          setCapture(c);
          if (c.state === 'complete') {
            void reload();
            toast('Note processed.');
          }
        })
        .catch((e) => {
          setError(e.message);
          clearInterval(timer);
        });
    }, 2500);
    return () => clearInterval(timer);
  }, [capture?.id, capture?.state]);
  async function send(d?: Draft) {
    setBusy(true);
    setError('');
    try {
      const id = d?.id || crypto.randomUUID();
      const c = d?.blob
        ? await uploadRecording(d.blob, d.mode, id)
        : await api<CaptureRecord>('captures', 'POST', {
            text: d?.text || text,
            mode: d?.mode || mode,
            idempotencyKey: id,
          });
      setCapture(c);
      if (d) await deleteDraft(d.id);
      setSaved(await drafts());
      if (d?.id === rec.draft?.id) await rec.discard();
      setText('');
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Your capture could not be sent.');
      if (!d && text.trim()) {
        const draft: Draft = {
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          mode,
          seconds: 0,
          text,
        };
        await localPut('drafts', draft.id, draft);
        setSaved(await drafts());
        toast('Your note is saved on this device.');
      }
    } finally {
      setBusy(false);
    }
  }
  const learned = data?.memories.filter((m) => capture?.memoryIds.includes(m.id)) || [];
  return (
    <div className="view capture-view">
      <SectionTitle
        eyebrow="CAPTURE"
        title="Capture a note."
        description="Speak or type. The useful parts become memories."
      />
      <div className="capture-layout">
        <section className="card capture-card">
          <div className="segmented">
            <button
              className={tab === 'voice' ? 'selected' : ''}
              onClick={() => setTab('voice')}
              disabled={active}
            >
              <Mic size={17} />
              Record
            </button>
            <button
              className={tab === 'write' ? 'selected' : ''}
              onClick={() => setTab('write')}
              disabled={active}
            >
              <NotebookPen size={17} />
              Type
            </button>
          </div>
          <div className="capture-mode">
            <label className="switch-label">
              <input
                type="checkbox"
                checked={mode === 'temporary'}
                disabled={active || !!rec.draft}
                onChange={(e) => setMode(e.target.checked ? 'temporary' : 'remember')}
              />
              <span className="switch" />
              <span>Temporary (don't save)</span>
            </label>
            <p>
              {mode === 'temporary'
                ? 'This will not update your memories or tasks.'
                : 'Useful details become editable memories. New tasks always need your approval.'}
            </p>
          </div>
          {tab === 'voice' ? (
            <div className="recorder">
              <div
                className={'mic-orbit ' + (active ? 'active' : '')}
                style={{ '--level': Math.min(rec.level, 1) } as React.CSSProperties}
              >
                <button
                  className="record-button"
                  aria-label={active ? 'Stop recording' : 'Start recording'}
                  disabled={busy || !!rec.draft}
                  onClick={() => (active ? rec.stop() : void rec.start(mode))}
                >
                  {active ? <Square size={30} fill="currentColor" /> : <Mic size={34} />}
                </button>
                <span />
                <span />
              </div>
              <h3>
                {rec.status === 'recording'
                  ? 'Recording.'
                  : rec.status === 'paused'
                    ? 'Paused.'
                    : rec.draft
                      ? 'Ready to send.'
                      : 'Ready to record.'}
              </h3>
              <div className="record-time">{time(rec.seconds)}</div>
              {active ? (
                <div className="button-row">
                  <Button variant="secondary" onClick={rec.pause}>
                    {rec.status === 'paused' ? <Play size={17} /> : <Pause size={17} />}{' '}
                    {rec.status === 'paused' ? 'Resume' : 'Pause'}
                  </Button>
                  <Button onClick={rec.stop}>
                    <Square size={15} /> Finish recording
                  </Button>
                </div>
              ) : rec.draft ? (
                <>
                  <AudioPreview draft={rec.draft} />
                  <div className="button-row">
                    <Button variant="ghost" onClick={() => void rec.discard()}>
                      <Trash2 size={16} />
                      Discard
                    </Button>
                    <Button busy={busy} onClick={() => void send(rec.draft)}>
                      Process note <ArrowUpRight size={17} />
                    </Button>
                  </div>
                </>
              ) : (
                <p className="muted small">
                  Tap the mic. Keep this screen open while recording.
                  <br />
                  Up to 30 minutes, saved on this device.
                </p>
              )}
              {appMode === 'demo' && (
                <p className="preview-note">
                  Preview: recording works on this device. Transcription needs a connected
                  workspace. Try writing a note to explore memory.
                </p>
              )}
            </div>
          ) : (
            <div className="write-capture">
              <label htmlFor="mind-dump" className="sr-only">
                Your note
              </label>
              <textarea
                id="mind-dump"
                placeholder="Type your note…"
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={50000}
                rows={12}
              />
              <div className="form-footer">
                <span className="muted small">Plain text is fine.</span>
                <Button busy={busy} disabled={!text.trim()} onClick={() => void send()}>
                  {mode === 'temporary' ? 'Send' : 'Process note'}
                  <ArrowUpRight size={17} />
                </Button>
              </div>
            </div>
          )}
        </section>
        <aside className="capture-aside">
          <div className="prompt-card">
            <span className="eyebrow">PROMPTS</span>
            <h3>
              Not sure what
              <br />
              to capture?
            </h3>
            <p>
              A task you are avoiding. A decision you need to make. A change to a goal or to someone
              you know.
            </p>
            <div className="prompt-line" />
            <p className="serif">Dump it now, tidy it later.</p>
          </div>
          <div className="privacy-note">
            <Shield size={20} />
            <p>
              Your original recording is removed after processing. You can review and correct what
              is remembered.
            </p>
          </div>
        </aside>
      </div>
      {capture && (
        <section className="card learned-card">
          <div className="section-title">
            <h3>
              {['queued', 'processing'].includes(capture.state) ? (
                <>
                  <LoaderCircle size={20} className="spin" /> Processing…
                </>
              ) : capture.state === 'failed' ? (
                'This capture needs attention'
              ) : (
                'Extracted'
              )}
            </h3>
            <Tag>{capture.mode === 'temporary' ? 'Not remembered' : capture.state}</Tag>
          </div>
          {capture.error && <p className="inline-error">{capture.error}</p>}
          {capture.state === 'failed' && (
            <Button
              variant="secondary"
              onClick={() =>
                void api<CaptureRecord>('captures/' + capture.id + '/retry', 'POST')
                  .then(setCapture)
                  .catch((e) => setError(e.message))
              }
            >
              <RotateCcw size={16} />
              Retry while input is retained
            </Button>
          )}
          {capture.response && <p className="prose">{capture.response}</p>}
          {learned.map((m) => (
            <a href={'#/memory?edit=' + m.id} className="learned-item" key={m.id}>
              <Check size={16} />
              <div>
                <strong>{m.title}</strong>
                <p>{m.text}</p>
              </div>
              <ArrowUpRight size={18} />
            </a>
          ))}
          {!!capture.proposalIds.length && (
            <a className="text-link" href="#/today">
              Review {capture.proposalIds.length} suggested action
              {capture.proposalIds.length !== 1 ? 's' : ''} →
            </a>
          )}
        </section>
      )}
      {saved.filter((d) => d.id !== rec.draft?.id).length > 0 && (
        <section className="card">
          <SectionTitle
            title="Still on this device"
            description="Recover an interrupted recording or an unsent note."
          />
          {saved
            .filter((d) => d.id !== rec.draft?.id)
            .map((d) => (
              <div className="draft-row" key={d.id}>
                <RotateCcw size={18} />
                <div>
                  <strong>{d.text ? d.text.slice(0, 65) : 'Unsent recording'}</strong>
                  <p className="small muted">
                    {new Date(d.createdAt).toLocaleString()} ·{' '}
                    {d.mode === 'temporary' ? 'Temporary' : 'Remember'}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  onClick={async () => {
                    await deleteDraft(d.id);
                    setSaved(await drafts());
                  }}
                >
                  Discard
                </Button>
                <Button variant="secondary" busy={busy} onClick={() => void send(d)}>
                  Send
                </Button>
              </div>
            ))}
        </section>
      )}
    </div>
  );
}
function AudioPreview({ draft }: { draft: Draft }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!draft.blob) return;
    const value = URL.createObjectURL(draft.blob);
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [draft.id]);
  return url ? <audio controls src={url} className="record-preview" /> : null;
}
