import { describe, expect, it } from 'vitest';
import { decided, judge, onlyMove } from './marks';
import { parseEvalComment, parseGame } from './pgn';
import { scoreText, whiteShare, winningChances } from './winChances';

describe('winning chances (lila ui/lib/src/ceval/winningChances.ts)', () => {
  it('is even at 0, symmetric, and capped at ±1000 cp', () => {
    expect(winningChances({ cp: 0 })).toBe(0);
    expect(winningChances({ cp: 300 })).toBeCloseTo(-winningChances({ cp: -300 }));
    expect(winningChances({ cp: 5000 })).toBe(winningChances({ cp: 1000 }));
    expect(winningChances({ cp: 100 })).toBeCloseTo(0.1821, 3);
  });

  it('treats mate as more than any centipawn score, shorter mates higher', () => {
    expect(winningChances({ mate: 1 })).toBeGreaterThan(winningChances({ cp: 1000 }));
    expect(winningChances({ mate: 1 })).toBeGreaterThan(winningChances({ mate: 8 }));
    expect(winningChances({ mate: 12 })).toBe(winningChances({ mate: 10 }));
    expect(winningChances({ mate: -2 })).toBeLessThan(0);
  });

  it('labels and shares the bar from White’s side', () => {
    expect(scoreText({ cp: 83 })).toBe('+0.8');
    expect(scoreText({ cp: -120 })).toBe('−1.2');
    expect(scoreText({ cp: 0 })).toBe('0.0');
    expect(scoreText({ mate: 3 })).toBe('M3');
    expect(scoreText({ mate: -3 })).toBe('−M3');
    expect(whiteShare({ cp: 0 })).toBe(0.5);
    expect(whiteShare({ mate: -1 })).toBeLessThan(0.05);
  });
});

describe('move marks (lila modules/tree/src/main/Advice.scala)', () => {
  // cp needed for a drop of 0.1 / 0.2 / 0.3 from equality: ~55, ~110, ~168 cp.
  it('judges by the drop in winning chances for the side that moved', () => {
    expect(judge('w', { cp: 20 }, { cp: 0 })).toBeNull();
    expect(judge('w', { cp: 20 }, { cp: -50 })).toBe('?!');
    expect(judge('w', { cp: 20 }, { cp: -100 })).toBe('?');
    expect(judge('w', { cp: 20 }, { cp: -200 })).toBe('??');
    // The same drop for Black is a rise in White's score.
    expect(judge('b', { cp: -20 }, { cp: 200 })).toBe('??');
    expect(judge('b', { cp: -20 }, { cp: -200 })).toBeNull();
  });

  it('forgives drops that do not change the result much', () => {
    // +10 to +8: still winning; the chances drop by only 0.05.
    expect(judge('w', { cp: 1000 }, { cp: 800 })).toBeNull();
    // +8 to +5 is still an inaccuracy: the winning chances drop by 0.175.
    expect(judge('w', { cp: 800 }, { cp: 500 })).toBe('?!');
  });

  it('judges mates created and mates lost like lila', () => {
    expect(judge('w', { cp: 30 }, { mate: -4 })).toBe('??');
    expect(judge('w', { cp: -800 }, { mate: -4 })).toBe('?');
    expect(judge('w', { cp: -1200 }, { mate: -4 })).toBe('?!');
    expect(judge('w', { mate: 3 }, { cp: 300 })).toBe('??');
    expect(judge('w', { mate: 3 }, { cp: 800 })).toBe('?');
    expect(judge('w', { mate: 3 }, { cp: 1500 })).toBe('?!');
    expect(judge('w', { mate: 3 }, { mate: -5 })).toBe('??');
    // A slower mate is not a mistake (MateDelayed has no judgement), and finding a mate is not one either.
    expect(judge('w', { mate: 2 }, { mate: 6 })).toBeNull();
    expect(judge('w', { cp: 400 }, { mate: 5 })).toBeNull();
    expect(judge('b', { cp: 30 }, { mate: 4 })).toBe('??');
  });

  it('gives "!" only to the best move when the second best loses clearly, outside decided positions', () => {
    const pos = { cp: 20, best: 'e2e4', second: { cp: -200 } };
    expect(onlyMove('w', 'e2e4', pos, 20)).toBe(true);
    expect(onlyMove('w', 'd2d4', pos, 20)).toBe(false);
    expect(onlyMove('w', 'e2e4', { ...pos, second: { cp: -40 } }, 20)).toBe(false);
    expect(onlyMove('w', 'e2e4', pos, 1)).toBe(false);
    expect(onlyMove('w', 'e2e4', { cp: 20, best: 'e2e4' }, 20)).toBe(false);
    expect(onlyMove('w', 'e2e4', { ...pos, cp: 650 }, 20)).toBe(false);
    expect(onlyMove('b', 'e7e5', { cp: -20, best: 'e7e5', second: { cp: 200 } }, 20)).toBe(true);
    expect(decided({ mate: 7 })).toBe(true);
    expect(decided({ cp: -501 })).toBe(true);
    expect(decided({ cp: 499 })).toBe(false);
  });
});

