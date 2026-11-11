import { Chess } from 'chess.js';
import { fenKey, playUci, START_FEN } from './chess';
import type { Color, Game, TimeClass } from './types';

/** How often the player chose a move in a position, and how they scored afterwards. */
export interface BookMove {
  n: number;
  /** Sum of the player's results (1 / 0.5 / 0) over finished games. */
  points: number;
  scored: number;
}

/** fenKey -> uci -> stats, for positions where the player was to move. */
export type BookSide = Record<string, Record<string, BookMove>>;

export interface PlayerBook {
  username: string;
  games: number;
  gamesAs: Record<Color, number>;
  /** Most recent rating per time class. */
  ratings: Partial<Record<TimeClass, number>>;
  moves: Record<Color, BookSide>;
  /** Most played opening sequences (first plies) per colour. */
  lines: Record<Color, LineStat[]>;
}

export interface LineStat {
  ucis: string[];
  n: number;
  points: number;
  scored: number;
}

export const BOOK_PLIES = 24;
const LINE_PLIES = 8;

function playerColor(g: Game, username: string): Color | null {
  const u = username.toLowerCase();
  if (g.white.toLowerCase() === u) return 'w';
  if (g.black.toLowerCase() === u) return 'b';
  return null;
}

function pointsFor(g: Game, c: Color): number | null {
  if (g.result === '*') return null;
  if (g.result === '1/2-1/2') return 0.5;
  return (g.result === '1-0') === (c === 'w') ? 1 : 0;
}

export function buildBook(games: Game[], username: string, timeClasses?: TimeClass[]): PlayerBook {
  const book: PlayerBook = {
    username,
    games: 0,
    gamesAs: { w: 0, b: 0 },
    ratings: {},
    moves: { w: {}, b: {} },
    lines: { w: [], b: [] },
  };
  const lineMap: Record<Color, Map<string, LineStat>> = { w: new Map(), b: new Map() };
  const sorted = [...games].sort((a, b) => a.end - b.end);

  for (const g of sorted) {
    const color = playerColor(g, username);
    if (!color) continue;
    const rating = color === 'w' ? g.whiteElo : g.blackElo;
    if (rating && g.timeClass !== 'unknown') book.ratings[g.timeClass] = rating;
    if (timeClasses && !timeClasses.includes(g.timeClass)) continue;

    book.games++;
    book.gamesAs[color]++;
    const pts = pointsFor(g, color);
    const chess = new Chess();
    const plies = Math.min(g.ucis.length, BOOK_PLIES);
    for (let i = 0; i < plies; i++) {
      const before = chess.fen();
      const uci = g.ucis[i];
      if (chess.turn() === color) {
        const side = (book.moves[color][fenKey(before)] ||= {});
        const e = (side[uci] ||= { n: 0, points: 0, scored: 0 });
        e.n++;
        if (pts !== null) {
          e.points += pts;
          e.scored++;
        }
      }
      try {
        playUci(chess, uci);
      } catch {
        break;
      }
    }
    if (g.ucis.length >= LINE_PLIES) {
      const key = g.ucis.slice(0, LINE_PLIES).join(' ');
      const l = lineMap[color].get(key) ?? { ucis: g.ucis.slice(0, LINE_PLIES), n: 0, points: 0, scored: 0 };
      l.n++;
      if (pts !== null) {
        l.points += pts;
        l.scored++;
      }
      lineMap[color].set(key, l);
    }
  }
  for (const c of ['w', 'b'] as Color[]) {
    book.lines[c] = [...lineMap[c].values()].filter((l) => l.n > 1).sort((a, b) => b.n - a.n).slice(0, 6);
  }
  return book;
}

/** The player's moves in a position, most played first. */
export function bookMoves(book: PlayerBook, color: Color, fen: string): { uci: string; stat: BookMove }[] {
  const side = book.moves[color][fenKey(fen)];
  if (!side) return [];
  return Object.entries(side)
    .map(([uci, stat]) => ({ uci, stat }))
    .sort((a, b) => b.stat.n - a.stat.n);
}

/** Share of each first-move choice, e.g. how often they open 1.e4, or answer 1.e4 with 1…c5. */
export function choiceShares(book: PlayerBook, color: Color, fen = START_FEN) {
  const moves = bookMoves(book, color, fen);
  const total = moves.reduce((s, m) => s + m.stat.n, 0);
  return moves.map((m) => ({ ...m, share: total ? m.stat.n / total : 0, total }));
}

export function scorePct(s: { points: number; scored: number }): number | null {
  return s.scored ? Math.round((100 * s.points) / s.scored) : null;
}
