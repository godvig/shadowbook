// Your games against your book (Phase 6). Pure: games in, three lists out.
//  - "You forgot your move": the first point in a game where your book had a move and you played another.
//  - "No move ready": the first point where the opponent played a move your book has no answer to.
//  - "Habits that cost you": a move you have played at least 3 times in the same position, that scores clearly
//    worse than your other moves there or clearly below 50%. In the book or not. Weak by evaluation is added by
//    the page from Lichess's cloud evaluation (evalDrop below), since that needs the network.
import { Chess } from 'chess.js';
import { fenKey, playUci, START_FEN } from '../../lib/chess';
import type { Game } from '../../lib/types';
import { ownMoveIndex } from './deck';
import type { Color, Deck, Edge } from './types';

export const HABIT = {
  /** Played at least this often in the same position. */
  games: 3,
  /** At least this far below your score with other moves there, which need this many games. */
  gap: 0.2,
  othersGames: 6,
  /** Or at most this score over at least this many games. */
  low: 0.4,
  lowGames: 8,
  /** Weak by evaluation: the move loses at least this many pawns against the best move. */
  drop: 0.7,
};

const userColor = (g: Game, username: string): Color | null => {
  const u = username.trim().toLowerCase();
  return g.white.toLowerCase() === u ? 'w' : g.black.toLowerCase() === u ? 'b' : null;
};
const pointsFor = (g: Game, c: Color): number | null =>
  g.result === '1/2-1/2' ? 0.5 : g.result === '1-0' ? Number(c === 'w') : g.result === '0-1' ? Number(c === 'b') : null;

/** One position from your games, grouped over all the games that reached it. */
interface Spot {
  color: Color;
  key: string;
  /** Full FEN, for the small board and the engine. */
  fen: string;
  /** UCI from the start to the position, from the latest game that reached it. */
  path: string[];
  games: number;
  /** Your points in those games. */
  points: number;
  /** Unix ms of the latest game. */
  last: number;
}

export interface LeftBook extends Spot {
  kind: 'forgot' | 'noAnswer';
  /** The move played there, most often first: yours for "forgot", theirs for "no move ready". */
  played: { uci: string; san: string; games: number }[];
  /** "forgot": your book moves in the position. */
  book: string[];
}

export interface Habit extends Spot {
  uci: string;
  san: string;
  /** FEN after the move, for the engine. */
  after: string;
  /** Your score with this move, and with your other moves in the position (when there are enough games). */
  score: number;
  others?: { games: number; score: number };
  /** Your book moves in the position, if any. */
  book: string[];
  /** Why it is weak by results, if it is. */
  weak: ('others' | 'low')[];
  /** Points lost: games × (score with other moves, or 50%, minus score with this move). */
  cost: number;
}

export interface Insights {
  forgot: LeftBook[];
  noAnswer: LeftBook[];
  /** Every repeated move; the weak ones have `weak` set. The page adds weakness by evaluation. */
  repeated: Habit[];
  /** Games used: of the user, finished, from the normal start. */
  games: number;
}

