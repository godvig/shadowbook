// Move marks from evaluations, as Lichess judges them.
// Thresholds from lila (AGPL-3.0) modules/tree/src/main/Advice.scala at commit 47948db (2026-11-25):
// CpAdvice compares winning chances before and after the move, from the mover's side:
//   a drop of 0.3 or more is a blunder, 0.2 a mistake, 0.1 an inaccuracy.
// MateAdvice covers moves that create a forced mate against the mover or throw one away.
import type { Score } from './types';
import { povChances } from './winChances';

export type Judgement = '?!' | '?' | '??';
/** Computed marks, plus the glyphs a broadcast PGN may carry ($1–$6). */
export type Mark = Judgement | '!' | '!!' | '!?';

export const MARK_NAME: Record<Mark, string> = { '?!': 'Inaccuracy', '?': 'Mistake', '??': 'Blunder', '!': 'Only move', '!!': 'Brilliant (from the broadcast)', '!?': 'Interesting (from the broadcast)' };

const CP_STEPS: [number, Judgement][] = [
  [0.3, '??'],
  [0.2, '?'],
  [0.1, '?!'],
];

/** The mark for a move by `mover`, from the scores before and after it (both from White's side). */
export function judge(mover: 'w' | 'b', before: Score, after: Score): Judgement | null {
  // Checkmate is never a mistake; stalemate (cp 0) is judged like any other draw.
  if (after.over && after.over !== '1/2-1/2') return null;
  if (before.mate === undefined && after.mate === undefined) {
    const delta = povChances(mover, before) - povChances(mover, after);
    return CP_STEPS.find(([d]) => d <= delta)?.[1] ?? null;
  }
  // From the mover's side: positive mate means the mover mates.
  const pov = (s: Score): Score => (mover === 'w' ? s : { cp: s.cp === undefined ? undefined : -s.cp, mate: s.mate === undefined ? undefined : -s.mate });
  const prev = pov(before);
  const next = pov(after);
  const prevCp = prev.cp ?? 0;
  const nextCp = next.cp ?? 0;
  // MateCreated: the mover had no mate against them, now they do.
  if (prev.mate === undefined && next.mate !== undefined && next.mate < 0) return prevCp < -999 ? '?!' : prevCp < -700 ? '?' : '??';
  // MateLost: the mover had a forced mate and let it go.
  if (prev.mate !== undefined && prev.mate > 0) {
    if (next.mate === undefined) return nextCp > 999 ? '?!' : nextCp > 700 ? '?' : '??';
    if (next.mate < 0) return '??';
  }
  return null;
}

/** "Either side up more than about 5 pawns, or a mate found": no "!" there, or every recapture would get one. */
export const decided = (s: Score) => s.mate !== undefined || Math.abs(s.cp ?? 0) > 500;

/**
 * "!" when the played move is the engine's best and the second-best move costs at least the mistake threshold
 * (0.2 in winning chances), in a position that is not already decided. A position with one legal move gets nothing.
 */
export function onlyMove(mover: 'w' | 'b', played: string, before: { best?: string; second?: Score } & Score, legalMoves: number): boolean {
  if (legalMoves < 2 || !before.best || !before.second || before.best !== played || decided(before)) return false;
  return povChances(mover, before) - povChances(mover, before.second) >= 0.2;
}
