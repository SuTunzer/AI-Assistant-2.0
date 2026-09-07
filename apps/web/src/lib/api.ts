import { demoRequest } from './demo';
export const appMode = (import.meta.env.VITE_APP_MODE || 'demo') as 'demo' | 'local' | 'cloud';
export const apiBase = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
export class APIError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
let tokenProvider: () => Promise<string> = async () =>
  import.meta.env.VITE_LOCAL_ACCESS_TOKEN || '';
export function setTokenProvider(fn: () => Promise<string>) {
  tokenProvider = fn;
}
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  if (appMode === 'demo') return demoRequest<T>(path, method, body);
  const token = await tokenProvider();
  const response = await fetch(apiBase + '/' + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + token,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ message: 'The server is unavailable. Check your connection.' }));
    throw new APIError(error.message || 'The request failed.', response.status);
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export async function uploadRecording(blob: Blob, mode: string, id: string) {
  if (appMode === 'demo')
    throw new Error(
      'Voice transcription needs a connected workspace. Try a typed note in this preview.',
    );
  const token = await tokenProvider();
  const response = await fetch(apiBase + '/captures/audio', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': blob.type || 'audio/webm',
      'X-Capture-Mode': mode,
      'X-Upload-Id': id,
    },
    body: blob,
  });
  if (!response.ok)
    throw new Error(
      (await response.json()).message || 'Upload failed. Your recording is still on this device.',
    );
  return response.json();
}
export async function audioBlob(url: string) {
  const token = await tokenProvider();
  const isAPI = url.startsWith('/api/') || url.startsWith(apiBase + '/');
  const resolved = url.startsWith('/api/') && apiBase !== '/api' ? apiBase + url.slice(4) : url;
  const response = await fetch(resolved, {
    headers: isAPI ? { Authorization: 'Bearer ' + token } : undefined,
  });
  if (!response.ok)
    throw new Error('Could not download the audio. Check your connection and try again.');
  return response.blob();
}
