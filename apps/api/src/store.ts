import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { config, dataDir } from './config.js';
export type Doc = Record<string, any>;
export interface Store {
  get<T extends Doc>(collection: string, id: string): Promise<T | undefined>;
  list<T extends Doc>(collection: string): Promise<T[]>;
  put<T extends Doc>(collection: string, id: string, value: T): Promise<void>;
  remove(collection: string, id: string): Promise<void>;
  atomic<T extends Doc, R>(
    collection: string,
    id: string,
    fn: (current: T | undefined) => { value: T | null; result: R },
  ): Promise<R>;
}
function clean<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}
export class FileStore implements Store {
  private tail: Promise<unknown> = Promise.resolve();
  private state: Record<string, Record<string, Doc>> = {};
  private ready: Promise<void>;
  constructor(private directory = dataDir) {
    this.ready = this.load();
  }
  private async load() {
    await mkdir(this.directory, { recursive: true });
    try {
      this.state = JSON.parse(await readFile(join(this.directory, 'store.json'), 'utf8'));
    } catch (e: any) {
      if (e.code !== 'ENOENT') throw e;
    }
  }
  private async locked<R>(fn: () => Promise<R>): Promise<R> {
    const next = this.tail.then(async () => {
      await this.ready;
      return fn();
    });
    this.tail = next.catch(() => {});
    return next;
  }
  private async persist() {
    const path = join(this.directory, 'store.json');
    const temp = path + '.' + randomUUID() + '.tmp';
    await writeFile(temp, JSON.stringify(this.state), { mode: 0o600 });
    await rename(temp, path);
  }
  async get<T extends Doc>(c: string, id: string) {
    await this.ready;
    await this.tail;
    return this.state[c]?.[id] ? (clean(this.state[c][id]) as T) : undefined;
  }
  async list<T extends Doc>(c: string) {
    await this.ready;
    await this.tail;
    return clean(Object.values(this.state[c] || {})) as T[];
  }
  async put<T extends Doc>(c: string, id: string, value: T) {
    await this.locked(async () => {
      (this.state[c] ??= {})[id] = clean(value);
      await this.persist();
    });
  }
  async remove(c: string, id: string) {
    await this.locked(async () => {
      delete this.state[c]?.[id];
      await this.persist();
    });
  }
  async atomic<T extends Doc, R>(
    c: string,
    id: string,
    fn: (current: T | undefined) => { value: T | null; result: R },
  ) {
    return this.locked(async () => {
      const current = this.state[c]?.[id];
      const { value, result } = fn(current ? (clean(current) as T) : undefined);
      if (value) (this.state[c] ??= {})[id] = clean(value);
      else delete this.state[c]?.[id];
      await this.persist();
      return result;
    });
  }
}
export function firebase() {
  if (!getApps().length)
    initializeApp({ credential: applicationDefault(), projectId: config.GOOGLE_CLOUD_PROJECT });
  return getFirestore();
}
export class CloudStore implements Store {
  private db = firebase();
  private collection(c: string) {
    return this.db.collection('owners').doc(config.OWNER_UID).collection(c);
  }
  async get<T extends Doc>(c: string, id: string) {
    const doc = await this.collection(c).doc(id).get();
    return doc.exists ? (doc.data() as T) : undefined;
  }
  async list<T extends Doc>(c: string) {
    const out: T[] = [];
    let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
    for (;;) {
      let query = this.collection(c).orderBy('__name__').limit(500);
      if (cursor) query = query.startAfter(cursor);
      const snap = await query.get();
      out.push(...snap.docs.map((d) => d.data() as T));
      if (snap.size < 500) break;
      cursor = snap.docs.at(-1);
    }
    return out;
  }
  async put<T extends Doc>(c: string, id: string, value: T) {
    await this.collection(c).doc(id).set(clean(value));
  }
  async remove(c: string, id: string) {
    await this.collection(c).doc(id).delete();
  }
  async atomic<T extends Doc, R>(
    c: string,
    id: string,
    fn: (current: T | undefined) => { value: T | null; result: R },
  ) {
    const ref = this.collection(c).doc(id);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const { value, result } = fn(snap.exists ? (snap.data() as T) : undefined);
      if (value) tx.set(ref, clean(value));
      else tx.delete(ref);
      return result;
    });
  }
  async vectorSearch(vector: number[], limit = 12) {
    const snap = await this.collection('vectors')
      .findNearest('embedding', FieldValue.vector(vector), { limit, distanceMeasure: 'COSINE' })
      .get();
    return snap.docs.map((d) => d.data().memoryId as string);
  }
  // `embedding` is the indexed field findNearest searches but reads back as an
  // opaque value, so the plain array is stored alongside it. Duplicate review
  // needs to compare memories with each other rather than against one query
  // vector, and re-embedding the whole store to do that would cost real money.
  async saveVector(id: string, values: number[]) {
    await this.collection('vectors')
      .doc(id)
      .set({ id, memoryId: id, embedding: FieldValue.vector(values), values });
  }
}
export const store: Store = config.APP_MODE === 'cloud' ? new CloudStore() : new FileStore();
