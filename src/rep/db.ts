// Local-only storage for the Library (IndexedDB, its own database). Nothing leaves the browser.
// Version 2 replaces the v1 `entries` store with decks, edges and cards. The upgrade migrates v1 once, inside the
// upgrade transaction: if anything fails, the transaction aborts and the database stays at v1, untouched.
import { syncCards } from './model/cards';
import { migrateV1, revive, type RepEntry } from './model/migrateV1';
import { DEFAULT_SETTINGS, type Card, type Deck, type Edge, type LibraryData, type Review, type Settings } from './model/types';
import type { Backup } from './model/backup';

const DB = 'shadowbook-rep';
const VERSION = 2;

let opening: Promise<IDBDatabase> | null = null;

function upgrade(db: IDBDatabase, tx: IDBTransaction, oldVersion: number) {
  if (!db.objectStoreNames.contains('entries')) db.createObjectStore('entries', { keyPath: 'id' });
  if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
  db.createObjectStore('decks', { keyPath: 'id' });
  const edges = db.createObjectStore('edges', { keyPath: ['deckId', 'from', 'uci'] });
  edges.createIndex('deckId', 'deckId');
  edges.createIndex('deckFrom', ['deckId', 'from']);
  db.createObjectStore('cards', { keyPath: 'id' });
  const reviews = db.createObjectStore('reviews', { keyPath: 'id', autoIncrement: true });
  reviews.createIndex('cardId', 'cardId');
  reviews.createIndex('at', 'at');
  db.createObjectStore('cache');
  const meta = tx.objectStore('meta');
  if (oldVersion < 1) {
    meta.put({ version: VERSION, createdAt: new Date().toISOString() }, 'schema');
    return;
  }
  const read = tx.objectStore('entries').getAll();
  read.onsuccess = () => {
    const rows = (read.result as RepEntry[]).map(revive);
    // The v1 backup goes in first, before anything else is written.
    meta.put(JSON.stringify({ app: 'shadowbook', kind: 'repertoire', version: 1, entries: rows }), 'v1Backup');
    const now = new Date();
    const v1 = migrateV1(rows, now);
    const synced = syncCards(v1.decks, v1.edges, v1.cards, now);
    for (const d of v1.decks) tx.objectStore('decks').put(d);
    for (const e of v1.edges) tx.objectStore('edges').put(e);
    for (const c of synced.cards) tx.objectStore('cards').put(c);
    meta.put({ version: VERSION, migratedAt: now.toISOString(), from: 1, ...v1.report, cardsAdded: synced.added.length }, 'schema');
  };
}

function open(): Promise<IDBDatabase> {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = (ev) => upgrade(req.result, req.transaction!, ev.oldVersion);
    req.onsuccess = () => {
      const db = req.result;
      // Let a newer version of the app upgrade the database from another tab.
      db.onversionchange = () => {
        db.close();
        opening = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('The Library is open in another tab with an older version of Shadowbook. Close that tab and reload.'));
  });
  opening.catch(() => (opening = null));
  return opening;
}

const STORES = ['decks', 'edges', 'cards', 'reviews', 'meta', 'cache'];

