// From the v1 Library (one card per position, your moves only, one path per card) to decks, edges and cards.
// Pure, so it can be tested without IndexedDB. Each v1 card keeps its FSRS state under its new card id.
import { Chess } from 'chess.js';
import type { Card as FsrsCard } from 'ts-fsrs';
import { fenKey, playUci, START_FEN } from '../../lib/chess';
import { cardId } from './cards';
import { makeEdge, newDeck, turnOf } from './deck';
import type { Card, Color, Deck, Edge, LibraryData } from './types';

/** A v1 card, as stored in the `entries` store and in v1 backups. */
export interface RepEntry {
  id: string;
  color: Color;
  /** Full FEN of the position, your side to move. */
  fen: string;
  /** Moves you play here (UCI). The first is your main move. */
  moves: string[];
  /** A path from the start position to here (UCI). */
  line: string[];
  card: FsrsCard;
  added: string;
}

/** ts-fsrs dates come back from JSON as strings. */
export function revive(e: RepEntry): RepEntry {
  const c = e.card as FsrsCard & Record<string, unknown>;
  return { ...e, card: { ...c, due: new Date(c.due), last_review: c.last_review ? new Date(c.last_review as unknown as string) : undefined } as FsrsCard };
}

export interface MigrationReport {
  entries: number;
  /** v1 cards whose path could not be replayed; they are left out. */
  broken: number;
  /** Own moves that only existed in a path (removed later in v1); kept as moves so later positions stay reachable. */
  pathOnly: number;
}

export const V1_DECK_NAME: Record<Color, string> = { w: 'My White repertoire', b: 'My Black repertoire' };

export function migrateV1(entries: RepEntry[], now = new Date()): LibraryData & { report: MigrationReport } {
  const report: MigrationReport = { entries: entries.length, broken: 0, pathOnly: 0 };
  const decks: Deck[] = [];
  const edges: Edge[] = [];
  const cards: Card[] = [];
  for (const color of ['w', 'b'] as Color[]) {
    const mine = entries.filter((e) => e.color === color).sort((a, b) => a.line.length - b.line.length || a.added.localeCompare(b.added));
    if (!mine.length) continue;
    // Black one millisecond later, so the decks list White first.
    const deck = newDeck({ name: V1_DECK_NAME[color], color, source: { kind: 'board' } }, new Date(now.getTime() + (color === 'b' ? 1 : 0)));
    decks.push(deck);
    // Your moves at each position come from the card itself, in its order.
    const own = new Map<string, string[]>();
    const replayed = new Map<RepEntry, string>();
    for (const e of mine) {
      const chess = new Chess(START_FEN);
      try {
        for (const u of e.line) playUci(chess, u);
      } catch {
        report.broken++;
        continue;
      }
      if (chess.turn() !== color) {
        report.broken++;
        continue;
      }
      const key = fenKey(chess.fen());
      replayed.set(e, chess.fen());
      if (!own.has(key)) own.set(key, [...e.moves]);
    }
    const byKey = new Map<string, Edge>();
    const ranks = new Map<string, number>();
    const add = (fen: string, uci: string) => {
      const from = fenKey(new Chess(fen).fen());
      if (byKey.has(`${from}|${uci}`)) return;
      let rank: number;
      const ownHere = own.get(from);
      if (turnOf(from) === color && ownHere?.includes(uci)) rank = ownHere.indexOf(uci);
      else {
        // Opponent moves in order of first appearance; own moves only seen in a path go after the card's moves.
        rank = Math.max(ranks.get(from) ?? 0, ownHere?.length ?? 0);
        if (turnOf(from) === color) report.pathOnly++;
      }
      const edge = makeEdge(deck, fen, uci, rank);
      if (!edge) return;
      ranks.set(from, Math.max(ranks.get(from) ?? 0, rank + 1));
      byKey.set(`${from}|${uci}`, edge);
      edges.push(edge);
    };
    for (const [e, fen] of replayed) {
      const chess = new Chess(START_FEN);
      for (const u of e.line) {
        add(chess.fen(), u);
        playUci(chess, u);
      }
      for (const u of e.moves) add(fen, u);
      const key = fenKey(fen);
      const id = cardId(color, key, own.get(key)![0]);
      if (!cards.some((c) => c.id === id)) cards.push({ id, color, fen, fsrs: e.card, addedAt: e.added });
    }
  }
  return { decks, edges, cards, report };
}
