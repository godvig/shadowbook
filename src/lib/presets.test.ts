import { afterEach, describe, expect, it, vi } from 'vitest';
import { Chess } from 'chess.js';
import { dedupe, gamesFromEvent, isClassical, isPlayer, presetFile, secondsFor60, type PresetPlayer } from '../../scripts/presets-lib.mjs';
import { bookMoves, buildBook, BOOK_PLIES } from './book';
import { sansToUcis } from './chess';
import { bookExit, loadPreset, matchGamesFor, presetOpponent, PRESET_BOOK_PLIES, type MatchGame, type PresetFile } from './presets';
import type { Game } from './types';

const gukesh: PresetPlayer = { name: 'Gukesh D', display: 'Gukesh', fideId: 46616543, surname: 'gukesh', given: ['d', 'dommaraju'] };
const sindarov: PresetPlayer = { name: 'Javokhir Sindarov', display: 'Sindarov', fideId: 14205483, surname: 'sindarov', given: ['javokhir', 'j'] };

function pgn(h: Record<string, string>, moves = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *') {
  const headers = { Event: 'Test Masters', Date: '2026.01.20', Result: '*', ...h };
  return Object.entries(headers).map(([k, v]) => `[${k} "${v}"]`).join('\n') + `\n\n${moves}\n`;
}

describe('isPlayer', () => {
  it('matches the usual spellings of a name', () => {
    for (const n of ['Gukesh D', 'Gukesh, D', 'Dommaraju Gukesh', 'D. Gukesh', 'GUKESH D.']) expect(isPlayer(gukesh, n)).toBe(true);
    for (const n of ['Sindarov, Javokhir', 'Javokhir Sindarov', 'Sindarov J', 'Sindarov']) expect(isPlayer(sindarov, n)).toBe(true);
  });

  it('rejects other players that share a name part', () => {
    expect(isPlayer(gukesh, 'Gukesh Kumar')).toBe(false);
    expect(isPlayer(sindarov, 'Sindarova, Gulrukhbegim')).toBe(false);
    expect(isPlayer(gukesh, 'Praggnanandhaa R')).toBe(false);
  });

  it('trusts a FIDE id over the name', () => {
    expect(isPlayer(gukesh, 'Some Alias', '46616543')).toBe(true);
    expect(isPlayer(gukesh, 'Gukesh D', '12345')).toBe(false);
    expect(isPlayer(gukesh, 'Gukesh D', '0')).toBe(true);
  });
});

describe('classical filter', () => {
  it('reads PGN time controls', () => {
    expect(secondsFor60('5400+30')).toBe(7200);
    expect(secondsFor60('40/7200:1800+30')).toBe(9600);
    expect(secondsFor60('1500+10')).toBe(2100);
    expect(secondsFor60('-')).toBeNull();
    expect(secondsFor60('40/5400+30:1800_30"')).toBe(9000);
  });

  it('keeps classical games and drops rapid, blitz, Armageddon and tiebreaks', () => {
    expect(isClassical({ TimeControl: '40/7200:1800+30' })).toBe(true);
    expect(isClassical({ TimeControl: '1500+10' })).toBe(false);
    expect(isClassical({ TimeControl: '180+2' })).toBe(false);
    expect(isClassical({ Event: 'Norway Chess 2026 | Armageddon' })).toBe(false);
    expect(isClassical({ Round: '2.3 Tiebreaks' }, 'FIDE World Cup 2025 | Round 2')).toBe(false);
    expect(isClassical({}, 'Some Rapid & Blitz')).toBe(false);
    expect(isClassical({}, 'Tata Steel Chess 2026 | Masters')).toBe(true);
    expect(isClassical({ TimeControl: '5400+30', Variant: 'Chess960' })).toBe(false);
  });
});

