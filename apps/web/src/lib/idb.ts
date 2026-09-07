let opening: Promise<IDBDatabase> | undefined;
function db() {
  return (opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('steadier-private-v1', 1);
    request.onupgradeneeded = () => {
      for (const name of ['audio', 'drafts', 'chunks', 'state'])
        request.result.createObjectStore(name);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
}
export async function localGet<T>(store: string, key: string): Promise<T | undefined> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(store, 'readonly'),
      r = tx.objectStore(store).get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function localPut(store: string, key: string, value: unknown) {
  const database = await db();
  return new Promise<void>((resolve, reject) => {
    const tx = database.transaction(store, 'readwrite');
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
export async function localDelete(store: string, key: string) {
  const database = await db();
  return new Promise<void>((resolve, reject) => {
    const tx = database.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
export async function localAll<T>(store: string): Promise<{ key: string; value: T }[]> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(store, 'readonly'),
      r = tx.objectStore(store).openCursor();
    const values: { key: string; value: T }[] = [];
    r.onsuccess = () => {
      const c = r.result;
      if (c) {
        values.push({ key: String(c.key), value: c.value });
        c.continue();
      } else resolve(values);
    };
    r.onerror = () => reject(r.error);
  });
}
export async function clearPrivateCache() {
  const database = await db();
  for (const name of ['audio', 'drafts', 'chunks'])
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(name, 'readwrite');
      tx.objectStore(name).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  window.dispatchEvent(new Event('steadier-clear-files'));
}
