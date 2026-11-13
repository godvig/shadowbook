import { describe, expect, it } from 'vitest';
import { finalist, gameNumber, hasMoves, matchGameFrom, parseBroadcastId, patchFromPgn, pgnHeaders, planSync, splitPgn, type DbGame } from '../../supabase/functions/match-api/broadcast';
import { clocksAt, sanMoves } from './match';

const game = (white: string, black: string, result: string, moves: string) => `[Event "FIDE World Championship 2026"]
[White "${white}"]
[Black "${black}"]
[Result "${result}"]
[ECO "D37"]
[Opening "Queen's Gambit Declined"]

${moves} ${result}`;

const round = [game('Gukesh, D.', 'Sindarov, Javokhir', '*', '1. d4 { [%clk 2:00:00] } Nf6 { [%clk 1:59:51] } 2. c4 { [%clk 1:59:40] }'), game('Commentator', 'Guest', '*', '1. e4 e5')].join('\n\n\n');

describe('broadcast sync helpers', () => {
  it('reads broadcast ids from links or bare ids', () => {
    expect(parseBroadcastId('https://lichess.org/broadcast/fide-candidates-2026/oe4JqS3R')).toBe('oe4JqS3R');
    expect(parseBroadcastId('oe4JqS3R')).toBe('oe4JqS3R');
    expect(parseBroadcastId('https://lichess.org/broadcast/fide-candidates-2026/round-13/abcdEFGH')).toBeNull();
    expect(parseBroadcastId('https://example.com/broadcast/x/oe4JqS3R')).toBeNull();
    expect(parseBroadcastId('not a link')).toBeNull();
  });

  it('maps round names to classical game numbers', () => {
    expect(gameNumber('Game 3')).toBe(3);
    expect(gameNumber('Round 14')).toBe(14);
    expect(gameNumber('Tiebreaks – Game 1')).toBeNull();
    expect(gameNumber('Rapid 2')).toBeNull();
    expect(gameNumber('Opening ceremony')).toBeNull();
  });

  it('finds the match game in a round and turns it into a patch', () => {
    expect(splitPgn(round)).toHaveLength(2);
    expect(finalist('Dommaraju Gukesh')).toBe('gukesh');
    const pgn = matchGameFrom(round)!;
    expect(pgnHeaders(pgn).White).toBe('Gukesh, D.');
    expect(hasMoves(pgn)).toBe(true);
    const p = patchFromPgn(pgn);
    expect(p).toMatchObject({ white: 'gukesh', black: 'sindarov', status: 'live', opening: "Queen's Gambit Declined" });
    expect(p.result).toBeUndefined();
    const done = patchFromPgn(game('Sindarov, Javokhir', 'Gukesh, D.', '1/2-1/2', '1. e4 e5'));
    expect(done).toMatchObject({ white: 'sindarov', black: 'gukesh', status: 'finished', result: '1/2-1/2' });
    expect(patchFromPgn(game('Gukesh, D.', 'Sindarov, Javokhir', '*', '')).status).toBeUndefined();
  });

  it('plans which rounds to fetch', () => {
    const now = Date.parse('2026-11-26T14:00:00Z');
    const db: DbGame[] = [
      { id: 1, status: 'finished', starts_at: '2026-11-24T13:00:00Z', pgn: 'x', result: '1/2-1/2' },
      { id: 2, status: 'scheduled', starts_at: null, pgn: '', result: null },
      { id: 3, status: 'scheduled', starts_at: null, pgn: '', result: null },
    ];
    const steps = planSync(
      [
        { id: 'r1', name: 'Game 1', startsAt: Date.parse('2026-11-24T13:00:00Z'), finishedAt: Date.parse('2026-11-24T18:00:00Z') },
        { id: 'r2', name: 'Game 2', startsAt: Date.parse('2026-11-26T13:00:00Z'), ongoing: true },
        { id: 'r3', name: 'Game 3', startsAt: Date.parse('2026-11-27T13:00:00Z') },
      ],
      db,
      now,
    );
    expect(steps).toEqual([
      { gameId: 2, roundId: 'r2', startsAt: '2026-11-26T13:00:00.000Z', fetchPgn: true },
      { gameId: 3, roundId: 'r3', startsAt: '2026-11-27T13:00:00.000Z', fetchPgn: false },
    ]);
  });
});

describe('broadcast PGNs in the client', () => {
  it('reads moves and clocks from a PGN with clock comments', () => {
    const pgn = matchGameFrom(round)!;
    expect(sanMoves(pgn)).toEqual(['d4', 'Nf6', 'c4']);
    expect(clocksAt(pgn, 3)).toEqual({ w: '1:59:40', b: '1:59:51' });
    expect(clocksAt(pgn, 1)).toEqual({ w: '2:00:00' });
    expect(clocksAt(pgn, 0)).toEqual({});
  });
});
