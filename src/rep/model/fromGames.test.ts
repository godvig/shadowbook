import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { fenKey, sansToUcis } from '../../lib/chess';
import type { Game, Result, TimeClass } from '../../lib/types';
import { gradeCard, Rating } from './cards';
import { makeMain, START_KEY } from './deck';
import { buildDecks, commitBuild, gamesInWindow, pickGames, planBuild } from './fromGames';
import type { OpeningMap } from './openings';
import type { Color, LibraryData } from './types';

// Synthetic games: "Me" against made-up opponents.
const now = new Date('2026-11-16T12:00:00Z');
let n = 0;
const game = (color: Color, line: string, result: Result = '1/2-1/2', extra: Partial<Game> = {}): Game => ({
  id: `g${n++}`,
  white: color === 'w' ? 'Me' : `Opp${n}`,
  black: color === 'b' ? 'Me' : `Opp${n}`,
  result,
  timeClass: 'blitz',
  end: now.getTime() - 86_400_000,
  ucis: sansToUcis(line.split(' ')),
  ...extra,
});
const times = (k: number, color: Color, line: string, result?: Result) => Array.from({ length: k }, () => game(color, line, result));
const keyAfter = (line: string) => {
  const c = new Chess();
  for (const s of line.split(' ')) c.move(s);
  return fenKey(c.fen());
};
const empty: LibraryData = { decks: [], edges: [], cards: [] };
const build = (games: Game[], color: Color, openings: OpeningMap = {}) => buildDecks(games, { username: 'me', color, openings });
const sans = (edges: { from: string; san: string; rank: number }[], from: string) => edges.filter((e) => e.from === from).map((e) => [e.san, e.rank]);

