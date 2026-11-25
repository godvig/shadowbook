// Winning chances as Lichess computes them, on a scale from -1 (Black wins) to 1 (White wins).
// Ported from lila (AGPL-3.0, like this project): ui/lib/src/ceval/winningChances.ts, which cites
// https://github.com/lichess-org/lila/pull/11148 for the constant.
import type { Score } from './types';

const MULTIPLIER = -0.00368208;

const raw = (cp: number) => 2 / (1 + Math.exp(MULTIPLIER * cp)) - 1;

/** Centipawns are capped at ±1000; mate in N counts as (21 − min(10, N)) × 100 centipawns. */
export function winningChances(s: Score): number {
  if (s.over) return s.over === '1-0' ? 1 : s.over === '0-1' ? -1 : 0;
  if (s.mate !== undefined) {
    if (s.mate === 0) return 0; // Not a score lila produces; a finished game is handled by the caller.
    const cp = (21 - Math.min(10, Math.abs(s.mate))) * 100;
    return raw(s.mate > 0 ? cp : -cp);
  }
  return raw(Math.min(Math.max(-1000, s.cp ?? 0), 1000));
}

/** The same, from one side's point of view. */
export const povChances = (color: 'w' | 'b', s: Score) => (color === 'w' ? 1 : -1) * winningChances(s);

/** White's share of the evaluation bar, 0 to 1. */
export const whiteShare = (s: Score) => (winningChances(s) + 1) / 2;

/** "+0.8", "−1.2", "M3" (White mates in 3) or "−M3", always from White's side. */
export function scoreText(s: Score): string {
  if (s.over) return s.over === '1/2-1/2' ? '½-½' : s.over;
  if (s.mate !== undefined) return `${s.mate < 0 ? '−' : ''}M${Math.abs(s.mate)}`;
  const v = (s.cp ?? 0) / 100;
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}`;
}
