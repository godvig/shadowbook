// Stockfish's best move from Lichess's cloud evaluation: evaluations Lichess has already computed and stored, so
// no engine runs here. Only the position (FEN) is sent; each answer is kept for 30 days in the Library's cache.
// https://lichess.org/api#tag/Analysis/operation/apiCloudEval
import { Chess } from 'chess.js';
import { fenKey } from '../lib/chess';

export interface Eval {
  /** The best move, in normal UCI (castling as e1g1, not Lichess's e1h1). */
  best: string;
  /** Centipawns from White's side, or mate in N (negative: Black mates). */
  cp?: number;
  mate?: number;
  depth: number;
}

interface CloudAnswer {
  depth: number;
  pvs: { moves: string; cp?: number; mate?: number }[];
}

interface Cache {
  get(key: string): Promise<{ at: number; value: Eval | null } | undefined>;
  put(key: string, value: { at: number; value: Eval | null }): Promise<void>;
}

const DAY = 86_400_000;
export const KEEP_DAYS = 30;

/** Lichess writes castling as the king taking its own rook (e1h1). */
export function normalUci(fen: string, uci: string): string {
  const chess = new Chess(fen);
  const piece = chess.get(uci.slice(0, 2) as never);
  if (piece?.type !== 'k') return uci;
  const castles: Record<string, string> = { e1h1: 'e1g1', e1a1: 'e1c1', e8h8: 'e8g8', e8a8: 'e8c8' };
  return castles[uci] ?? uci;
}

/**
 * The best move in a position, or null when Lichess has no evaluation for it (it only stores positions that have
 * been analysed). Throws only for network problems, which are not cached.
 */
export async function cloudEval(fen: string, opts: { fetcher?: typeof fetch; cache?: Cache; now?: number; signal?: AbortSignal } = {}): Promise<Eval | null> {
  const now = opts.now ?? Date.now();
  const key = `eval:${fenKey(fen)}`;
  const hit = await opts.cache?.get(key).catch(() => undefined);
  if (hit && now - hit.at < KEEP_DAYS * DAY) return hit.value;
  const res = await (opts.fetcher ?? fetch)(`https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(fen)}`, { signal: opts.signal });
  let value: Eval | null = null;
  if (res.ok) {
    const j = (await res.json()) as CloudAnswer;
    const pv = j.pvs?.[0];
    const first = pv?.moves.split(' ')[0];
    if (first) value = { best: normalUci(fen, first), cp: pv.cp, mate: pv.mate, depth: j.depth };
  } else if (res.status !== 404) {
    // Busy (429) or another error: say nothing now, and ask again next time.
    return null;
  }
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