describe('gamesFromEvent', () => {
  const event = { id: 'abcd1234', name: 'Test Masters' };
  const text = [
    pgn({ White: 'Gukesh D', Black: 'Firouzja, Alireza', TimeControl: '5400+30', Result: '1-0', WhiteElo: '2780', GameURL: 'https://lichess.org/broadcast/x/y/g1' }, '1. e4 e5 2. Nf3 Nc6 1-0'),
    pgn({ White: 'Caruana, Fabiano', Black: 'Gukesh, D', WhiteFideId: '2020009', BlackFideId: '46616543', TimeControl: '5400+30' }, '1. d4 Nf6 2. c4 e6 *'),
    pgn({ White: 'Gukesh D', Black: 'Nakamura, Hikaru', TimeControl: '1500+10' }),
    pgn({ White: 'Carlsen, Magnus', Black: 'Nakamura, Hikaru', TimeControl: '5400+30' }),
  ].join('\n');

  it('keeps only the player’s classical games and normalises their name', () => {
    const games = gamesFromEvent(text, gukesh, event);
    expect(games).toHaveLength(2);
    expect(games[0]).toMatchObject({ id: 'https://lichess.org/broadcast/x/y/g1', white: 'Gukesh D', black: 'Firouzja, Alireza', result: '1-0', whiteElo: 2780, timeClass: 'classical', ucis: ['e2e4', 'e7e5', 'g1f3', 'b8c6'] });
    expect(games[1]).toMatchObject({ white: 'Caruana, Fabiano', black: 'Gukesh D', ucis: ['d2d4', 'g8f6', 'c2c4', 'e7e6'] });
  });

  it('drops an Armageddon relayed in the same round as the classical game', () => {
    const round = { BroadcastURL: 'https://lichess.org/broadcast/norway/round-1/abc', White: 'Gukesh D', Black: 'Carlsen, Magnus' };
    const norway = [pgn({ ...round, Round: '1.1', Result: '1/2-1/2' }), pgn({ ...round, Round: '2.1', Result: '0-1' }, '1. d4 d5 0-1')].join('\n');
    const games = gamesFromEvent(norway, gukesh, { id: 'norway00', name: 'Norway Chess 2026 | Open' });
    expect(games.map((g) => g.result)).toEqual(['1/2-1/2']);
  });

  it('dedupes the same game relayed twice', () => {
    const twice = [...gamesFromEvent(text, gukesh, event), ...gamesFromEvent(text, gukesh, { id: 'efgh5678', name: 'Relay' })];
    expect(twice).toHaveLength(4);
    expect(dedupe(twice)).toHaveLength(2);
  });

  it('writes a compact file with counts and sources', () => {
    const games = gamesFromEvent(text, gukesh, event);
    const file = presetFile(gukesh, games, [{ ...event, url: 'https://lichess.org/broadcast/test/abcd1234', date: '2026-01-20' }, { id: 'none0000', name: 'Empty', url: 'u', date: 'd' }], '2026-11-13T00:00:00.000Z');
    expect(file.meta).toMatchObject({ name: 'Gukesh D', fideId: 46616543, games: 2, asWhite: 1, asBlack: 1, generatedAt: '2026-11-13T00:00:00.000Z' });
    expect(file.meta.sources).toEqual([{ name: 'Test Masters', url: 'https://lichess.org/broadcast/test/abcd1234', date: '2026-01-20', games: 2 }]);
    expect(file.games[0]).not.toHaveProperty('source');
  });
});

// A shuffle of knights that never repeats a position too early: 32+ plies of legal moves.
const deep = 'Nf3 Nf6 Nc3 Nc6 e3 e6 d3 d6 Be2 Be7 O-O O-O a3 a6 b3 b6 Bb2 Bb7 Rb1 Rb8 h3 h6 g3 g6 Kh2 Kh7 Kg2 Kg7 Rh1 Rh8 Qd2 Qd7 Rbe1';

