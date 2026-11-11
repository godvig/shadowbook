import type { Game, Site } from './types';

/** Fetched games are cached per player in IndexedDB, so re-scouting is instant. */
export interface CachedPlayer {
  key: string;
  site: Site;
  username: string;
  fetchedAt: number;
  games: Game[];
}

const DB_NAME = 'doppelgambit';
const STORE = 'players';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'key' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const playerKey = (site: Site, username: string) => `${site}:${username.toLowerCase()}`;

export async function loadPlayer(site: Site, username: string): Promise<CachedPlayer | undefined> {
  try {
    return await run<CachedPlayer | undefined>('readonly', (s) => s.get(playerKey(site, username)));
  } catch {
    return undefined;
  }
}

export async function savePlayer(p: Omit<CachedPlayer, 'key'>): Promise<void> {
  try {
    await run('readwrite', (s) => s.put({ ...p, key: playerKey(p.site, p.username) }));
  } catch {
    // Private browsing or storage full: sparring still works, just without the cache.
  }
}

export async function recentPlayers(): Promise<Omit<CachedPlayer, 'games'>[]> {
  try {
    const all = await run<CachedPlayer[]>('readonly', (s) => s.getAll());
    return all
      .sort((a, b) => b.fetchedAt - a.fetchedAt)
      .slice(0, 6)
      .map(({ key, site, username, fetchedAt }) => ({ key, site, username, fetchedAt }));
  } catch {
    return [];
  }
}
