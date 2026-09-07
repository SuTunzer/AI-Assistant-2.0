import { createContext, useContext, useRef, useState, useEffect, type ReactNode } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Download,
  X,
  Headphones,
  LoaderCircle,
} from 'lucide-react';
import type { Episode } from './types';
import { api, audioBlob } from './lib/api';
import { localGet, localPut, localAll, localDelete } from './lib/idb';
import { useApp } from './context';
import { IconButton } from './components/ui';
type Cached = { blob: Blob; episode: Episode };
interface PlayerState {
  episode: Episode | null;
  playing: boolean;
  loading: boolean;
  play: (e: Episode) => Promise<void>;
  download: (e: Episode) => Promise<void>;
  downloaded: Set<string>;
}
const Context = createContext<PlayerState | null>(null);
export function usePlayer() {
  const value = useContext(Context);
  if (!value) throw Error('Player missing');
  return value;
}
export function PlayerProvider({ children }: { children: ReactNode }) {
  const { toast, setError, data } = useApp();
  const audio = useRef<HTMLAudioElement>(null);
  const url = useRef<string | undefined>(undefined);
  const [episode, setEpisode] = useState<Episode | null>(null),
    [playing, setPlaying] = useState(false),
    [loading, setLoading] = useState(false),
    [position, setPosition] = useState(0),
    [duration, setDuration] = useState(0),
    [speed, setSpeed] = useState(1),
    [downloaded, setDownloaded] = useState<Set<string>>(new Set());
  useEffect(() => {
    void localAll<Cached>('audio')
      .then((rows) => setDownloaded(new Set(rows.map((r) => r.key))))
      .catch(() => {});
  }, []);
  useEffect(() => {
    const clear = () => {
      audio.current?.pause();
      setEpisode(null);
      setDownloaded(new Set());
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = undefined;
    };
    window.addEventListener('steadier-clear-files', clear);
    return () => window.removeEventListener('steadier-clear-files', clear);
  }, []);
  useEffect(() => {
    if (
      episode &&
      data &&
      !data.episodes.some((e) => e.id === episode.id && e.status === 'ready')
    ) {
      audio.current?.pause();
      setEpisode(null);
    }
  }, [data, episode?.id]);
  useEffect(() => {
    if (!data) return;
    void localAll<Cached>('audio').then(async (rows) => {
      for (const r of rows) {
        const current = data.episodes.find((e) => e.id === r.key);
        if (!current || current.status !== 'ready') {
          await localDelete('audio', r.key);
          if (episode?.id === r.key) {
            audio.current?.pause();
            setEpisode(null);
          }
          setDownloaded((ids) => {
            const next = new Set(ids);
            next.delete(r.key);
            return next;
          });
        }
      }
    });
  }, [data]);
  useEffect(
    () => () => {
      if (url.current) URL.revokeObjectURL(url.current);
    },
    [],
  );
  async function get(e: Episode) {
    if (!e.pinned && Date.parse(e.expiresAt) < Date.now()) {
      await localDelete('audio', e.id);
      throw Error('This episode has expired. Create a fresh briefing.');
    }
    const saved = await localGet<Cached>('audio', e.id);
    if (saved) return saved.blob;
    const info = await api<{ url: string; checksum?: string }>('episodes/' + e.id + '/playback');
    const blob = await audioBlob(info.url);
    if (info.checksum) {
      const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
      const actual = [...new Uint8Array(digest)]
        .map((v) => v.toString(16).padStart(2, '0'))
        .join('');
      if (actual !== info.checksum) throw Error('The download was incomplete. Please try again.');
    }
    return blob;
  }
  async function download(e: Episode) {
    setLoading(true);
    try {
      const blob = await get(e);
      await localPut('audio', e.id, { blob, episode: e });
      setDownloaded((v) => new Set(v).add(e.id));
      if (navigator.storage?.persist) void navigator.storage.persist();
      toast('Downloaded. Ready to listen without a connection.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The download failed.');
    } finally {
      setLoading(false);
    }
  }
  async function play(e: Episode) {
    if (e.status !== 'ready') return;
    setLoading(true);
    try {
      if (episode?.id !== e.id) {
        const blob = await get(e);
        if (url.current) URL.revokeObjectURL(url.current);
        url.current = URL.createObjectURL(blob);
        setEpisode(e);
        audio.current!.src = url.current;
        const saved = Number(localStorage.getItem('steadier-position-' + e.id) || 0);
        audio.current!.currentTime = saved;
        setPosition(saved);
      }
      try {
        await audio.current!.play();
      } catch {
        toast('Audio is ready. Tap play to begin.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start audio.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (!episode || !('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: episode.title,
      artist: 'Steadier',
      album: 'A little clarity for your day',
      artwork: [
        {
          src: new URL(import.meta.env.BASE_URL + 'icons/icon-512.png', location.origin).href,
          sizes: '512x512',
          type: 'image/png',
        },
      ],
    });
    const handlers: { [k: string]: MediaSessionActionHandler } = {
      play: () => void audio.current?.play(),
      pause: () => audio.current?.pause(),
      seekbackward: (d) => {
        if (audio.current)
          audio.current.currentTime = Math.max(0, audio.current.currentTime - (d.seekOffset || 15));
      },
      seekforward: (d) => {
        if (audio.current)
          audio.current.currentTime = Math.min(
            audio.current.duration,
            audio.current.currentTime + (d.seekOffset || 15),
          );
      },
      seekto: (d) => {
        if (audio.current && d.seekTime !== undefined) audio.current.currentTime = d.seekTime;
      },
    };
    for (const [action, handler] of Object.entries(handlers))
      try {
        navigator.mediaSession.setActionHandler(action as MediaSessionAction, handler);
      } catch {}
    return () => {
      for (const action of Object.keys(handlers))
        try {
          navigator.mediaSession.setActionHandler(action as MediaSessionAction, null);
        } catch {}
    };
  }, [episode]);
  const seek = (n: number) => {
    if (audio.current)
      audio.current.currentTime = Math.max(0, Math.min(duration, audio.current.currentTime + n));
  };
  return (
    <Context.Provider value={{ episode, playing, loading, play, download, downloaded }}>
      {children}
      <audio
        ref={audio}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          if (episode) localStorage.removeItem('steadier-position-' + episode.id);
        }}
        onLoadedMetadata={() => {
          setDuration(audio.current?.duration || 0);
        }}
        onTimeUpdate={() => {
          const el = audio.current;
          if (!el) return;
          setPosition(el.currentTime);
          if (episode)
            localStorage.setItem('steadier-position-' + episode.id, String(el.currentTime));
          if ('mediaSession' in navigator && Number.isFinite(el.duration) && el.duration > 0)
            try {
              navigator.mediaSession.setPositionState({
                duration: el.duration,
                playbackRate: el.playbackRate,
                position: Math.min(el.currentTime, el.duration),
              });
            } catch {}
        }}
      />
      {episode && (
        <div className="persistent-player">
          <div className="player-art">
            <Headphones size={22} />
          </div>
          <div className="player-title">
            <strong>{episode.title}</strong>
            <span>{episode.demo ? 'Sample episode' : 'Your personal briefing'}</span>
          </div>
          <div className="player-transport">
            <IconButton label="Back 15 seconds" onClick={() => seek(-15)}>
              <SkipBack size={18} />
            </IconButton>
            <button
              className="play-button"
              aria-label={playing ? 'Pause audio' : 'Play audio'}
              onClick={() => (playing ? audio.current?.pause() : void audio.current?.play())}
            >
              {loading ? (
                <LoaderCircle size={21} className="spin" />
              ) : playing ? (
                <Pause size={21} />
              ) : (
                <Play size={21} />
              )}
            </button>
            <IconButton label="Forward 15 seconds" onClick={() => seek(15)}>
              <SkipForward size={18} />
            </IconButton>
          </div>
          <div className="player-seek">
            <span>{time(position)}</span>
            <input
              aria-label="Playback position"
              type="range"
              min="0"
              max={duration || 1}
              value={Math.min(position, duration || 1)}
              step="0.1"
              onChange={(e) => {
                if (audio.current) audio.current.currentTime = Number(e.target.value);
              }}
            />
            <span>{time(duration)}</span>
          </div>
          <select
            aria-label="Playback speed"
            value={speed}
            onChange={(e) => {
              const n = Number(e.target.value);
              setSpeed(n);
              if (audio.current) audio.current.playbackRate = n;
            }}
          >
            {[0.75, 1, 1.25, 1.5, 1.75, 2].map((n) => (
              <option key={n} value={n}>
                {n}×
              </option>
            ))}
          </select>
          <IconButton label="Download episode" onClick={() => void download(episode)}>
            <Download size={18} />
          </IconButton>
          <IconButton
            label="Close player"
            onClick={() => {
              audio.current?.pause();
              setEpisode(null);
            }}
          >
            <X size={18} />
          </IconButton>
        </div>
      )}
    </Context.Provider>
  );
}
export function time(seconds: number) {
  if (!Number.isFinite(seconds)) return '0:00';
  return Math.floor(seconds / 60) + ':' + String(Math.floor(seconds % 60)).padStart(2, '0');
}