describe('building decks from games', () => {
  it('makes the most played move the main move; alternatives need 20% and 3 games', () => {
    const [deck] = build([...times(5, 'w', 'e4 e5'), ...times(3, 'w', 'd4 d5'), ...times(2, 'w', 'c4 e5')], 'w');
    // c4 has 20% but only 2 games.
    expect(sans(deck.edges, START_KEY)).toEqual([['e4', 0], ['d4', 1]]);
    expect(deck.stats.get(`${START_KEY}|e2e4`)).toEqual({ games: 5, points: 2.5 });
  });

  it('breaks a tie between two moves by score', () => {
    const [deck] = build([...times(3, 'w', 'd4 d5', '0-1'), ...times(3, 'w', 'e4 e5', '1-0')], 'w');
    expect(sans(deck.edges, START_KEY)).toEqual([['e4', 0], ['d4', 1]]);
  });

  it('keeps at most four opponent replies, each with 5% and 3 games', () => {
    const lines: [number, string][] = [[20, 'c5'], [15, 'e5'], [10, 'e6'], [6, 'c6'], [4, 'd5'], [3, 'Nf6'], [3, 'g6'], [2, 'd6']];
    const [deck] = build(lines.flatMap(([k, reply]) => times(k, 'w', `e4 ${reply} Nf3`)), 'w');
    // 63 games: d5 passes but is the fifth; Nf6 and g6 have 3 games but under 5%; d6 has 2.
    expect(sans(deck.edges, keyAfter('e4'))).toEqual([['c5', 0], ['e5', 1], ['e6', 2], ['c6', 3]]);
    // As Black the first move is the opponent's: 2 games of 1.d4 are 10% but too few.
    const [black] = build([...times(18, 'b', 'e4 c5'), ...times(2, 'b', 'd4 d5')], 'b');
    expect(sans(black.edges, START_KEY)).toEqual([['e4', 0]]);
  });

  it('stops at ten full moves and where fewer than three games reach', () => {
    const long = 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4 exd4 cxd4 Bb4+ Bd2 Bxd2+ Nbxd2 d5 exd5 Nxd5 Qb3 Nce7 O-O O-O Rfe1 c6';
    const [deck] = build(times(3, 'w', long), 'w');
    // Plies 0–18: the tenth own move (10.Qb3) is the last; Black's 10th reply would have no answer.
    expect(deck.edges).toHaveLength(19);
    expect(deck.edges.at(-1)?.san).toBe('Qb3');
    expect(build(times(2, 'w', long), 'w')).toEqual([]);
  });

  it('counts a position reached by two move orders once, with the games of both', () => {
    const [deck] = build([...times(3, 'w', 'd4 Nf6 c4 e6 Nc3'), ...times(3, 'w', 'c4 e6 d4 Nf6 Nc3')], 'w');
    const nc3 = deck.edges.filter((e) => e.san === 'Nc3');
    expect(nc3).toHaveLength(1);
    expect(deck.stats.get(`${nc3[0].from}|${nc3[0].uci}`)?.games).toBe(6);
    // Both move orders are in the deck.
    expect(deck.edges.filter((e) => e.to === nc3[0].from)).toHaveLength(2);
  });

  it('uses only the games where the user had that colour, whatever the case of the username', () => {
    const games = [...times(3, 'w', 'e4 e5'), ...times(4, 'b', 'd4 d5'), game('w', 'c4 c5', '*')].map((g) => ({ ...g, white: g.white.toUpperCase() }));
    const [white] = build(games, 'w');
    expect(white.games).toBe(3);
    expect(white.edges.map((e) => e.san)).toEqual(['e4', 'e5']);
    expect(build(games, 'b')[0].edges.map((e) => e.san)).toEqual(['d4', 'd5']);
  });

  const openings: OpeningMap = {
    [keyAfter('e4 c5')]: ['B20', 'Sicilian Defense'],
    [keyAfter('e4 c5 Nf3 d6')]: ['B50', 'Sicilian Defense: Modern Variations'],
    [keyAfter('e4 e5')]: ['C20', "King's Pawn Game"],
    [keyAfter('d4')]: ['A40', "Queen's Pawn Game"],
    [keyAfter('d4 e5')]: ['A40', 'Englund Gambit'],
    [keyAfter('d4 d5 Nc3 Nf6 Bf4')]: ['D00', 'Rapport-Jobava System, with e6'],
    [keyAfter('d4 e6 e4')]: ['C00', 'French Defense'],
  };

  it('groups by opening family: 10 games and 5% of the colour, the rest in "Other lines"', () => {
    const games = [...times(12, 'b', 'e4 c5 Nf3 d6'), ...times(4, 'b', 'e4 e5 Nf3 Nc6'), ...times(20, 'b', 'c4 e5 Nc3 Nf6')];
    // Other lines hold 24 of 36 games, but four King's Pawn games are too few for a deck of their own.
    expect(build(games, 'b', openings).map((d) => [d.name, d.opening, d.games])).toEqual([
      ['Sicilian Defense', 'Sicilian Defense', 12],
      ['Other lines as Black', '', 24],
    ]);
    // Ten Sicilian games out of 210 are under 5%, and stay in Other lines while it is small enough.
    const diluted = [...times(10, 'b', 'e4 c5 Nf3 d6'), ...times(200, 'b', 'e4 e5 Nf3 Nc6')];
    expect(build(diluted, 'b', openings).map((d) => d.name)).toEqual(["King's Pawn Game", 'Other lines as Black']);
  });

  it('gives the biggest families in a large "Other lines" their own deck, down to 5 games', () => {
    const games = [...times(12, 'b', 'e4 c5 Nf3 d6'), ...times(9, 'b', 'e4 e5 Nf3 Nc6'), ...times(4, 'b', 'c4 e5 Nc3 Nf6')];
    // Other lines would hold 13 of 25 games; the King's Pawn games move out and leave 4 (16%).
    expect(build(games, 'b', openings).map((d) => [d.name, d.games])).toEqual([
      ['Sicilian Defense', 12],
      ["King's Pawn Game", 9],
      ['Other lines as Black', 4],
    ]);
  });

  it("names a deck from the user's side: their own system, or vs the opponent's defence", () => {
    const games = [...times(12, 'w', 'd4 e5 dxe5 Nc6'), ...times(13, 'w', 'd4 d5 Bf4 Nf6'), ...times(11, 'w', 'd4 d5 Nc3 Nf6 Bf4 e6'), ...times(10, 'w', 'd4 e6 e4 d5')];
    expect(build(games, 'w', openings).map((d) => [d.name, d.opening])).toEqual([
      ["Queen's Pawn Game", "Queen's Pawn Game"],
      ['vs Englund Gambit', 'Englund Gambit'],
      ['Rapport-Jobava System', 'Rapport-Jobava System'],
      // White's 2.e4 enters the French, but a defence is Black's opening.
      ['vs French Defense', 'French Defense'],
    ]);
    // The same family from Black's side is the user's own.
    expect(build(times(12, 'b', 'e4 e6 d4 d5'), 'b', { [keyAfter('e4 e6')]: ['C00', 'French Defense'] })[0].name).toBe('French Defense');
  });

  it('gives nothing for no games or too few', () => {
    expect(build([], 'w')).toEqual([]);
    expect(build(times(2, 'w', 'e4 e5'), 'w')).toEqual([]);
  });

  it('reads the newest games of the chosen time classes inside the window', () => {
    const at = (months: number, timeClass: TimeClass) => game('w', 'e4 e5', '1-0', { timeClass, end: new Date(now).setMonth(now.getMonth() - months) });
    const old = at(40, 'blitz');
    const games = [at(3, 'blitz'), at(1, 'bullet'), at(2, 'bullet'), old, { ...at(1, 'blitz'), white: 'Someone' }];
    const w = gamesInWindow(games, 'me', 36, now);
    expect(w.counts).toEqual([['bullet', 2], ['blitz', 1]]);
    expect(w.games).not.toContain(old);
    expect(pickGames(w.games, ['bullet', 'blitz'], 2).map((g) => g.timeClass)).toEqual(['bullet', 'bullet']);
    expect(pickGames(w.games, ['blitz'])).toHaveLength(1);
  });
});

