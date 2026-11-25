// Match statistics computed from the games and the prediction tallies.
import { communityCall, percentages, pointsFor, sanMoves, winnerOf } from './match';
import type { LiveGame, Pick } from './types';

export interface GameStat {
  id: number;
  winner: Pick;
  pct: Record<Pick, number>;
  /**
   * The crowd's call, only when it is clear: at least 2 calls and no tie at the top (the same rule as the
   * Community call column). Null otherwise.
   */
  crowd: Pick | null;
  /** Why there is no clear call: no votes, a single call, or a tie at the top. */
  unclear: 'none' | 'few' | 'tie' | null;
  crowdRight: boolean;
  moves: number;
  firstMove: string | null;
  opening: string | null;
}

export interface MatchStats {
  played: number;
  results: Record<Pick, number>;
  crowdRight: number;
  /** Finished games without a clear crowd call; they count as not right. */
  unclearCalls: number;
  avgMoves: number | null;
  firstMoves: { move: string; count: number }[];
  openings: { name: string; count: number }[];
  games: GameStat[];
  me: { calls: number; correct: number; points: number } | null;
}

function countBy(values: (string | null)[]): { key: string; count: number }[] {
  const m = new Map<string, number>();
  for (const v of values) if (v) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export function matchStats(games: LiveGame[], tally: Record<number, Partial<Record<Pick, number>>>, myPicks?: { game_id: number; pick: Pick }[]): MatchStats {
  const finished = games.filter((g) => g.status === 'finished' && winnerOf(g));
  const stats: GameStat[] = finished.map((g) => {
    const votes = tally[g.id] ?? {};
    const pct = percentages(votes);
    const call = communityCall(votes);
    const crowd = call.kind === 'bar' && call.lead !== 'split' ? call.lead : null;
    const unclear = crowd ? null : call.kind === 'none' ? 'none' : call.kind === 'few' ? 'few' : 'tie';
    const winner = winnerOf(g)!;
    const sans = sanMoves(g.pgn);
    return { id: g.id, winner, pct, crowd, unclear, crowdRight: crowd === winner, moves: Math.ceil(sans.length / 2), firstMove: sans[0] ? `1.${sans[0]}` : null, opening: g.opening };
  });
  const results = { gukesh: 0, draw: 0, sindarov: 0 };
  for (const s of stats) results[s.winner]++;
  const withMoves = stats.filter((s) => s.moves > 0);
  let me: MatchStats['me'] = null;
  if (myPicks) {
    me = { calls: 0, correct: 0, points: 0 };
    for (const s of stats) {
      const mine = myPicks.find((p) => p.game_id === s.id);
      if (!mine) continue;
      me.calls++;
      const pts = pointsFor(mine.pick, s.winner, s.pct[mine.pick] / 100);
      if (pts) me.correct++;
      me.points += pts;
    }
  }
  return {
    played: stats.length,
    results,
    crowdRight: stats.filter((s) => s.crowdRight).length,
    unclearCalls: stats.filter((s) => !s.crowd).length,
    avgMoves: withMoves.length ? Math.round(withMoves.reduce((a, s) => a + s.moves, 0) / withMoves.length) : null,
    firstMoves: countBy(stats.map((s) => s.firstMove)).map(({ key, count }) => ({ move: key, count })),
    openings: countBy(stats.map((s) => s.opening)).map(({ key, count }) => ({ name: key, count })),
    games: stats,
    me,
  };
}