function file(): PresetFile {
  const mk = (white: string, black: string, sans: string, i: number): Game => ({ id: String(i), white, black, result: '1-0', timeClass: 'classical', end: i, whiteElo: 2750, ucis: sansToUcis(sans.split(' ')) });
  return {
    meta: { name: 'Gukesh D', display: 'Gukesh', fideId: 46616543, games: 3, asWhite: 2, asBlack: 1, sources: [], credit: '', generatedAt: '2026-11-13T00:00:00.000Z' },
    games: [mk('Gukesh D', 'A', deep, 1), mk('Gukesh D', 'B', 'e4 e5 Nf3 Nc6 Bb5 a6', 2), mk('C', 'Gukesh D', 'd4 Nf6 c4 e6', 3)],
  };
}

function fenAfter(sans: string[]) {
  const c = new Chess();
  sans.forEach((s) => c.move(s));
  return c.fen();
}

describe('presetOpponent', () => {
  it('builds a deeper book than for scouted players', () => {
    const o = presetOpponent('gukesh', file());
    const sans = deep.split(' ');
    const ply = 28; // beyond BOOK_PLIES (24), within PRESET_BOOK_PLIES (32)
    expect(ply).toBeGreaterThan(BOOK_PLIES);
    expect(ply).toBeLessThan(PRESET_BOOK_PLIES);
    expect(bookMoves(o.book, 'w', fenAfter(sans.slice(0, ply))).map((m) => m.uci)).toHaveLength(1);
    expect(bookMoves(buildBook(o.games, o.username), 'w', fenAfter(sans.slice(0, ply)))).toHaveLength(0);
    expect(o).toMatchObject({ site: 'preset', username: 'Gukesh D', bookPlies: PRESET_BOOK_PLIES, preset: { id: 'gukesh', matchGames: 0 } });
    expect(o.book.gamesAs).toEqual({ w: 2, b: 1 });
  });

  it('merges finished games of this match', () => {
    const match: MatchGame[] = [
      { id: 1, white: 'sindarov', black: 'gukesh', status: 'finished', result: '1/2-1/2', starts_at: '2026-11-24T14:00:00Z', pgn: '1. c4 e5 2. g3 Nf6 1/2-1/2' },
      { id: 2, white: 'gukesh', black: 'sindarov', status: 'live', result: null, starts_at: null, pgn: '1. e4' },
      { id: 3, white: 'gukesh', black: 'sindarov', status: 'scheduled', result: null, starts_at: null, pgn: '' },
    ];
    expect(matchGamesFor('gukesh', file().meta, match)).toEqual([
      { id: 'wcc2026:1', white: 'Sindarov', black: 'Gukesh D', result: '1/2-1/2', timeClass: 'classical', end: Date.parse('2026-11-24T14:00:00Z'), ucis: ['c2c4', 'e7e5', 'g2g3', 'g8f6'] },
    ]);
    const o = presetOpponent('gukesh', file(), match);
    expect(o.preset?.matchGames).toBe(1);
    expect(o.book.gamesAs.b).toBe(2);
  });
});

describe('bookExit', () => {
  const book = presetOpponent('gukesh', file()).book;

  it('is the first ply where the bot had no book move for the game', () => {
    // Gukesh (White) played 3.Bb5 here; a game with 3.Bc4 leaves his book at ply 4.
    expect(bookExit(book, 'w', sansToUcis('e4 e5 Nf3 Nc6 Bc4 Bc5'.split(' ')))).toBe(4);
    // Black's replies do not matter until White is to move in an unknown position.
    expect(bookExit(book, 'w', sansToUcis('e4 c5 Nf3 d6'.split(' ')))).toBe(2);
  });

  it('is capped', () => {
    expect(bookExit(book, 'w', sansToUcis(deep.split(' ')))).toBe(20);
    expect(bookExit(book, 'w', sansToUcis(deep.split(' ')), 8)).toBe(8);
  });
});

describe('loadPreset', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('fetches the JSON next to the app', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(file())));
    vi.stubGlobal('fetch', fetch);
    const o = await loadPreset('sindarov');
    expect(fetch).toHaveBeenCalledWith('/presets/sindarov.json');
    expect(o.games).toHaveLength(3);
  });
});