export function analyse(games: Game[], username: string, decks: Deck[], edges: Edge[]): Insights {
  const index = ownMoveIndex(decks, edges);
  const has = { w: decks.some((d) => d.color === 'w'), b: decks.some((d) => d.color === 'b') };
  const left = new Map<string, LeftBook & { byMove: Map<string, { san: string; games: number }> }>();
  const moves = new Map<string, { spot: Spot; byMove: Map<string, { san: string; after: string; games: number; points: number; last: number; path: string[] }> }>();
  let used = 0;

  const note = (kind: LeftBook['kind'], color: Color, fen: string, path: string[], uci: string, san: string, points: number, end: number, book: string[]) => {
    const key = fenKey(fen);
    const id = `${kind}|${color}|${key}`;
    const row = left.get(id) ?? { kind, color, key, fen, path, games: 0, points: 0, last: 0, played: [], book, byMove: new Map() };
    row.games++;
    row.points += points;
    if (end >= row.last) Object.assign(row, { last: end, path, fen });
    const m = row.byMove.get(uci) ?? { san, games: 0 };
    m.games++;
    row.byMove.set(uci, m);
    left.set(id, row);
  };

  for (const g of games) {
    const color = userColor(g, username);
    const points = color && pointsFor(g, color);
    if (!color || points === null || points === undefined) continue;
    used++;
    const chess = new Chess(START_FEN);
    const path: string[] = [];
    // Inside the book until the first point where it is left.
    let inBook = has[color];
    if (inBook && color === 'w' && !index.ownMoves('w', fenKey(chess.fen())).length) inBook = false;
    const seenHere = new Set<string>();
    for (const uci of g.ucis) {
      const fen = chess.fen();
      const key = fenKey(fen);
      const mover = chess.turn() as Color;
      let san: string;
      try {
        san = playUci(chess, uci).san;
      } catch {
        break;
      }
      const at = [...path];
      path.push(uci);
      if (mover === color) {
        // Every move of yours counts towards habits, in the book or not; a position once per game.
        if (!seenHere.has(key)) {
          seenHere.add(key);
          const spot = moves.get(`${color}|${key}`) ?? { spot: { color, key, fen, path: at, games: 0, points: 0, last: 0 }, byMove: new Map() };
          spot.spot.games++;
          spot.spot.points += points;
          spot.spot.last = Math.max(spot.spot.last, g.end);
          const m = spot.byMove.get(uci) ?? { san, after: chess.fen(), games: 0, points: 0, last: 0, path: at };
          m.games++;
          m.points += points;
          if (g.end >= m.last) Object.assign(m, { last: g.end, path: at });
          spot.byMove.set(uci, m);
          moves.set(`${color}|${key}`, spot);
        }
        if (inBook) {
          const book = index.ownMoves(color, key);
          if (book.length && !book.includes(uci)) {
            note('forgot', color, fen, at, uci, san, points, g.end, book);
            inBook = false;
          }
        }
      } else if (inBook && !index.ownMoves(color, fenKey(chess.fen())).length) {
        note('noAnswer', color, fen, at, uci, san, points, g.end, []);
        inBook = false;
      }
    }
  }

  const finish = (rows: (LeftBook & { byMove: Map<string, { san: string; games: number }> })[]): LeftBook[] =>
    rows
      .map(({ byMove, ...r }) => ({ ...r, played: [...byMove].map(([uci, m]) => ({ uci, ...m })).sort((a, b) => b.games - a.games) }))
      .sort((a, b) => b.games - a.games || b.last - a.last);

  const repeated: Habit[] = [];
  for (const { spot, byMove } of moves.values()) {
    const book = index.ownMoves(spot.color, spot.key);
    for (const [uci, m] of byMove) {
      if (m.games < HABIT.games) continue;
      const og = spot.games - m.games;
      const op = spot.points - m.points;
      const score = m.points / m.games;
      const others = og >= HABIT.othersGames ? { games: og, score: op / og } : undefined;
      const weak: Habit['weak'] = [];
      if (others && score <= others.score - HABIT.gap) weak.push('others');
      if (m.games >= HABIT.lowGames && score <= HABIT.low) weak.push('low');
      repeated.push({
        ...spot,
        path: m.path,
        last: m.last,
        games: m.games,
        points: m.points,
        uci,
        san: m.san,
        after: m.after,
        score,
        others,
        book,
        weak,
        cost: m.games * ((others?.score ?? 0.5) - score),
      });
    }
  }
  repeated.sort((a, b) => b.cost - a.cost || b.games - a.games);

  const all = [...left.values()];
  return { forgot: finish(all.filter((r) => r.kind === 'forgot')), noAnswer: finish(all.filter((r) => r.kind === 'noAnswer')), repeated, games: used };
}

/**
 * How many pawns a move loses against the best move, from the mover's side: evaluation of the position before
 * (with the best move) minus the evaluation after the move. Mates count as 100 pawns.
 */
export function evalDrop(fenBefore: string, before: { cp?: number; mate?: number }, after: { cp?: number; mate?: number }): number {
  const pawns = (e: { cp?: number; mate?: number }) => (e.mate !== undefined ? Math.sign(e.mate) * 100 : (e.cp ?? 0) / 100);
  const side = fenBefore.split(' ')[1] === 'w' ? 1 : -1;
  return (pawns(before) - pawns(after)) * side;
}

/** The move to play instead: your book move, else the move you score best with there, else none known yet. */
export function betterMove(h: Habit, alternatives: { uci: string; score: number; games: number }[]): string | undefined {
  const book = h.book.find((m) => m !== h.uci);
  if (book) return book;
  return alternatives.filter((a) => a.uci !== h.uci && a.games >= HABIT.games && a.score > h.score).sort((a, b) => b.score - a.score)[0]?.uci;
}

/** "You have played 6.h3 here 14 times and scored 29%." */
export function habitText(h: Habit): string {
  const ply = h.path.length;
  const n = Math.floor(ply / 2) + 1;
  return `You have played ${n}${ply % 2 ? '…' : '.'}${h.san} here ${h.games} times and scored ${Math.round(100 * h.score)}%.`;
}
