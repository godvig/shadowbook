// The review page of a match game: its address, the marks on its moves and where its opening ends.
import { Chess } from 'chess.js';
import { SPAR_START_CAP } from '../lib/presets';
import type { Color } from '../lib/types';
import { judge, onlyMove, type Mark } from '../eval/marks';
import type { GameMove } from '../eval/pgn';
import type { PosEval } from '../eval/types';

/** "#game/3" on a match page; the counter only ever sees the page's path. */
export function reviewIdFrom(hash: string): number | null {
  const m = hash.match(/^#game\/(\d{1,2})$/);
  return m ? Number(m[1]) : null;
}
export const reviewHash = (id: number) => `#game/${id}`;

const legalCount = (fen: string) => new Chess(fen).moves().length;

/**
 * The mark on each move (index = ply − 1). A glyph from the broadcast wins; otherwise "!" for an only move,
 * then ?! ? ?? from the change in winning chances. Moves without evaluations on both sides get none.
 */
export function marksFor(moves: GameMove[], evals: (PosEval | undefined)[], startFen: string): (Mark | undefined)[] {
  return moves.map((m, i) => {
    if (m.nag) return m.nag;
    const before = evals[i];
    const after = evals[i + 1];
    if (!before || !after) return undefined;
    const mover: Color = i % 2 === 0 ? 'w' : 'b';
    const fenBefore = i === 0 ? startFen : moves[i - 1].fen;
    if (onlyMove(mover, m.uci, before, legalCount(fenBefore))) return '!';
    return judge(mover, before, after) ?? undefined;
  });
}

/**
 * The opening of a game for "Train this opening": up to where the game left the bots' pre-match books
 * (whichever bot left first), at most SPAR_START_CAP plies, and ending on a move of the side that trains,
 * so the last thing to practise is your own move.
 */
export function openingLine(ucis: string[], exits: number[], side: Color): string[] {
  let n = Math.min(SPAR_START_CAP, ucis.length, ...exits);
  // Ply n is played by White when n is odd.
  while (n > 0 && (n % 2 === 1 ? 'w' : 'b') !== side) n--;
  return ucis.slice(0, n);
}

/** Moves up to and including `ply`, trimmed so a repertoire line ends on the chosen side's move. */
export function repertoireLine(ucis: string[], ply: number, side: Color): string[] {
  let n = Math.min(ply, ucis.length);
  while (n > 0 && (n % 2 === 1 ? 'w' : 'b') !== side) n--;
  return ucis.slice(0, n);
}

/** Points for the evaluation graph: White's share 0–1 per ply, null where there is no evaluation yet. */
export function graphPoints(evals: (PosEval | undefined)[], share: (e: PosEval) => number): (number | null)[] {
  return evals.map((e) => (e ? share(e) : null));
}
