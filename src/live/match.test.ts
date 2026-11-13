import { describe, expect, it } from 'vitest';
import { countdown, fmtScore, isOpen, matchScore, moveLabel, nextGame, percentages, pointsFor, positionAt, sanMoves, winnerOf } from './match';
import { base64url, challengeFor } from './lichessAuth';
import type { LiveGame } from './types';

const g = (over: Partial<LiveGame>): LiveGame => ({
  id: 1, label: 'Game 1', white: 'gukesh', black: 'sindarov', starts_at: null, status: 'scheduled', result: null, opening: null, pgn: '', ...over,
});

describe('match logic', () => {
  it('maps results to players, not colours', () => {
    expect(winnerOf(g({ result: '1-0' }))).toBe('gukesh');
    expect(winnerOf(g({ result: '1-0', white: 'sindarov', black: 'gukesh' }))).toBe('sindarov');
    expect(winnerOf(g({ result: '1/2-1/2' }))).toBe('draw');
    expect(winnerOf(g({}))).toBeNull();
  });

  it('scores the match with half points', () => {
    const s = matchScore([g({ status: 'finished', result: '1/2-1/2' }), g({ status: 'finished', result: '0-1' }), g({ status: 'live', result: '1-0' })]);
    expect(s).toEqual({ gukesh: 0.5, sindarov: 1.5 });
    expect(fmtScore(1.5)).toBe('1½');
    expect(fmtScore(0.5)).toBe('½');
    expect(fmtScore(2)).toBe('2');
  });

  it('locks predictions at start time or when live', () => {
    const now = Date.parse('2026-11-24T12:00:00Z');
    expect(isOpen(g({}), now)).toBe(true);
    expect(isOpen(g({ starts_at: '2026-11-24T13:00:00Z' }), now)).toBe(true);
    expect(isOpen(g({ starts_at: '2026-11-24T11:00:00Z' }), now)).toBe(false);
    expect(isOpen(g({ status: 'live' }), now)).toBe(false);
    expect(nextGame([g({ id: 1, status: 'finished' }), g({ id: 2 })], now)?.id).toBe(2);
  });

  it('rewards upsets', () => {
    expect(pointsFor('draw', 'draw', 0.6)).toBe(1);
    expect(pointsFor('sindarov', 'sindarov', 0.2)).toBe(2);
    expect(pointsFor('gukesh', 'draw', 0.2)).toBe(0);
    expect(percentages({ gukesh: 1, draw: 2, sindarov: 1 })).toEqual({ gukesh: 25, draw: 50, sindarov: 25 });
    expect(percentages({})).toEqual({ gukesh: 0, draw: 0, sindarov: 0 });
  });

  it('labels moves and rebuilds positions from a PGN', () => {
    const sans = sanMoves('[Event "Test"]\n\n1. d4 Nf6 2. c4 e6 {a comment} 3. Nf3 *');
    expect(sans).toEqual(['d4', 'Nf6', 'c4', 'e6', 'Nf3']);
    expect(moveLabel(sans, 0)).toBe('start');
    expect(moveLabel(sans, 3)).toBe('2.c4');
    expect(moveLabel(sans, 4)).toBe('2...e6');
    expect(positionAt(sans, 2).lastMove).toBe('g8f6');
    expect(sanMoves('not a pgn at all 1. Kxe9')).toEqual([]);
  });

  it('formats countdowns', () => {
    expect(countdown(0)).toBe('00:00:00');
    expect(countdown((2 * 3600 + 14 * 60 + 9) * 1000)).toBe('02:14:09');
    expect(countdown(90_000_000)).toBe('1d 01:00:00');
  });
});

describe('PKCE', () => {
  it('derives the S256 challenge from the verifier', async () => {
    const { createHash } = await import('node:crypto');
    const verifier = 'shadowbook-test-verifier-0123456789-abcdefghij';
    const expected = createHash('sha256').update(verifier).digest('base64url');
    expect(await challengeFor(verifier)).toBe(expected);
    expect(base64url(new Uint8Array([251, 255]))).toBe('-_8');
  });
});
