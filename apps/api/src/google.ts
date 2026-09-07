import { randomBytes, createHash } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { config } from './config.js';
import { store } from './store.js';
import { encrypt, decrypt } from './security.js';
import {
  DomainError,
  fromGoogleTask,
  editChecklist,
  orderTasks,
} from '../../../packages/domain/src/tasks.js';
import type {
  Settings,
  Task,
  TaskList,
  ChecklistItem,
} from '../../../packages/domain/src/types.js';
function oauth() {
  return new OAuth2Client(
    config.GOOGLE_CLIENT_ID,
    config.GOOGLE_CLIENT_SECRET,
    config.GOOGLE_REDIRECT_URI,
  );
}
export async function googleConnect() {
  if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET)
    throw new DomainError(
      'GOOGLE_NOT_CONFIGURED',
      'Configure the Google OAuth client on the server first.',
      409,
    );
  const state = randomBytes(24).toString('hex'),
    verifier = randomBytes(48).toString('base64url');
  await store.put('oauth', state, { state, verifier, expiresAt: Date.now() + 10 * 60000 });
  return oauth().generateAuthUrl({
    scope: ['https://www.googleapis.com/auth/tasks'],
    access_type: 'offline',
    prompt: 'consent',
    state,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256' as any,
  });
}
export async function googleCallback(state: string, code: string) {
  const saved = await store.atomic<any, any>('oauth', state, (v) => {
    if (!v || v.expiresAt < Date.now())
      throw new DomainError(
        'OAUTH_EXPIRED',
        'This connection request expired. Please start again.',
        400,
      );
    return { value: null, result: v };
  });
  const client = oauth();
  const { tokens } = await client.getToken({ code, codeVerifier: saved.verifier });
  const old = await store.get('connections', 'google');
  const refresh = tokens.refresh_token || (old ? decrypt(old.refresh) : '');
  if (!refresh)
    throw new DomainError(
      'GOOGLE_REFRESH_MISSING',
      'Google did not grant offline access. Reconnect with consent.',
      409,
    );
  await store.put('connections', 'google', {
    id: 'google',
    refresh: encrypt(refresh),
    connectedAt: new Date().toISOString(),
  });
}
async function accessToken() {
  const saved = await store.get('connections', 'google');
  if (!saved)
    throw new DomainError('TASKS_RECONNECT_REQUIRED', 'Connect Google Tasks in Settings.', 409);
  const client = oauth();
  client.setCredentials({ refresh_token: decrypt(saved.refresh) });
  try {
    const result = await client.getAccessToken();
    if (!result.token) throw Error();
    return result.token;
  } catch {
    throw new DomainError(
      'TASKS_RECONNECT_REQUIRED',
      'Reconnect Google Tasks to refresh access.',
      409,
    );
  }
}
export async function googleCall(path: string, init: RequestInit = {}) {
  const token = await accessToken();
  let r: Response;
  try {
    r = await fetch('https://tasks.googleapis.com/tasks/v1' + path, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new DomainError(
      'TASKS_UNAVAILABLE',
      'Google Tasks did not respond. Refresh before retrying a change.',
      503,
    );
  }
  if (!r.ok) {
    if (r.status === 412)
      throw new DomainError(
        'TASK_CONFLICT',
        'This task changed in another app. Refresh it before trying again.',
        409,
      );
    if (r.status === 401)
      throw new DomainError('TASKS_RECONNECT_REQUIRED', 'Reconnect Google Tasks.', 409);
    throw new DomainError(
      'TASKS_UNAVAILABLE',
      `Google Tasks could not complete the request (${r.status}).`,
      503,
    );
  }
  return r.status === 204 ? null : r.json();
}
async function pages(path: string, params: Record<string, string> = {}) {
  const items: any[] = [];
  let pageToken = '';
  do {
    const query = new URLSearchParams({
      ...params,
      maxResults: '100',
      ...(pageToken ? { pageToken } : {}),
    });
    const data = await googleCall(path + '?' + query);
    items.push(...(data.items || []));
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return items;
}
export async function syncGoogleTasks(
  s: Settings,
): Promise<{ lists: TaskList[]; tasks: Task[]; syncedAt: string }> {
  const lists = (await pages('/users/@me/lists')).map((l) => ({ id: l.id, title: l.title }));
  const selected = s.selectedListIds.length
    ? lists.filter((l) => s.selectedListIds.includes(l.id))
    : lists.slice(0, 1);
  const tasks: Task[] = [];
  for (const list of selected) {
    const raw = await pages(`/lists/${encodeURIComponent(list.id)}/tasks`, {
      showCompleted: 'true',
      showHidden: 'true',
    });
    tasks.push(...orderTasks(raw.filter((t) => !t.deleted).map((t) => fromGoogleTask(list.id, t))));
  }
  const result = { lists, tasks, syncedAt: new Date().toISOString() };
  await store.put('snapshots', 'tasks', result);
  return result;
}
function taskPath(list: string, id: string) {
  return `/lists/${encodeURIComponent(list)}/tasks/${encodeURIComponent(id)}`;
}
async function rememberTask(task: Task) {
  await store.atomic<any, void>('snapshots', 'tasks', (v) => {
    if (!v) return { value: null, result: undefined };
    const index = v.tasks.findIndex((t: Task) => t.id === task.id && t.listId === task.listId);
    if (index >= 0) v.tasks[index] = task;
    else v.tasks.unshift(task);
    return { value: v, result: undefined };
  });
  return task;
}
export async function patchGoogleTask(
  list: string,
  id: string,
  changes: {
    status?: string;
    title?: string;
    due?: string | null;
    etag?: string;
    checklist?: {
      id: string;
      done?: boolean;
      title?: string;
      remove?: boolean;
      add?: ChecklistItem;
    };
  },
) {
  const path = taskPath(list, id),
    raw = await googleCall(path);
  if (changes.etag && changes.etag !== raw.etag)
    throw new DomainError('TASK_CONFLICT', 'This task changed. Refresh before editing.', 409);
  const patch: Record<string, unknown> = {};
  if (changes.status) patch.status = changes.status;
  if (changes.title !== undefined) patch.title = changes.title;
  if (changes.due !== undefined) patch.due = changes.due ? changes.due + 'T00:00:00.000Z' : null;
  if (changes.checklist) {
    const c = changes.checklist;
    patch.notes = editChecklist(raw.notes || '', c.id, c, c.add);
  }
  await googleCall(path, {
    method: 'PATCH',
    headers: { 'If-Match': raw.etag },
    body: JSON.stringify(patch),
  });
  return rememberTask(fromGoogleTask(list, await googleCall(path)));
}
export async function createGoogleTask(list: string, title: string, notes: string, due?: string) {
  if (list === '@default') {
    const lists = await pages('/users/@me/lists');
    if (!lists[0])
      throw new DomainError('TASKS_UNAVAILABLE', 'Create a Google Tasks list first.', 409);
    list = lists[0].id;
  }
  return rememberTask(
    fromGoogleTask(
      list,
      await googleCall(`/lists/${encodeURIComponent(list)}/tasks`, {
        method: 'POST',
        body: JSON.stringify({ title, notes, ...(due ? { due: due + 'T00:00:00.000Z' } : {}) }),
      }),
    ),
  );
}
export async function disconnectGoogle() {
  const saved = await store.get('connections', 'google');
  if (saved) {
    try {
      await oauth().revokeToken(decrypt(saved.refresh));
    } catch {}
  }
  await store.remove('connections', 'google');
  await store.remove('snapshots', 'tasks');
}