function run(mode: IDBTransactionMode, body: (t: IDBTransaction) => void): Promise<void> {
  return open().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const t = db.transaction(STORES, mode);
        body(t);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

const get = <T>(r: IDBRequest, set: (v: T) => void) => (r.onsuccess = () => set(r.result as T));

export interface Stored extends LibraryData {
  settings: Settings;
  /** New cards introduced today. */
  newToday: number;
}

export async function loadLibrary(day: string): Promise<Stored> {
  const out: Stored = { decks: [], edges: [], cards: [], settings: DEFAULT_SETTINGS, newToday: 0 };
  await run('readonly', (t) => {
    get<Deck[]>(t.objectStore('decks').getAll(), (v) => (out.decks = v.sort((a, b) => a.createdAt.localeCompare(b.createdAt))));
    get<Edge[]>(t.objectStore('edges').getAll(), (v) => (out.edges = v));
    get<Card[]>(t.objectStore('cards').getAll(), (v) => (out.cards = v));
    get<Partial<Settings> | undefined>(t.objectStore('meta').get('settings'), (v) => (out.settings = { ...DEFAULT_SETTINGS, ...v }));
    get<{ day: string; n: number } | undefined>(t.objectStore('meta').get('new'), (v) => (out.newToday = v && v.day === day ? v.n : 0));
  });
  return out;
}

/** One change, written in one transaction. `edges` replaces all moves of each deck listed. */
export interface Change {
  decks?: Deck[];
  deleteDecks?: string[];
  edges?: { deckId: string; edges: Edge[] }[];
  cards?: Card[];
  deleteCards?: string[];
  reviews?: Review[];
  newToday?: { day: string; n: number };
}

export function apply(change: Change): Promise<void> {
  return run('readwrite', (t) => {
    const edges = t.objectStore('edges');
    const replace = (deckId: string, next: Edge[]) => {
      const keys = edges.index('deckId').getAllKeys(deckId);
      keys.onsuccess = () => {
        for (const k of keys.result) edges.delete(k);
        for (const e of next) edges.put(e);
      };
    };
    for (const d of change.decks ?? []) t.objectStore('decks').put(d);
    for (const id of change.deleteDecks ?? []) {
      t.objectStore('decks').delete(id);
      replace(id, []);
    }
    for (const r of change.edges ?? []) replace(r.deckId, r.edges);
    for (const c of change.cards ?? []) t.objectStore('cards').put(c);
    for (const id of change.deleteCards ?? []) t.objectStore('cards').delete(id);
    for (const r of change.reviews ?? []) t.objectStore('reviews').add(r);
    if (change.newToday) t.objectStore('meta').put(change.newToday, 'new');
  });
}

export function saveSettings(s: Settings): Promise<void> {
  return run('readwrite', (t) => void t.objectStore('meta').put(s, 'settings'));
}

export async function loadBackup(): Promise<Backup> {
  const out: Backup = { decks: [], edges: [], cards: [], reviews: [] };
  await run('readonly', (t) => {
    get<Deck[]>(t.objectStore('decks').getAll(), (v) => (out.decks = v));
    get<Edge[]>(t.objectStore('edges').getAll(), (v) => (out.edges = v));
    get<Card[]>(t.objectStore('cards').getAll(), (v) => (out.cards = v));
    get<Review[]>(t.objectStore('reviews').getAll(), (v) => (out.reviews = v));
    get<Settings | undefined>(t.objectStore('meta').get('settings'), (v) => (out.settings = v));
  });
  return out;
}

/** Replaces the whole Library with a backup. The v1 `entries` store is left alone. */
export function restore(b: Backup): Promise<void> {
  return run('readwrite', (t) => {
    for (const s of ['decks', 'edges', 'cards', 'reviews']) t.objectStore(s).clear();
    for (const d of b.decks) t.objectStore('decks').put(d);
    for (const e of b.edges) t.objectStore('edges').put(e);
    for (const c of b.cards) t.objectStore('cards').put(c);
    // Review ids are reassigned, so a restored log never collides with what was there.
    for (const r of b.reviews) {
      const row = { ...r };
      delete row.id;
      t.objectStore('reviews').add(row);
    }
    if (b.settings) t.objectStore('meta').put(b.settings, 'settings');
  });
}

/** The `cache` store: answers from public APIs, kept so the same question is not asked twice. */
export async function cacheGet<T>(key: string): Promise<T | undefined> {
  let out: T | undefined;
  await run('readonly', (t) => get<T | undefined>(t.objectStore('cache').get(key), (v) => (out = v)));
  return out;
}

export function cachePut(key: string, value: unknown): Promise<void> {
  return run('readwrite', (t) => void t.objectStore('cache').put(value, key));
}

/** For tests: forget the open connection. */
export function closeForTests() {
  opening?.then((db) => db.close());
  opening = null;
}
