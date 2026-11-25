// public/evals/game-N.json: evaluations prepared ahead of time by scripts/build-evals.mjs and read first by
// analyse.ts. Imported by that script directly (Node strips the types), so it imports types only.
import type { PosEval, Score } from './types';

export interface EvalFileEntry extends Score {
  best: string;
  second?: Score;
  depth: number;
}

export interface EvalFile {
  game: number;
  /** e.g. "Stockfish 19 (stockfish.js, single-threaded)". */
  engine: string;
  depth: number;
  generated: string;
  /** Keyed by the FEN without move counters, as lib/chess.ts fenKey makes it. */
  positions: Record<string, EvalFileEntry>;
}

/** The same key as lib/chess.ts fenKey, written out here so the script needs nothing else. */
export const positionKey = (fen: string) => fen.split(' ').slice(0, 4).join(' ');

export function toEvalFile(meta: Omit<EvalFile, 'positions'>, results: { fen: string; eval: EvalFileEntry }[]): EvalFile {
  const positions: Record<string, EvalFileEntry> = {};
  for (const r of results) {
    const { cp, mate, best, second, depth } = r.eval;
    positions[positionKey(r.fen)] = { ...(mate !== undefined ? { mate } : { cp }), best, ...(second ? { second } : {}), depth };
  }
  return { ...meta, positions };
}

/** The file's positions as evaluations the review page uses. */
export function readEvalFile(j: Partial<EvalFile>): Map<string, PosEval> {
  return new Map(Object.entries(j.positions ?? {}).map(([k, v]) => [k, { ...v, source: 'file' as const }]));
}
