import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { buildBook } from './book';
import { pickBookMove, weightedPick } from './bot';
import { demoGames, DEMO_USERNAME } from './demo';

describe('weightedPick', () => {
  it('respects weights', () => {
    const items = [{ w: 1 }, { w: 3 }];
    expect(weightedPick(items, (i) => i.w, () => 0.1)).toBe(items[0]);
    expect(weightedPick(items, (i) => i.w, () => 0.9)).toBe(items[1]);
  });
});

describe('pickBookMove', () => {
  const book = buildBook(demoGames(), DEMO_USERNAME);

  it('plays the demo player’s favourite first move most of the time', () => {
    const counts: Record<string, number> = {};
    for (let i = 0; i < 400; i++) {
      const m = pickBookMove(book, 'w', new Chess().fen())!;
      counts[m.uci] = (counts[m.uci] ?? 0) + 1;
    }
    expect(counts.e2e4).toBeGreaterThan(counts.d2d4 ?? 0);
    expect(Object.keys(counts).sort()).toEqual(['d2d4', 'e2e4']);
  });

  it('reports how often the move was played', () => {
    const m = pickBookMove(book, 'w', new Chess().fen(), () => 0)!;
    expect(m).toMatchObject({ source: 'book', uci: 'e2e4' });
    if (m.source === 'book') expect(m.total).toBe(34);
  });

  it('returns null outside the book', () => {
    const c = new Chess();
    c.move('a3');
    expect(pickBookMove(book, 'b', c.fen())).toBeNull();
  });
});
