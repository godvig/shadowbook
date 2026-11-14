// "Where your book meets theirs": walks your repertoire against an opponent's real move choices.
// Your moves come from the Library (main move), theirs from their games, weighted by how often they chose them.
import { Chess } from 'chess.js';
import { fenKey, playUci, START_FEN } from '../lib/chess';
import type { PlayerBook } from '../lib/book';
import type { Color } from '../lib/types';
import { entryId, type RepEntry } from './repertoire';

export interface Gap {
  /** UCI line from the start to the position where you have no move. */
  line: string[];
  fen: string;
  /** Share of their games (as this colour) that reach the position. */
  reach: number;
  /** Games of theirs that reached it. */
  games: number;
}

export interface Meeting {
  entry: RepEntry;
  reach: number;
  games: number;
}

export interface MeetReport {
  color: Color;
  /** Repertoire positions for this colour. */
  size: number;
  /** Games of theirs with the other colour. */
  theirGames: number;
  /** Share of their games where you stay in your book until they leave theirs. */
  covered: number;
  /** Share that runs into a position where you have no move. */
  uncovered: number;
  gaps: Gap[];
  meetings: Meeting[];
}

const MIN_GAMES = 2;
const MAX_NODES = 4000;

/**
 * You play `color` with your Library; they play the other colour from `book`.
 * Their replies seen fewer than MIN_GAMES times are ignored (noise), but their share still counts as covered
 * only if you have that position — rare sidelines don't produce gaps.
 */
export function meet(entries: Map<string, RepEntry>, book: PlayerBook, color: Color, maxPlies = 32): MeetReport {
  const them: Color = color === 'w' ? 'b' : 'w';
  const side = book.moves[them];
  const theirGames = book.gamesAs[them];
  const size = [...entries.values()].filter((e) => e.color === color).length;
  const gaps = new Map<string, Gap>();
  const meetings = new Map<string, Meeting>();
  let covered = 0;
  let uncovered = 0;
  let nodes = 0;

  const visit = (line: string[], fen: string, reach: number, games: number) => {
    if (++nodes > MAX_NODES) return;
    const chess = new Chess(fen);
    const after = (uci: string) => {
      const c = new Chess(fen);
      playUci(c, uci);
      return c.fen();
    };
    if (chess.isGameOver() || line.length >= maxPlies) {
      covered += reach;
      return;
    }
    if (chess.turn() === color) {
      const entry = entries.get(entryId(color, fen));
      if (!entry) {
        // You never prepared this position, but they reach it.
        uncovered += reach;
        const key = fenKey(fen);
        const g = gaps.get(key);
        if (g) {
          g.reach += reach;
          g.games += games;
        } else gaps.set(key, { line, fen, reach, games });
        return;
      }
      const m = meetings.get(entry.id);
      if (m) {
        m.reach += reach;
        m.games += games;
      } else meetings.set(entry.id, { entry, reach, games });
      visit([...line, entry.moves[0]], after(entry.moves[0]), reach, games);
      return;
    }
    const replies = Object.entries(side[fenKey(fen)] ?? {});
    const total = replies.reduce((s, [, st]) => s + st.n, 0);
    if (!total) {
      // They have left their book; you are still in yours.
      covered += reach;
      return;
    }
    let followed = 0;
    for (const [uci, st] of replies) {
      const share = st.n / total;
      if (st.n < MIN_GAMES) continue;
      followed += share;
      visit([...line, uci], after(uci), reach * share, st.n);
    }
    covered += reach * (1 - followed);
  };

  if (size && theirGames) visit([], START_FEN, 1, theirGames);
  const byReach = <T extends { reach: number }>(a: T, b: T) => b.reach - a.reach;
  return {
    color,
    size,
    theirGames,
    covered,
    uncovered,
    gaps: [...gaps.values()].sort(byReach),
    meetings: [...meetings.values()].sort(byReach),
  };
}

/** Positions to drill before playing them: the ones they actually reach, most likely first. */
export function prepQueue(report: MeetReport, limit = 30, minReach = 0.02): RepEntry[] {
  return report.meetings.filter((m) => m.reach >= minReach).slice(0, limit).map((m) => m.entry);
}
