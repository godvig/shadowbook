import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { createEmptyCard, fsrs, Rating } from 'ts-fsrs';
import { Chess } from 'chess.js';
import { fenKey, playUci, sansToUcis, START_FEN } from '../lib/chess';
import { apply, closeForTests, loadBackup, loadLibrary, restore } from './db';
import { backupJson, parseBackup } from './model/backup';
import { cardId } from './model/cards';
import { START_KEY } from './model/deck';
import type { RepEntry } from './model/migrateV1';

const day = '2026-11-16';
const now = new Date(`${day}T12:00:00Z`);

const entry = (color: 'w' | 'b', sans: string[], moves: string[], card = createEmptyCard(now)): RepEntry => {
  const line = sansToUcis(sans);
  const c = new Chess(START_FEN);
  for (const u of line) playUci(c, u);
  return { id: `${color}|${fenKey(c.fen())}`, color, fen: c.fen(), moves, line, card, added: now.toISOString() };
};

/** Writes a v1 database the way the v1 store did. */
function seedV1(rows: RepEntry[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('shadowbook-rep', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('entries', { keyPath: 'id' });
      req.result.createObjectStore('meta');
    };
    req.onsuccess = () => {
      const t = req.result.transaction(['entries', 'meta'], 'readwrite');
      for (const r of rows) t.objectStore('entries').put(r);
      t.objectStore('meta').put({ day, n: 3 }, 'new');
      t.oncomplete = () => {
        req.result.close();
        resolve();
      };
      t.onerror = () => reject(t.error);
    };
    req.onerror = () => reject(req.error);
  });
}

function readRaw(store: string, key?: string): Promise<unknown> {
  return new Promise((resolve) => {
    const req = indexedDB.open('shadowbook-rep');
    req.onsuccess = () => {
      const s = req.result.transaction(store).objectStore(store);
      const r = key === undefined ? s.getAll() : s.get(key);
      r.onsuccess = () => {
        req.result.close();
        resolve(r.result);
      };
    };
  });
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});
afterEach(() => closeForTests());

describe('IndexedDB v2', () => {
  it('migrates a v1 library once: same cards and due dates, v1 store kept, v1 backup saved', async () => {
    const reviewed = fsrs().next(createEmptyCard(now), now, Rating.Good).card;
    const v1 = [entry('w', [], ['e2e4'], reviewed), entry('w', ['e4', 'e5'], ['g1f3']), entry('b', ['e4'], ['c7c5'])];
    await seedV1(v1);

    const lib = await loadLibrary(day);
    expect(lib.decks.map((d) => d.name).sort()).toEqual(['My Black repertoire', 'My White repertoire']);
    expect(lib.cards).toHaveLength(3);
    const first = lib.cards.find((c) => c.id === cardId('w', START_KEY, 'e2e4'))!;
    expect(first.fsrs.due.getTime()).toBe(reviewed.due.getTime());
    expect(lib.newToday).toBe(3);

    expect(await readRaw('entries')).toHaveLength(3);
    const backup = JSON.parse((await readRaw('meta', 'v1Backup')) as string);
    expect(backup.entries).toHaveLength(3);
    expect(parseBackup(JSON.stringify(backup), now).cards).toHaveLength(3);
    expect(await readRaw('meta', 'schema')).toMatchObject({ version: 2, from: 1, entries: 3, broken: 0, cardsAdded: 0 });

    // Opening again does not migrate again.
    closeForTests();
    expect((await loadLibrary(day)).decks).toHaveLength(2);
  });

  it('starts empty on a fresh browser, and writes, backs up and restores', async () => {
    const lib = await loadLibrary(day);
    expect([lib.decks, lib.cards, lib.newToday]).toEqual([[], [], 0]);

    await seedFromBackup();
    const loaded = await loadLibrary(day);
    expect(loaded.decks).toHaveLength(1);
    expect(loaded.edges).toHaveLength(3); // 1.e4, 1…e5 and 2.Nf3

    // Replacing a deck's edges drops the ones that are gone.
    await apply({ edges: [{ deckId: loaded.decks[0].id, edges: loaded.edges.slice(0, 1) }], reviews: [{ cardId: 'x', deckId: loaded.decks[0].id, at: now.toISOString(), rating: 3, mode: 'positions', wasDue: false, elapsedDays: 0, stateBefore: 0 }] });
    expect((await loadLibrary(day)).edges).toHaveLength(1);

    const b = await loadBackup();
    expect(b.reviews).toHaveLength(1);
    const back = parseBackup(backupJson(b), now);
    expect(back.cards[0].fsrs.due instanceof Date).toBe(true);
    await apply({ deleteDecks: [loaded.decks[0].id] });
    expect((await loadLibrary(day)).decks).toEqual([]);
    await restore(back);
    expect((await loadLibrary(day)).edges).toHaveLength(1);
  });
});

async function seedFromBackup() {
  const v1 = JSON.stringify({ app: 'shadowbook', kind: 'repertoire', version: 1, entries: [entry('w', [], ['e2e4']), entry('w', ['e4', 'e5'], ['g1f3'])] });
  await restore(parseBackup(v1, now));
}
