// Opening names by position, from lichess-org/chess-openings (CC0-1.0), built by scripts/build-openings.mjs.
// The data is loaded on demand, so the Spar and Match bundles do not carry it.
import { ucisToSanLine } from '../../lib/chess';
import { mainLine } from './deck';
import type { Color, Edge } from './types';

/** fenKey → [eco, name] */
export type OpeningMap = Record<string, [string, string]>;

let loading: Promise<OpeningMap> | null = null;
export function loadOpenings(): Promise<OpeningMap> {
  loading ??= import('./openings.json?raw').then((m) => JSON.parse(m.default) as OpeningMap);
  return loading;
}

/** The deepest named position along a sequence of moves. */
export function deepestOpening(path: Pick<Edge, 'to'>[], map: OpeningMap): { eco: string; name: string } | null {
  let found: [string, string] | undefined;
  for (const e of path) found = map[e.to] ?? found;
  return found ? { eco: found[0], name: found[1] } : null;
}

/**
 * A deck's name: the chapter name if there is one (Lichess defaults such as "Chapter 3" are not), else the
 * deepest named position on the main line, else the PGN's Opening tag, else the first moves.
 */
export function deckName(game: { name?: string; tags: Record<string, string>; edges: Pick<Edge, 'from' | 'to' | 'rank' | 'uci'>[] }, map: OpeningMap, color: Color): string {
  if (game.name) return game.name;
  const main = mainLine(game.edges);
  const named = deepestOpening(main, map);
  if (named) return named.name;
  const tag = game.tags.Opening?.trim();
  if (tag && tag !== '?') return tag;
  if (main.length) return ucisToSanLine(main.slice(0, 6).map((e) => e.uci));
  return color === 'w' ? 'White deck' : 'Black deck';
}
