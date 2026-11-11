import { bookMoves, type PlayerBook } from './book';
import { loadMaia } from './maia';
import type { Color } from './types';

export type BotMove =
  | { uci: string; source: 'book'; n: number; total: number }
  | { uci: string; source: 'maia'; probability: number };

/** Picks an item with probability proportional to its weight. `rand` is injectable for tests. */
export function weightedPick<T>(items: T[], weight: (t: T) => number, rand = Math.random): T {
  const total = items.reduce((s, t) => s + weight(t), 0);
  let r = rand() * total;
  for (const t of items) {
    r -= weight(t);
    if (r <= 0) return t;
  }
  return items[items.length - 1];
}

/** A book move, chosen as often as the player chose it in their own games. */
export function pickBookMove(book: PlayerBook, color: Color, fen: string, rand = Math.random): BotMove | null {
  const moves = bookMoves(book, color, fen);
  if (!moves.length) return null;
  const total = moves.reduce((s, m) => s + m.stat.n, 0);
  const pick = weightedPick(moves, (m) => m.stat.n, rand);
  return { uci: pick.uci, source: 'book', n: pick.stat.n, total };
}

export interface BotContext {
  fen: string;
  /** All moves so far in UCI, from the start position (Maia uses recent history). */
  history: string[];
  color: Color;
  book: PlayerBook | null;
  useBook: boolean;
  elo: number;
  opponentElo: number;
}

export async function chooseMove(ctx: BotContext): Promise<BotMove> {
  if (ctx.useBook && ctx.book) {
    const fromBook = pickBookMove(ctx.book, ctx.color, ctx.fen);
    if (fromBook) return fromBook;
  }
  const maia = await loadMaia();
  // Sampling from the policy (temperature 1) is what makes Maia play like a person,
  // including the occasional human inaccuracy, instead of always the most likely move.
  const result = await maia.predict({
    fen: ctx.fen,
    priorMoves: ctx.history,
    selfElo: ctx.elo,
    oppoElo: ctx.opponentElo,
    temperature: 1,
    topP: 0.95,
    topK: 1,
  });
  return { uci: result.bestMove, source: 'maia', probability: result.moves.get(result.bestMove) ?? 0 };
}
