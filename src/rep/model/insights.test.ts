import { describe, expect, it } from 'vitest';
import { sansToUcis } from '../../lib/chess';
import type { Game, Result } from '../../lib/types';
import { addPath, newDeck } from './deck';
import { analyse, betterMove, evalDrop, habitText } from './insights';
import type { Color, Deck, Edge } from './types';

// Synthetic games: "Me" against made-up opponents.
let n = 0;
const game = (color: Color, line: string, result: Result = '1/2-1/2', end = 1_000 + n): Game => ({
  id: `g${n++}`,
  white: color === 'w' ? 'Me' : `Opp${n}`,
  black: color === 'b' ? 'Me' : `Opp${n}`,
  result,
  timeClass: 'blitz',
  end,
  ucis: sansToUcis(line.split(' ')),
});
const times = (k: number, color: Color, line: string, result?: Result) => Array.from({ length: k }, () => game(color, line, result));

function book(color: Color, lines: string[]): { decks: Deck[]; edges: Edge[] } {
  const deck = newDeck({ name: 'Book', color, source: { kind: 'board' } });
  let edges: Edge[] = [];
  for (const l of lines) edges = addPath(edges, deck, sansToUcis(l.split(' ')));
  return { decks: [deck], edges };
}
const white = book('w', ['e4 e5 Nf3 Nc6 Bc4', 'e4 c5 Nf3']);

describe('your games against your book', () => {
  it('finds where you forgot your move: the first point you left your own book', () => {
    const r = analyse([game('w', 'e4 e5 Bc4 Nc6 Qh5', '0-1'), game('w', 'e4 e5 Bc4 Nf6', '1-0')], 'me', white.decks, white.edges);
    expect(r.forgot).toHaveLength(1);
    expect(r.forgot[0]).toMatchObject({ kind: 'forgot', color: 'w', games: 2, points: 1, book: ['g1f3'], played: [{ uci: 'f1c4', san: 'Bc4', games: 2 }] });
    expect(r.forgot[0].path).toEqual(sansToUcis(['e4', 'e5']));
  });

  it('finds where you had no move ready, and counts each game once', () => {
    const r = analyse([game('w', 'e4 d5 exd5 Qxd5'), game('w', 'e4 d5 Nc3'), game('w', 'e4 e5 Nf3 Nc6 Bc4 Bc5')], 'ME', white.decks, white.edges);
    expect(r.noAnswer.map((x) => [x.played[0].san, x.games])).toEqual([
      ['d5', 2],
      ['Bc5', 1],
    ]);
    expect(r.forgot).toEqual([]);
  });

  it("as Black, starts at White's first move", () => {
    const black = book('b', ['e4 c5 Nf3 d6']);
    const r = analyse([game('b', 'd4 Nf6'), game('b', 'e4 c5 Nf3 Nc6')], 'me', black.decks, black.edges);
    expect(r.noAnswer[0]).toMatchObject({ color: 'b', played: [{ san: 'd4' }] });
    expect(r.forgot[0]).toMatchObject({ color: 'b', book: ['d7d6'], played: [{ san: 'Nc6' }] });
  });

  it('without a deck of that colour there is no book to leave, but habits still count', () => {
    const r = analyse(times(3, 'b', 'e4 e5 Nf3 d6'), 'me', white.decks, white.edges);
    expect([r.forgot, r.noAnswer]).toEqual([[], []]);
    expect(r.repeated.map((h) => h.san)).toEqual(['e5', 'd6']);
  });

  it('ignores games of other players and unfinished games', () => {
    const r = analyse([{ ...game('w', 'e4 e5'), white: 'Someone' }, game('w', 'e4 e5', '*')], 'me', white.decks, white.edges);
    expect(r.games).toBe(0);
  });
});

describe('habits that cost you', () => {
  it('flags a move that scores 20 points below your other moves there', () => {
    const r = analyse([...times(10, 'w', 'e4 e5 Nf3', '1-0'), ...times(4, 'w', 'e4 e5 Bc4', '0-1')], 'me', [], []);
    const bc4 = r.repeated.find((h) => h.san === 'Bc4')!;
    expect(bc4).toMatchObject({ games: 4, score: 0, others: { games: 10, score: 1 }, weak: ['others'], cost: 4 });
    expect(r.repeated[0]).toBe(bc4);
    expect(habitText(bc4)).toBe('You have played 2.Bc4 here 4 times and scored 0%.');
  });

  it('flags a move at 40% or less over 8 games, and leaves small samples alone', () => {
    const low = analyse([...times(2, 'w', 'e4 e5', '1-0'), ...times(6, 'w', 'e4 e5', '0-1')], 'me', [], []);
    expect(low.repeated[0]).toMatchObject({ san: 'e4', games: 8, score: 0.25, weak: ['low'] });
    // Three games at 0% with only three other games: not enough to call it a habit that costs.
    const few = analyse([...times(3, 'w', 'e4 e5 Nf3', '1-0'), ...times(3, 'w', 'e4 e5 Bc4', '0-1')], 'me', [], []);
    expect(few.repeated.find((h) => h.san === 'Bc4')?.weak).toEqual([]);
  });

  it('counts a position once per game, even when the game comes back to it', () => {
    const r = analyse(times(3, 'w', 'Nf3 Nf6 Ng1 Ng8 Nf3 Nf6'), 'me', [], []);
    expect(r.repeated.find((h) => h.san === 'Nf3')?.games).toBe(3);
  });

  it('knows a better move: your book move first, else the move you score best with', () => {
    const r = analyse([...times(10, 'w', 'e4 e5 Nf3', '1-0'), ...times(4, 'w', 'e4 e5 Bc4', '0-1')], 'me', white.decks, white.edges);
    const bc4 = r.repeated.find((h) => h.san === 'Bc4')!;
    expect(betterMove(bc4, [])).toBe('g1f3');
    const nobook = analyse([...times(10, 'w', 'e4 e5 Nf3', '1-0'), ...times(4, 'w', 'e4 e5 Bc4', '0-1')], 'me', [], []);
    const alts = nobook.repeated.filter((h) => h.key === bc4.key).map((h) => ({ uci: h.uci, score: h.score, games: h.games }));
    expect(betterMove(nobook.repeated.find((h) => h.san === 'Bc4')!, alts)).toBe('g1f3');
  });
});

describe('weak by evaluation', () => {
  it('measures the drop in pawns from the side that moved', () => {
    expect(evalDrop('x w', { cp: 30 }, { cp: -50 })).toBeCloseTo(0.8);
    expect(evalDrop('x b', { cp: -30 }, { cp: 50 })).toBeCloseTo(0.8);
    expect(evalDrop('x w', { mate: 3 }, { cp: 200 })).toBeCloseTo(98);
  });
});