describe('broadcast PGN moves', () => {
  it('reads [%eval] in pawns and mates', () => {
    expect(parseEvalComment('{ [%eval 0.23] [%clk 1:59:51] }')).toEqual({ cp: 23 });
    expect(parseEvalComment('[%eval -1.5]')).toEqual({ cp: -150 });
    expect(parseEvalComment('[%eval #-3]')).toEqual({ mate: -3 });
    expect(parseEvalComment('[%clk 1:00:00]')).toBeUndefined();
  });

  it('attaches clocks, evals and glyphs to the move before them, and skips variations', () => {
    const pgn = `[Event "Invented"]
[White "Player A"]

1. e4 { [%eval 0.3] [%clk 1:59:58] } 1... e5 $6 { [%clk 1:59:50] } (1... c5 2. Nf3) 2. Nf3?? { [%clk 1:58:00.4] } Nc6!? *`;
    const g = parseGame(pgn);
    expect(g.map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
    expect(g[0]).toMatchObject({ uci: 'e2e4', clock: '1:59:58', eval: { cp: 30 } });
    expect(g[1]).toMatchObject({ nag: '?!', clock: '1:59:50' });
    expect(g[2]).toMatchObject({ nag: '??', clock: '1:58:00' });
    expect(g[3]).toMatchObject({ nag: '!?' });
    expect(g[3].fen).toContain('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2');
  });

  it('reads move numbers written without spaces and stops at an illegal move', () => {
    expect(parseGame('1.d4 Nf6 2.c4 e6 3.Ke8 Bb4').map((m) => m.san)).toEqual(['d4', 'Nf6', 'c4', 'e6']);
    expect(parseGame('')).toEqual([]);
  });
});

describe('Stockfish output', async () => {
  const { parseInfo, whitePov } = await import('./stockfish');
  it('reads depth, line, score and first move, and skips bound-only lines', () => {
    expect(parseInfo('info depth 18 seldepth 24 multipv 2 score cp -35 nodes 1 nps 1 time 9 pv d7d5 c2c4')).toEqual({ depth: 18, multipv: 2, score: { cp: -35 }, move: 'd7d5' });
    expect(parseInfo('info depth 12 multipv 1 score mate -3 pv h7h6')).toMatchObject({ score: { mate: -3 } });
    expect(parseInfo('info depth 12 multipv 1 score cp 20 lowerbound pv e2e4')).toBeNull();
    expect(parseInfo('info string NNUE evaluation using nn-small.nnue')).toBeNull();
  });
  it('turns side-to-move scores into White’s side', () => {
    expect(whitePov({ cp: 40 }, '8/8/8/8/8/8/8/8 b - - 0 1')).toEqual({ cp: -40 });
    expect(whitePov({ mate: 2 }, '8/8/8/8/8/8/8/8 b - - 0 1')).toEqual({ mate: -2 });
    expect(whitePov({ cp: 40 }, '8/8/8/8/8/8/8/8 w - - 0 1')).toEqual({ cp: 40 });
  });
});
