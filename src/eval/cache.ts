// Evaluations of match positions, kept in this browser only (IndexedDB "shadowbook-eval"), 30 days like the
// Library's cache. Separate from the Library's database so the match pages never open or load it.
import type { PosEval } from './types';

const DB = 'shadowbook-eval';
const STORE = 'evals';
const DAY = 86_400_000;
export const KEEP_DAYS = 30;

let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return opening;
}

interface Stored {
  at: number;
  value: PosEval | null;
}

/** A cached evaluation; `null` means "the cloud had nothing" (still worth remembering), undefined means not cached. */
export async function getCached(key: string, now = Date.now()): Promise<PosEval | null | undefined> {
  try {
    const db = await open();
    const hit = await new Promise<Stored | undefined>((resolve, reject) => {
      const r = db.transaction(STORE).objectStore(STORE).get(key);
      r.onsuccess = () => resolve(r.result as Stored | undefined);
      r.onerror = () => reject(r.error);
    });
    return hit && now - hit.at < KEEP_DAYS * DAY ? hit.value : undefined;
  } catch {
    return undefined; // No IndexedDB (private mode in some browsers): work without a cache.
  }
}

export async function putCached(key: string, value: PosEval | null, now = Date.now()): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(STORE, 'readwrite');
      t.objectStore(STORE).put({ at: now, value } satisfies Stored, key);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  } catch {
    // Without a cache the evaluation is simply asked for again next time.
  }
}

/** For tests. */
export function closeEvalCacheForTests() {
  opening?.then((db) => db.close());
  opening = null;
}
