import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { bookMoves, buildBook, choiceShares } from './book';
import { sansToUcis } from './chess';
import type { Game } from './types';

let id = 0;
function game(white: string, black: string, sans: string, result: Game['result'] = '1-0'): Game {
  return { id: String(id++), white, black, result, timeClass: 'rapid', end: id, whiteElo: 1500, blackElo: 1500, ucis: sansToUcis(sans.split(' ')) };
}

const games = [
  game('Bjorn', 'x', 'e4 c5 Nc3 e6 f4 d5'),
  game('Bjorn', 'x', 'e4 c5 Nc3 Nc6 f4 g6', '0-1'),
  game('Bjorn', 'x', 'd4 d5 c4 e6'),
  game('x', 'Bjorn', 'e4 c5 Nf3 d6'),
  game('x', 'Bjorn', 'e4 c5 Nc3 e6', '1/2-1/2'),
  game('x', 'Bjorn', 'd4 Nf6 c4 e6'),
];

describe('buildBook', () => {
  const book = buildBook(games, 'bjorn');

  it('counts games per colour, case-insensitively', () => {
    expect(book.games).toBe(6);
    expect(book.gamesAs).toEqual({ w: 3, b: 3 });
  });

  it('records only the player’s own moves', () => {
    const asWhite = choiceShares(book, 'w');
    expect(asWhite.map((m) => [m.uci, m.stat.n])).toEqual([
      ['e2e4', 2],
      ['d2d4', 1],
    ]);
    // As White, the opponent's replies are not part of Bjorn's book.
    const afterE4 = new Chess();
    afterE4.move('e4');
    expect(bookMoves(book, 'w', afterE4.fen())).toEqual([]);
  });

  it('tracks results from the player’s point of view', () => {
    const e4 = choiceShares(book, 'w')[0].stat;
    expect(e4.points).toBe(1); // one win, one loss
    const afterE4 = new Chess();
    afterE4.move('e4');
    const c5 = bookMoves(book, 'b', afterE4.fen())[0];
    expect(c5.uci).toBe('c7c5');
    expect(c5.stat).toMatchObject({ n: 2, points: 0.5 });
  });
});
