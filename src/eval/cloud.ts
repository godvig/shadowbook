// Lichess's cloud evaluation: positions Lichess has already analysed and stored, so no engine runs here.
// Only the position (FEN) is sent. 404 means the cloud has nothing for it.
// https://lichess.org/api#tag/Analysis/operation/apiCloudEval (GET /api/cloud-eval?fen=…&multiPv=…)
import { Chess } from 'chess.js';
import { lichessFetch } from './lichess';
import type { Score } from './types';

export interface CloudEval extends Score {
  best: string;
  depth: number;
  /** The second line's score, when multiPv 2 was asked for and the cloud has it. */
  second?: Score;
}

interface CloudAnswer {
  depth: number;
  pvs: { moves: string; cp?: number; mate?: number }[];
}

/** Lichess writes castling as the king taking its own rook (e1h1). */
export function normalUci(fen: string, uci: string): string {
  const chess = new Chess(fen);
  const piece = chess.get(uci.slice(0, 2) as never);
  if (piece?.type !== 'k') return uci;
  const castles: Record<string, string> = { e1h1: 'e1g1', e1a1: 'e1c1', e8h8: 'e8g8', e8a8: 'e8c8' };
  return castles[uci] ?? uci;
}

const score = (pv: { cp?: number; mate?: number }): Score => (pv.mate !== undefined ? { mate: pv.mate } : { cp: pv.cp });

/**
 * The cloud's evaluation, `null` when it has none (404), `undefined` when Lichess is busy (429) or answers with
 * another error: ask again later, and do not remember that. Throws on network failure.
 */
export async function fetchCloud(fen: string, opts: { multiPv?: number; fetcher?: typeof fetch; signal?: AbortSignal } = {}): Promise<CloudEval | null | undefined> {
  const multi = opts.multiPv && opts.multiPv > 1 ? `&multiPv=${opts.multiPv}` : '';
  // A network failure throws, as before; callers decide whether to retry.
  const res = await lichessFetch(`https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(fen)}${multi}`, { signal: opts.signal }, { fetcher: opts.fetcher });
  if (res.status === 404) return null;
  if (!res.ok) return undefined;
  const j = (await res.json()) as CloudAnswer;
  const [pv, pv2] = j.pvs ?? [];
  const first = pv?.moves.split(' ')[0];
  if (!first) return null;
  return { best: normalUci(fen, first), ...score(pv), depth: j.depth, ...(pv2 ? { second: score(pv2) } : {}) };
}
