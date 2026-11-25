// Reading Stockfish's UCI output. Shared by the browser worker (stockfish.ts) and scripts/build-evals.mjs,
// which imports this file directly (Node strips the types), so it imports types only.
import type { Score } from './types';

/** One `info` line: depth, which line (multipv), score from the side to move, and the first move of the line. */
export function parseInfo(line: string): { depth: number; multipv: number; score: Score; move?: string } | null {
  if (!line.startsWith('info ') || !line.includes(' score ') || line.includes(' lowerbound') || line.includes(' upperbound')) return null;
  const depth = Number(line.match(/ depth (\d+)/)?.[1]);
  const multipv = Number(line.match(/ multipv (\d+)/)?.[1] ?? 1);
  const s = line.match(/ score (cp|mate) (-?\d+)/);
  if (!depth || !s) return null;
  const n = Number(s[2]);
  return { depth, multipv, score: s[1] === 'cp' ? { cp: n } : { mate: n }, move: line.match(/ pv (\S+)/)?.[1] };
}

/** Stockfish scores from the side to move; the app keeps every score from White's side. */
export function whitePov(s: Score, fen: string): Score {
  if (fen.split(' ')[1] === 'w') return s;
  return s.mate !== undefined ? { mate: -s.mate } : { cp: -(s.cp ?? 0) };
}
