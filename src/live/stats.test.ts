import { describe, expect, it } from 'vitest';
import { matchStats } from './stats';
import type { LiveGame } from './types';

const g = (id: number, over: Partial<LiveGame>): LiveGame => ({ id, label: `Game ${id}`, white: 'gukesh', black: 'sindarov', starts_at: null, status: 'finished', result: null, opening: null, pgn: '', ...over });

describe('match stats', () => {
  const games = [
    g(1, { result: '1/2-1/2', opening: 'Catalan', pgn: '1. d4 Nf6 2. c4 e6 3. g3 d5 4. Bg2' }),
    g(2, { white: 'sindarov', black: 'gukesh', result: '1-0', opening: 'Berlin Defence', pgn: '1. e4 e5' }),
    g(3, { result: '0-1', opening: 'Catalan', pgn: '1. d4 d5' }),
    g(4, { status: 'scheduled' }),
  ];
  const tally = { 1: { draw: 6, gukesh: 3, sindarov: 1 }, 2: { gukesh: 5, draw: 3, sindarov: 2 }, 3: { gukesh: 2, draw: 2 } };

  it('summarises results, the crowd and the openings', () => {
    const s = matchStats(games, tally);
    expect(s.played).toBe(3);
    expect(s.results).toEqual({ gukesh: 0, draw: 1, sindarov: 2 });
    expect(s.crowdCalls).toBe(2); // game 3 is a tie at the top
    expect(s.crowdRight).toBe(1);
    expect(s.firstMoves).toEqual([{ move: '1.d4', count: 2 }, { move: '1.e4', count: 1 }]);
    expect(s.openings[0]).toEqual({ name: 'Catalan', count: 2 });
    expect(s.avgMoves).toBe(2);
    expect(s.me).toBeNull();
  });

  it('scores my record', () => {
    const s = matchStats(games, tally, [
      { game_id: 1, pick: 'draw' },
      { game_id: 2, pick: 'sindarov' },
      { game_id: 3, pick: 'gukesh' },
    ]);
    expect(s.me).toEqual({ calls: 3, correct: 2, points: 3 });
  });
});
