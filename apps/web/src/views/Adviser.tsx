import { useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  Plus,
  MessageCircle,
  Shield,
  BookOpen,
  Check,
  Mic,
  LoaderCircle,
} from 'lucide-react';
import { useApp } from '../context';
import { api, appMode } from '../lib/api';
import { Button, Tag } from '../components/ui';
import { ProposalCard } from './Today';
import type { ChatReply } from '../types';
type Message = { id: string; role: 'you' | 'adviser'; text: string; reply?: ChatReply };
export function Adviser() {
  const { run, setError, reload } = useApp();
  const [messages, setMessages] = useState<Message[]>([]),
    [text, setText] = useState(''),
    [style, setStyle] = useState<'act' | 'reflect' | 'strategy' | 'challenge'>('act'),
    [temporary, setTemporary] = useState(false),
    [useContext, setContext] = useState(true),
    [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, busy]);
  async function send(value = text) {
    if (!value.trim() || busy) return;
    setText('');
    setMessages((v) => [...v, { id: crypto.randomUUID(), role: 'you', text: value }]);
    setBusy(true);
    try {
      const reply = await api<ChatReply>('chat', 'POST', {
        text: value,
        mode: temporary ? 'temporary' : 'remember',
        style,
        useContext,
        history: messages.slice(-8).map((m) => ({ role: m.role, text: m.text })),
      });
      setMessages((v) => [
        ...v,
        { id: crypto.randomUUID(), role: 'adviser', text: reply.text, reply },
      ]);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Your message could not be sent.');
      setText(value);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="view adviser-view">
      <div className="adviser-heading">
        <div>
          <p className="eyebrow">ADVISER</p>
          <h2>Adviser</h2>
        </div>
        <Button variant="ghost" disabled={busy} onClick={() => setMessages([])}>
          <Plus size={16} />
          New conversation
        </Button>
      </div>
      <div className="chat-preferences">
        <div className="filter-tabs">
          {(
            [
              ['act', 'Help me act'],
              ['reflect', 'Talk it through'],
              ['strategy', 'Strategise'],
              ['challenge', 'Challenge me'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              className={style === key ? 'active' : ''}
              onClick={() => setStyle(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="switch-label">
          <input
            type="checkbox"
            checked={temporary}
            onChange={(e) => setTemporary(e.target.checked)}
          />
          <span className="switch" />
          <span>Temporary</span>
        </label>
      </div>
      {temporary && (
        <div className="temporary-strip">
          <Shield size={16} />
          <span>This conversation will not add memories.</span>
          <label>
            <input
              type="checkbox"
              checked={useContext}
              onChange={(e) => setContext(e.target.checked)}
            />
            Use existing context
          </label>
        </div>
      )}
      <div className="chat-content">
        {!messages.length ? (
          <div className="chat-welcome">
            <span className="adviser-symbol">
              <MessageCircle size={30} />
            </span>
            <h3>
              What do you
              <br />
              want to work on?
            </h3>
            <p>
              Ask about your tasks, a decision,
              <br />
              or something you are stuck on.
            </p>
            <div className="conversation-starters">
              {[
                'What should I focus on today?',
                'I keep putting off a task.',
                'Review my goals and priorities.',
                'Help me plan a hard conversation.',
              ].map((q) => (
                <button key={q} onClick={() => void send(q)}>
                  {q}
                  <ArrowUp size={16} />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="messages">
            {messages.map((m) => (
              <article key={m.id} className={'message ' + m.role}>
                <span className="message-avatar">
                  {m.role === 'you' ? 'Y' : <MessageCircle size={17} />}
                </span>
                <div>
                  <p className="message-name">
                    {m.role === 'you' ? 'You' : 'Steadier'}
                    {m.reply?.demo && <Tag tone="neutral">Sample response</Tag>}
                  </p>
                  <div className="prose">{m.text}</div>
                  {!!m.reply?.memoryIds.length && (
                    <a href="#/memory" className="learned-link">
                      <BookOpen size={14} />
                      {m.reply.memoryIds.length} useful detail
                      {m.reply.memoryIds.length !== 1 ? 's' : ''} remembered. Review →
                    </a>
                  )}
                  {m.reply?.proposals.map((p) => (
                    <ProposalCard key={p.id} proposal={p} />
                  ))}
                  {m.role === 'adviser' && (
                    <div className="message-feedback">
                      {(['useful', 'irrelevant', 'too_soft', 'too_pushy'] as const).map((k) => (
                        <button
                          key={k}
                          onClick={() =>
                            void run(
                              () => api('feedback', 'POST', { kind: k, targetId: m.id }),
                              'Thanks. Feedback saved.',
                            )
                          }
                        >
                          {k.replaceAll('_', ' ')}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            ))}
            {busy && (
              <div className="thinking" role="status">
                <LoaderCircle className="spin" size={18} />
                Thinking…
              </div>
            )}
            <div ref={end} />
          </div>
        )}
      </div>
      <form
        className="chat-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <textarea
          aria-label="Message your adviser"
          placeholder="Ask anything…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          maxLength={12000}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <div>
          <a href="#/capture" aria-label="Record a note" className="icon-button">
            <Mic size={19} />
          </a>
          <span className="small muted">
            {temporary ? 'Not added to memory' : 'Useful details can become memories'}
          </span>
          <button
            className="send-button"
            aria-label="Send message"
            disabled={!text.trim() || busy}
            type="submit"
          >
            <ArrowUp size={20} />
          </button>
        </div>
      </form>
      <p className="chat-disclaimer">
        Not a clinician. Interpretations are possibilities, not diagnoses.{' '}
        {appMode === 'demo' ? 'Preview responses are prewritten.' : ''}
      </p>
    </div>
  );
}
