import { describe, expect, it } from 'vitest';
import { createEmptyCard, fsrs, Rating, State } from 'ts-fsrs';
import { Chess } from 'chess.js';
import { fenKey, playUci, sansToUcis, START_FEN } from '../../lib/chess';
import { parseBackup } from './backup';
import { cardId, syncCards } from './cards';
import { START_KEY } from './deck';
import { migrateV1, type RepEntry } from './migrateV1';

const now = new Date('2026-11-16T12:00:00Z');
const fenAfter = (line: string[]) => {
  const c = new Chess(START_FEN);
  for (const u of line) playUci(c, u);
  return c.fen();
};
const entry = (color: 'w' | 'b', sans: string[], moves: string[], card = createEmptyCard(now)): RepEntry => {
  const line = sansToUcis(sans);
  const fen = fenAfter(line);
  return { id: `${color}|${fenKey(fen)}`, color, fen, moves, line, card, added: now.toISOString() };
};

/** A synthetic v1 library: White 1.e4, 2.Nf3 (2.Nc3 also accepted), 3.Bb5; Black 1…c5. One card has been reviewed. */
function v1Library() {
  const reviewed = fsrs().next(createEmptyCard(now), now, Rating.Good).card;
  return [
    entry('w', [], ['e2e4'], reviewed),
    entry('w', ['e4', 'e5'], ['g1f3', 'b1c3']),
    entry('w', ['e4', 'e5', 'Nf3', 'Nc6'], ['f1b5']),
    entry('b', ['e4'], ['c7c5']),
  ];
}

describe('migration from v1', () => {
  it('makes one deck per colour with both sides’ moves, and carries every card over with its schedule', () => {
    const v1 = v1Library();
    const r = migrateV1(v1, now);
    expect(r.decks.map((d) => [d.name, d.color])).toEqual([['My White repertoire', 'w'], ['My Black repertoire', 'b']]);
    const [w, b] = r.decks;
    const sans = (deckId: string) => r.edges.filter((e) => e.deckId === deckId).map((e) => `${e.san}${e.mine ? '' : '*'}:${e.rank}`).sort();
    expect(sans(w.id)).toEqual(['Bb5:0', 'Nc3:1', 'Nc6*:0', 'Nf3:0', 'e4:0', 'e5*:0']);
    expect(sans(b.id)).toEqual(['c5:0', 'e4*:0']);
    expect(r.cards.map((c) => c.id).sort()).toEqual(
      [
        cardId('w', START_KEY, 'e2e4'),
        cardId('w', fenKey(v1[1].fen), 'g1f3'),
        cardId('w', fenKey(v1[2].fen), 'f1b5'),
        cardId('b', fenKey(v1[3].fen), 'c7c5'),
      ].sort(),
    );
    const first = r.cards.find((c) => c.id === cardId('w', START_KEY, 'e2e4'))!;
    expect(first.fsrs.state).not.toBe(State.New);
    expect(first.fsrs.due).toEqual(v1[0].card.due);
    // Nothing to add or remove: the migrated cards are exactly the ones the decks need.
    const synced = syncCards(r.decks, r.edges, r.cards, now);
    expect([synced.added, synced.removed]).toEqual([[], []]);
    expect(r.report).toEqual({ entries: 4, broken: 0, pathOnly: 0 });
  });

  it('keeps a position reachable when its path uses a move that was later removed', () => {
    // v1: the card after 1.e4 e5 2.Nf3 was removed, but the Bb5 card's path still runs through 2.Nf3.
    const v1 = [entry('w', [], ['e2e4']), entry('w', ['e4', 'e5'], ['b1c3']), entry('w', ['e4', 'e5', 'Nf3', 'Nc6'], ['f1b5'])];
    const r = migrateV1(v1, now);
    expect(r.report.pathOnly).toBe(1);
    const nf3 = r.edges.find((e) => e.san === 'Nf3')!;
    expect(nf3.rank).toBe(1); // an alternative behind the card's own move
    expect(r.cards).toHaveLength(3);
  });

  it('restores a v1 JSON backup, dates included', () => {
    const json = JSON.stringify({ app: 'shadowbook', kind: 'repertoire', version: 1, entries: v1Library() });
    const b = parseBackup(json, now);
    expect(b.decks).toHaveLength(2);
    expect(b.cards).toHaveLength(4);
    expect(b.cards.every((c) => c.fsrs.due instanceof Date)).toBe(true);
    expect(() => parseBackup('{"kind":"other"}')).toThrow(/not a Shadowbook backup/);
  });
});
