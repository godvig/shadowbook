import { describe, expect, it } from 'vitest';
import { childrenOf } from './model/deck';
import { enumerateLines } from './model/lines';
import { STARTERS, starterDeck } from './starters';

describe('starter openings', () => {
  it('has the eight openings of the plan, four for each colour', () => {
    expect(STARTERS.map((s) => [s.name, s.color])).toEqual([
      ['Italian Game', 'w'],
      ['Ruy Lopez', 'w'],
      ['London System', 'w'],
      ["Queen's Gambit", 'w'],
      ['Sicilian Defence', 'b'],
      ['French Defence', 'b'],
      ['Caro-Kann Defence', 'b'],
      ["King's Indian Defence", 'b'],
    ]);
    for (const s of STARTERS) expect(s.pitch.length).toBeGreaterThan(20);
  });

  for (const s of STARTERS) {
    it(`${s.name}: legal, one main move per own position, ten moves deep at most, a note on every own move`, () => {
      const { edges } = starterDeck(s);
      const kids = childrenOf(edges);
      const lines = enumerateLines(edges);
      expect(lines.length).toBeGreaterThanOrEqual(3);
      expect(lines.length).toBeLessThanOrEqual(5);
      for (const line of lines) expect(Math.ceil(line.length / 2)).toBeLessThanOrEqual(10);
      for (const e of edges) {
        if (e.mine) {
          expect(e.rank, `${e.san}: only one move of yours per position`).toBe(0);
          expect(e.comment, `${e.san} needs a note`).toBeTruthy();
          expect(e.comment!.length, `${e.san}: note too long`).toBeLessThanOrEqual(140);
        } else {
          // Every line ends on your move: an opponent move always has an answer, here or where it transposes to.
          expect(kids.get(e.to)?.length, `${e.san} has no answer`).toBeGreaterThan(0);
        }
      }
    });
  }

  // parsePgn skips an illegal move and counts it, so a typo in a file shows up here.
  it('reads every move in the files, none skipped', async () => {
    const { parsePgn } = await import('./model/pgn');
    const files = import.meta.glob<string>('./starters/*.pgn', { query: '?raw', import: 'default', eager: true });
    for (const [path, text] of Object.entries(files)) {
      const [g] = parsePgn(text);
      expect(g.skipped, path).toEqual({ nullMoves: 0, illegal: 0 });
      expect(g.fromStart, path).toBe(true);
    }
  });
});