describe('building again', () => {
  const src = { site: 'chesscom' as const, username: 'Me' };
  const first = () => {
    const built = build([...times(6, 'w', 'e4 e5 Nf3 Nc6'), ...times(4, 'w', 'e4 e5 Bc4 Nc6')], 'w');
    return commitBuild(empty, planBuild(empty, built, src, now), now).lib;
  };

  it('updates the same deck, never changes the main move, and says what you play more often now', () => {
    const lib = first();
    const e4 = lib.cards.find((c) => c.id === `w|${START_KEY}|e2e4`)!;
    const graded = gradeCard(e4, Rating.Good, { deckId: lib.decks[0].id, mode: 'lines', retention: 0.9 }, now).card;
    const before = { ...lib, cards: lib.cards.map((c) => (c.id === graded.id ? graded : c)) };

    const again = build([...times(3, 'w', 'e4 e5 Nf3 Nc6'), ...times(8, 'w', 'e4 e5 Bc4 Nc6'), ...times(3, 'w', 'e4 e5 Nc3 Nc6')], 'w');
    const [plan] = planBuild(before, again, { ...src, username: 'me' }, new Date('2026-12-01T12:00:00Z'));
    expect(plan).toMatchObject({ isNew: false, added: 2 });
    expect(plan.deck.id).toBe(before.decks[0].id);
    const afterE5 = keyAfter('e4 e5');
    expect(sans(plan.edges, afterE5)).toEqual([['Nf3', 0], ['Bc4', 1], ['Nc3', 2]]);
    expect(plan.mainDiffers).toEqual([{ from: afterE5, line: '1.e4 e5 2.Nf3', ours: { uci: 'g1f3', san: '2.Nf3' }, theirs: { uci: 'f1c4', san: '2.Bc4' } }]);

    const saved = commitBuild(before, [{ ...plan, edges: makeMain(plan.edges, afterE5, 'f1c4') }], now);
    expect(saved.lib.decks).toHaveLength(1);
    expect(saved.lib.cards.find((c) => c.id === graded.id)).toEqual(graded);
    expect(saved.write.cards.map((c) => c.id)).toEqual([`w|${afterE5}|f1c4`]);
    expect(saved.write.deleteCards).toEqual([`w|${afterE5}|g1f3`]);
  });

  it('building the same games twice adds nothing', () => {
    const lib = first();
    const built = build([...times(6, 'w', 'e4 e5 Nf3 Nc6'), ...times(4, 'w', 'e4 e5 Bc4 Nc6')], 'w');
    const [plan] = planBuild(lib, built, src, now);
    expect(plan).toMatchObject({ isNew: false, added: 0, mainDiffers: [] });
    expect(commitBuild(lib, [plan], now).lib.edges).toHaveLength(lib.edges.length);
  });
});
