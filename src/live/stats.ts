// Match statistics computed from the games and the prediction tallies.
import { percentages, pointsFor, sanMoves, winnerOf } from './match';
import type { LiveGame, Pick } from './types';

export interface GameStat {
  id: number;
  winner: Pick;
  pct: Record<Pick, number>;
  /** The crowd's most picked outcome, or null with no votes or a tie at the top. */
  crowd: Pick | null;
  crowdRight: boolean;
  moves: number;
  firstMove: string | null;
  opening: string | null;
}

export interface MatchStats {
  played: number;
  results: Record<Pick, number>;
  crowdRight: number;
  crowdCalls: number;
  avgMoves: number | null;
  firstMoves: { move: string; count: number }[];
  openings: { name: string; count: number }[];
  games: GameStat[];
  me: { calls: number; correct: number; points: number } | null;
}

const ORDER: Pick[] = ['gukesh', 'draw', 'sindarov'];

function topOf(pct: Record<Pick, number>): Pick | null {
  const sorted = ORDER.map((p) => [p, pct[p]] as const).sort((a, b) => b[1] - a[1]);
  if (!sorted[0][1] || sorted[0][1] === sorted[1][1]) return null;
  return sorted[0][0];
}

function countBy(values: (string | null)[]): { key: string; count: number }[] {
  const m = new Map<string, number>();
  for (const v of values) if (v) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export function matchStats(games: LiveGame[], tally: Record<number, Partial<Record<Pick, number>>>, myPicks?: { game_id: number; pick: Pick }[]): MatchStats {
  const finished = games.filter((g) => g.status === 'finished' && winnerOf(g));
  const stats: GameStat[] = finished.map((g) => {
    const pct = percentages(tally[g.id] ?? {});
    const crowd = topOf(pct);
    const winner = winnerOf(g)!;
    const sans = sanMoves(g.pgn);
    return { id: g.id, winner, pct, crowd, crowdRight: crowd === winner, moves: Math.ceil(sans.length / 2), firstMove: sans[0] ? `1.${sans[0]}` : null, opening: g.opening };
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
    crowdCalls: stats.filter((s) => s.crowd).length,
    avgMoves: withMoves.length ? Math.round(withMoves.reduce((a, s) => a + s.moves, 0) / withMoves.length) : null,
    firstMoves: countBy(stats.map((s) => s.firstMove)).map(({ key, count }) => ({ move: key, count })),
    openings: countBy(stats.map((s) => s.opening)).map(({ key, count }) => ({ name: key, count })),
    games: stats,
    me,
  };
}
