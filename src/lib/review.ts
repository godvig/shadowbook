import { Chess } from 'chess.js';
import { loadMaia } from './maia';
import { playUci } from './chess';
import type { Color } from './types';

export interface MoveReview {
  ply: number;
  san: string;
  /** Win chance (0–1) for you before and after the move, as Maia judges it at your level. */
  before: number;
  after: number;
  loss: number;
  better?: string;
}

/**
 * Scores each of your moves by how much it changed your win chance, using Maia's
 * value head at your rating. Cheap enough to run in the browser in a second or two.
 */
export async function reviewGame(ucis: string[], you: Color, yourElo: number, botElo: number): Promise<MoveReview[]> {
  const maia = await loadMaia();
  const chess = new Chess();
  const items: { ply: number; san: string; fenBefore: string; fenAfter: string }[] = [];
  ucis.forEach((uci, ply) => {
    const fenBefore = chess.fen();
    const mover: Color = chess.turn();
    const san = playUci(chess, uci).san;
    if (mover === you && !chess.isGameOver()) items.push({ ply, san, fenBefore, fenAfter: chess.fen() });
  });
  if (!items.length) return [];
  const before = await maia.predictBatch(items.map((i) => ({ fen: i.fenBefore, selfElo: yourElo, oppoElo: botElo })));
  const after = await maia.predictBatch(items.map((i) => ({ fen: i.fenAfter, selfElo: botElo, oppoElo: yourElo })));
  return items.map((it, k) => {
    const b = before[k].winProbability;
    const a = 1 - after[k].winProbability;
    return { ply: it.ply, san: it.san, before: b, after: a, loss: Math.max(0, b - a) };
  });
}

/** For the biggest mistakes, asks a strong Maia which move a 2200 would have chosen. */
export async function suggestBetter(fen: string): Promise<string | undefined> {
  const maia = await loadMaia();
  const r = await maia.predict({ fen, selfElo: 2200, temperature: 0, topK: 3 });
  const best = [...r.candidates].sort((x, y) => y.winProbability - x.winProbability)[0];
  if (!best) return undefined;
  const chess = new Chess(fen);
  return playUci(chess, best.uci).san;
}
