import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { Bootstrap } from './types';
import { api, appMode, APIError } from './lib/api';
import { localAll, clearPrivateCache } from './lib/idb';
import { DEFAULT_SETTINGS, type Episode } from './types';
interface AppState {
  data: Bootstrap | null;
  loading: boolean;
  error: string;
  reload: (refresh?: boolean) => Promise<void>;
  run: <T>(fn: () => Promise<T>, message?: string) => Promise<T | undefined>;
  /**
   * Apply a change to the cached workspace immediately, without a round trip.
   * For optimistic edits: paint the result now, fire the write in the
   * background, reconcile with the server's copy on success or call `reload`
   * on failure.
   */
  mutate: (fn: (data: Bootstrap) => Bootstrap) => void;
  toast: (message: string) => void;
  setError: (message: string) => void;
}
const Context = createContext<AppState | null>(null);
export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Bootstrap | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const toast = useCallback((text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(''), 5000);
  }, []);
  const reload = useCallback(async (refresh = false) => {
    try {
      const next = await api<Bootstrap>('bootstrap' + (refresh ? '?refresh=true' : ''));
      setData(next);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your workspace.');
      if (e instanceof APIError && [401, 403].includes(e.status)) {
        setData(null);
        if (e.status === 403) await clearPrivateCache();
        return;
      }
      const saved = await localAll<{ episode: Episode }>('audio').catch(() => []);
      if (saved.length)
        setData(
          (current) =>
            current || {
              mode: appMode,
              settings: DEFAULT_SETTINGS,
              memories: [],
              tasks: [],
              lists: [],
              proposals: [],
              jobs: [],
              templates: [],
              episodes: saved.map((r) => r.value.episode),
              budget: { month: '', limitAud: 20, spentAud: 0, reservedAud: 0, remainingAud: 0 },
              connections: {
                google: false,
                anthropic: false,
                gemini: false,
                openai: false,
                news: false,
                push: false,
                cloudSpeech: false,
              },
            },
        );
    } finally {
      setLoading(false);
    }
  }, []);
  const mutate = useCallback((fn: (data: Bootstrap) => Bootstrap) => {
    setData((current) => (current ? fn(current) : current));
  }, []);
  async function run<T>(fn: () => Promise<T>, success?: string) {
    try {
      const result = await fn();
      await reload();
      if (success) toast(success);
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      return undefined;
    }
  }
  return (
    <Context.Provider value={{ data, loading, error, reload, run, mutate, toast, setError }}>
      {children}
      {message && (
        <div className="toast" role="status">
          {message}
        </div>
      )}
    </Context.Provider>
  );
}
export function useApp() {
  const ctx = useContext(Context);
  if (!ctx) throw Error('Missing app context');
  return ctx;
}
