import { describe, expect, it } from 'vitest';
import { buildBook } from '../lib/book';
import { sansToUcis } from '../lib/chess';
import type { Game } from '../lib/types';
import { addPath, newDeck, ownMoveIndex } from './model/deck';
import { meet, prepQueue } from './meet';

const game = (black: string, sans: string[], i: number): Game =>
  ({ id: 'g' + i, site: 'pgn', white: 'You', black, whiteElo: 1500, blackElo: 1500, result: '1/2-1/2', timeClass: 'blitz', end: i, ucis: sansToUcis(sans) }) as unknown as Game;

describe('meet', () => {
  it('finds where their replies leave your preparation', () => {
    // They answer 1.e4 with 1...e5 six times and 1...c5 four times; after 1.e4 e5 2.Nf3 always 2...Nc6.
    const games = [
      ...Array.from({ length: 6 }, (_, i) => game('Them', ['e4', 'e5', 'Nf3', 'Nc6'], i)),
      ...Array.from({ length: 4 }, (_, i) => game('Them', ['e4', 'c5', 'Nf3', 'd6'], 10 + i)),
    ];
    const book = buildBook(games, 'Them');
    const deck = newDeck({ name: 'Ruy Lopez', color: 'w', source: { kind: 'board' } });
    const edges = addPath([], deck, sansToUcis(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']));
    const r = meet(ownMoveIndex([deck], edges), book, 'w');
    expect(r.theirGames).toBe(10);
    expect(r.uncovered).toBeCloseTo(0.4);
    expect(r.covered).toBeCloseTo(0.6);
    expect(r.gaps).toHaveLength(1);
    expect(r.gaps[0].line).toEqual(sansToUcis(['e4', 'c5']));
    expect(r.gaps[0].games).toBe(4);
    expect(r.meetings[0].reach).toBe(1);
    expect(prepQueue(r).map((m) => m.moves[0])).toEqual(['e2e4', 'g1f3', 'f1b5']);
  });

  it('is empty without a library', () => {
    const book = buildBook([game('Them', ['e4', 'e5'], 0)], 'Them');
    expect(meet(ownMoveIndex([], []), book, 'w').gaps).toEqual([]);
  });
});
