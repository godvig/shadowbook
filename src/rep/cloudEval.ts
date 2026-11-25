// Stockfish's best move from Lichess's cloud evaluation (eval/cloud.ts): evaluations Lichess has already computed
// and stored, so no engine runs here. Only the position (FEN) is sent; each answer is kept for 30 days in the
// Library's cache.
import { fenKey } from '../lib/chess';
import { fetchCloud, normalUci } from '../eval/cloud';

export { normalUci };

export interface Eval {
  /** The best move, in normal UCI (castling as e1g1, not Lichess's e1h1). */
  best: string;
  /** Centipawns from White's side, or mate in N (negative: Black mates). */
  cp?: number;
  mate?: number;
  depth: number;
}

interface Cache {
  get(key: string): Promise<{ at: number; value: Eval | null } | undefined>;
  put(key: string, value: { at: number; value: Eval | null }): Promise<void>;
}

const DAY = 86_400_000;
export const KEEP_DAYS = 30;

/**
 * The best move in a position, or null when Lichess has no evaluation for it (it only stores positions that have
 * been analysed). Throws only for network problems, which are not cached.
 */
export async function cloudEval(fen: string, opts: { fetcher?: typeof fetch; cache?: Cache; now?: number; signal?: AbortSignal } = {}): Promise<Eval | null> {
  const now = opts.now ?? Date.now();
  const key = `eval:${fenKey(fen)}`;
  const hit = await opts.cache?.get(key).catch(() => undefined);
  if (hit && now - hit.at < KEEP_DAYS * DAY) return hit.value;
  // Through the shared Lichess queue (eval/lichess.ts): one request at a time, a minute's pause after a 429.
  const answer = await fetchCloud(fen, { fetcher: opts.fetcher, signal: opts.signal });
  // Busy (429) or another error: say nothing now, and ask again next time.
  if (answer === undefined) return null;
  const value: Eval | null = answer && { best: answer.best, ...(answer.mate !== undefined ? { mate: answer.mate } : { cp: answer.cp }), depth: answer.depth };
  await opts.cache?.put(key, { at: now, value }).catch(() => undefined);
  return value;
}

/** "+0.4", "−1.2" or "#3", from the side to move's point of view. */
export function evalText(e: Eval, fen: string): string {
  const sign = fen.split(' ')[1] === 'w' ? 1 : -1;
  if (e.mate !== undefined) return `#${e.mate * sign}`;
  const v = ((e.cp ?? 0) * sign) / 100;
  return `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`;
}
