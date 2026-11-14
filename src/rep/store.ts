// Local-only storage for the repertoire (IndexedDB, its own database). Nothing leaves the browser.
import { revive, type RepEntry } from './repertoire';

const DB = 'shadowbook-rep';
const STORE = 'entries';
const META = 'meta';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.result.createObjectStore(META);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = run(t.objectStore(store));
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
  });
}

export async function loadAll(): Promise<Map<string, RepEntry>> {
  const rows = ((await tx<RepEntry[]>(STORE, 'readonly', (s) => s.getAll())) ?? []).map(revive);
  return new Map(rows.map((r) => [r.id, r]));
}

export async function save(entries: RepEntry[]) {
  if (!entries.length) return;
  await tx(STORE, 'readwrite', (s) => {
    for (const e of entries) s.put(e);
  });
}

export async function remove(id: string) {
  await tx(STORE, 'readwrite', (s) => s.delete(id));
}

export async function clearAll() {
  await tx(STORE, 'readwrite', (s) => s.clear());
}

/** New cards introduced today, so the daily limit survives reloads. */
export async function newToday(day: string): Promise<number> {
  const v = await tx<{ day: string; n: number } | undefined>(META, 'readonly', (s) => s.get('new'));
  return v && v.day === day ? v.n : 0;
}

export async function setNewToday(day: string, n: number) {
  await tx(META, 'readwrite', (s) => s.put({ day, n }, 'new'));
}

/** A JSON backup, since browser storage can be cleared. */
export function exportJson(entries: Iterable<RepEntry>) {
  return JSON.stringify({ app: 'shadowbook', kind: 'repertoire', version: 1, entries: [...entries] }, null, 1);
}

export function importJson(text: string): RepEntry[] {
  const data = JSON.parse(text);
  if (data?.kind !== 'repertoire' || !Array.isArray(data.entries)) throw new Error('Not a Shadowbook repertoire backup');
  return data.entries.map(revive);
}
