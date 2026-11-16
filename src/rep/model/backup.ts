// JSON backups of the Library. Version 2 holds decks, edges, cards, reviews and settings; version 1 backups
// (one card per position) are migrated on restore.
import type { Card as FsrsCard } from 'ts-fsrs';
import { syncCards } from './cards';
import { migrateV1, revive, type RepEntry } from './migrateV1';
import type { Card, LibraryData, Review, Settings } from './types';

export interface Backup extends LibraryData {
  reviews: Review[];
  settings?: Settings;
}

export function backupJson(b: Backup): string {
  return JSON.stringify({ app: 'shadowbook', kind: 'library', version: 2, ...b }, null, 1);
}

const reviveCard = (c: Card): Card => {
  const f = c.fsrs as FsrsCard & Record<string, unknown>;
  return { ...c, fsrs: { ...f, due: new Date(f.due), last_review: f.last_review ? new Date(f.last_review as unknown as string) : undefined } as FsrsCard };
};

/** Reads a v2 backup, or a v1 one (migrated). Throws with a readable message on anything else. */
export function parseBackup(text: string, now = new Date()): Backup {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file is not a Shadowbook backup.');
  }
  if (data?.kind === 'repertoire' && Array.isArray(data.entries)) {
    const v1 = migrateV1((data.entries as RepEntry[]).map(revive), now);
    return { decks: v1.decks, edges: v1.edges, cards: syncCards(v1.decks, v1.edges, v1.cards, now).cards, reviews: [] };
  }
  if (data?.kind === 'library' && data.version === 2 && Array.isArray(data.decks) && Array.isArray(data.edges) && Array.isArray(data.cards)) {
    return { decks: data.decks, edges: data.edges, cards: data.cards.map(reviveCard), reviews: Array.isArray(data.reviews) ? data.reviews : [], settings: data.settings };
  }
  throw new Error('That file is not a Shadowbook backup.');
}
