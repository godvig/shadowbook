import { describe, expect, it } from 'vitest';
import { START_FEN } from '../lib/chess';
import { parseGame } from '../eval/pgn';
import type { PosEval } from '../eval/types';
import { marksFor, openingLine, repertoireLine, reviewIdFrom } from './review';

const ev = (cp: number, extra: Partial<PosEval> = {}): PosEval => ({ cp, source: 'cloud', ...extra });

describe('review page address', () => {
  it('reads #game/N and nothing else', () => {
    expect(reviewIdFrom('#game/3')).toBe(3);
    expect(reviewIdFrom('#game/14')).toBe(14);
    expect(reviewIdFrom('#predict')).toBeNull();
    expect(reviewIdFrom('#game/')).toBeNull();
    expect(reviewIdFrom('#game/3/x')).toBeNull();
    expect(reviewIdFrom('')).toBeNull();
  });
});

describe('marks on a game', () => {
  const moves = parseGame('1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#');
  it('marks an inaccuracy, the blunder that allows mate, and nothing on checkmate', () => {
    const evals: (PosEval | undefined)[] = [
      ev(20, { best: 'e2e4', second: ev(15) }),
      ev(25),
      ev(20),
      ev(-45),
      ev(-40),
      ev(-20, { best: 'g7g6', second: { mate: 1 } }),
      { mate: 1, source: 'cloud' },
      { over: '1-0', source: 'local' },
    ];
    const marks = marksFor(moves, evals, START_FEN);
    expect(marks).toEqual([undefined, undefined, '?!', undefined, undefined, '??', undefined]);
  });

  it('prefers the broadcast glyph, and marks nothing where an evaluation is missing', () => {
    const withNag = parseGame('1. e4 e5 2. Qh5 $6 Nc6');
    expect(marksFor(withNag, [ev(20), ev(25), ev(20), ev(20), ev(20)], START_FEN)[2]).toBe('?!');
    // The broadcast's ?! on Qh5 stays even without evaluations; 1...e5 has none before it, so no mark.
    expect(marksFor(withNag, [ev(20), undefined, ev(-400)], START_FEN)).toEqual([undefined, undefined, '?!', undefined]);
  });

  it('gives "!" to the only move that holds', () => {
    const g = parseGame('1. e4 e5');
    const evals = [ev(20), ev(30, { best: 'e7e5', second: ev(250) }), ev(25)];
    expect(marksFor(g, evals, START_FEN)[1]).toBe('!');
  });
});

describe('opening and repertoire lines', () => {
  const ucis = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6', 'b5a4', 'g8f6'];
  it('cuts where the first bot leaves its book, ending on the trainee’s move', () => {
    expect(openingLine(ucis, [6, 7], 'w')).toEqual(ucis.slice(0, 5));
    expect(openingLine(ucis, [6, 7], 'b')).toEqual(ucis.slice(0, 6));
    expect(openingLine(ucis, [], 'b')).toEqual(ucis);
    expect(openingLine(Array(30).fill('x'), [], 'w')).toHaveLength(19);
  });

  it('takes the moves up to the shown one for the chosen side', () => {
    expect(repertoireLine(ucis, 4, 'w')).toEqual(ucis.slice(0, 3));
    expect(repertoireLine(ucis, 4, 'b')).toEqual(ucis.slice(0, 4));
    expect(repertoireLine(ucis, 0, 'w')).toEqual([]);
  });
});

describe('"!" is not given to obvious moves', () => {
  // Best move, every other move clearly worse, position not decided: "!" unless the move is obvious.
  const sharp = (best: string) => ev(0, { best, second: ev(-300) });
  const blackSharp = (best: string) => ev(0, { best, second: ev(300) });

  it('no "!" for taking back on the square the opponent just captured on', () => {
    const g = parseGame('1. e4 d5 2. exd5 Qxd5');
    const evals = [ev(0), ev(0), ev(0), ev(0, { best: 'd8d5', second: ev(300) }), ev(0)];
    expect(marksFor(g, evals, START_FEN)[3]).toBeUndefined();
  });

  it('still gives "!" to a capture elsewhere, and to a quiet only move', () => {
    const g = parseGame('1. e4 d5 2. exd5 Nf6');
    expect(marksFor(g, [ev(0), ev(0), ev(0), blackSharp('g8f6'), ev(0)], START_FEN)[3]).toBe('!');
    const h = parseGame('1. e4 d5 2. Nc3 dxe4');
    expect(marksFor(h, [ev(0), ev(0), ev(0), blackSharp('d5e4'), ev(0)], START_FEN)[3]).toBe('!');
    expect(marksFor(parseGame('1. e4'), [sharp('e2e4'), ev(0)], START_FEN)[0]).toBe('!');
  });

  it('no "!" for a move into a position that has already occurred', () => {
    // 3.Ng1 and 4.Nf3 shuffle back into earlier positions; 4.Nf3 repeats the position after 2.Nf3.
    const g = parseGame('1. e4 e5 2. Nf3 Nc6 3. Ng1 Nb8 4. Nf3');
    const evals = g.map(() => ev(0));
    evals.push(ev(0));
    evals[6] = sharp('g1f3');
    expect(marksFor(g, evals, START_FEN)[6]).toBeUndefined();
    // The first time that position came up, the same move could still be an only move.
    const first = [ev(0), ev(0), sharp('g1f3'), ev(0)];
    expect(marksFor(g.slice(0, 3), first, START_FEN)[2]).toBe('!');
  });
});
