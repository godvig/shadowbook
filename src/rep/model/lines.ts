// Lines: paths from the start position to a leaf of the deck, so that every move is on at least one line.
import { childrenOf, START_KEY, turnOf } from './deck';
import type { Color, Edge } from './types';

/**
 * Enumerates lines depth first, main moves first. Each position is expanded once: a path that reaches a position
 * whose continuation was already enumerated (a transposition) ends there, and so does a path that returns to a
 * position on itself (a cycle).
 */
export function enumerateLines(edges: Iterable<Edge>): Edge[][] {
  const kids = childrenOf(edges);
  const expanded = new Set<string>();
  const lines: Edge[][] = [];
  const walk = (key: string, path: Edge[]) => {
    const next = kids.get(key);
    if (!next?.length || expanded.has(key)) {
      if (path.length) lines.push(path);
      return;
    }
    expanded.add(key);
    for (const e of next) walk(e.to, [...path, e]);
  };
  walk(START_KEY, []);
  return lines;
}

/**
 * For each position where `color` moves: the full-move number and the path (UCI) on the first line that reaches it.
 * This is the move depth that `startMove` compares against.
 */
export function ownPositions(lines: Edge[][], color: Color): Map<string, { move: number; path: string[] }> {
  const out = new Map<string, { move: number; path: string[] }>();
  for (const line of lines) {
    line.forEach((e, ply) => {
      if (turnOf(e.from) === color && !out.has(e.from)) out.set(e.from, { move: Math.floor(ply / 2) + 1, path: line.slice(0, ply).map((x) => x.uci) });
    });
  }
  return out;
}
