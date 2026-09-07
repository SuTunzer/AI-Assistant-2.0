import { useEffect, useRef, useState } from 'react';
import { localPut, localAll, localDelete } from './idb';
export interface Draft {
  id: string;
  createdAt: string;
  mode: 'remember' | 'temporary';
  blob?: Blob;
  mimeType?: string;
  seconds: number;
  text?: string;
}
export function useRecorder(onError: (message: string) => void) {
  const [status, setStatus] = useState<'idle' | 'recording' | 'paused' | 'stopped'>('idle');
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [draft, setDraft] = useState<Draft>();
  const recorder = useRef<MediaRecorder | undefined>(undefined);
  const stream = useRef<MediaStream | undefined>(undefined);
  const context = useRef<AudioContext | undefined>(undefined);
  const frame = useRef(0);
  const chunks = useRef<Blob[]>([]);
  const pending = useRef<Promise<void>[]>([]);
  const draftRef = useRef<Draft | undefined>(undefined);
  const elapsed = useRef(0);
  useEffect(() => {
    if (status !== 'recording') return;
    const timer = setInterval(() => {
      setSeconds((s) => {
        elapsed.current = s + 1;
        if (s >= 1799) recorder.current?.stop();
        return s + 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [status]);
  useEffect(
    () => () => {
      recorder.current?.state !== 'inactive' && recorder.current?.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
      cancelAnimationFrame(frame.current);
      void context.current?.close().catch(() => {});
    },
    [],
  );
  async function start(mode: 'remember' | 'temporary') {
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
        throw Error('Recording needs Chrome over HTTPS or localhost.');
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((m) =>
        MediaRecorder.isTypeSupported(m),
      );
      recorder.current = new MediaRecorder(stream.current, {
        ...(mime ? { mimeType: mime } : {}),
        audioBitsPerSecond: 32000,
      });
      const d: Draft = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        mode,
        seconds: 0,
        mimeType: recorder.current.mimeType,
      };
      draftRef.current = d;
      setDraft(undefined);
      chunks.current = [];
      pending.current = [];
      elapsed.current = 0;
      setSeconds(0);
      await localPut('drafts', d.id, d);
      recorder.current.ondataavailable = (e) => {
        if (e.data.size) {
          const index = chunks.current.length;
          chunks.current.push(e.data);
          pending.current.push(
            localPut('chunks', d.id + '-' + String(index).padStart(5, '0'), {
              draftId: d.id,
              blob: e.data,
            }).catch(() => {
              onError('Device storage is full. Stop and save your recording now.');
            }),
          );
        }
      };
      recorder.current.onstop = async () => {
        await Promise.all(pending.current);
        const blob = new Blob(chunks.current, { type: d.mimeType });
        const complete = { ...d, blob, seconds: elapsed.current };
        setDraft(complete);
        setStatus('stopped');
        await localPut('drafts', d.id, complete);
        stream.current?.getTracks().forEach((t) => t.stop());
        cancelAnimationFrame(frame.current);
        if (context.current?.state !== 'closed') await context.current?.close().catch(() => {});
        setLevel(0);
      };
      recorder.current.onerror = () =>
        onError('The microphone was interrupted. Your recorded pieces remain on this device.');
      context.current = new AudioContext();
      const source = context.current.createMediaStreamSource(stream.current),
        analyser = context.current.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const values = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(values);
        setLevel(values.reduce((a, b) => a + b, 0) / values.length / 128);
        frame.current = requestAnimationFrame(tick);
      };
      tick();
      recorder.current.start(2000);
      setStatus('recording');
    } catch (e) {
      stream.current?.getTracks().forEach((t) => t.stop());
      onError(e instanceof Error ? e.message : 'Microphone access was not available.');
    }
  }
  function stop() {
    if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop();
  }
  function pause() {
    if (recorder.current?.state === 'recording') {
      recorder.current.pause();
      setStatus('paused');
    } else if (recorder.current?.state === 'paused') {
      recorder.current.resume();
      setStatus('recording');
    }
  }
  async function discard() {
    if (draft) await deleteDraft(draft.id);
    setDraft(undefined);
    setSeconds(0);
    setStatus('idle');
  }
  return { status, seconds, level, draft, start, stop, pause, discard };
}
export async function deleteDraft(id: string) {
  await localDelete('drafts', id);
  for (const c of await localAll<{ draftId: string }>('chunks'))
    if (c.value.draftId === id) await localDelete('chunks', c.key);
}
export async function drafts() {
  const all = await localAll<Draft>('drafts');
  const out: Draft[] = [];
  for (const { value: d } of all) {
    if (d.mode === 'temporary' && Date.parse(d.createdAt) < Date.now() - 3600000) {
      await deleteDraft(d.id);
      continue;
    }
    if (!d.blob) {
      const c = (await localAll<{ draftId: string; blob: Blob }>('chunks'))
        .filter((c) => c.value.draftId === d.id)
        .sort((a, b) => a.key.localeCompare(b.key));
      if (c.length)
        d.blob = new Blob(
          c.map((c) => c.value.blob),
          { type: d.mimeType },
        );
    }
    if (d.blob?.size || d.text) out.push(d);
  }
  return out;
}
