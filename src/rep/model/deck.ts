// Editing the move graph of one deck: add, remove and re-rank moves. Pure: every function returns new arrays.
import { Chess } from 'chess.js';
import { fenKey, playUci, START_FEN } from '../../lib/chess';
import type { Color, Deck, DeckSource, Edge } from './types';

export const START_KEY = fenKey(START_FEN);

/** The side to move in a position key. */
export const turnOf = (key: string) => key.split(' ')[1] as Color;

export function newDeck(fields: { name: string; color: Color; source: DeckSource; intro?: string }, now = new Date()): Deck {
  const at = now.toISOString();
  return { id: crypto.randomUUID(), startMove: 1, createdAt: at, updatedAt: at, ...fields };
}

/** Moves from each position, main move first. */
export function childrenOf<T extends Pick<Edge, 'from' | 'rank'>>(edges: Iterable<T>): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const e of edges) {
    const list = out.get(e.from);
    if (list) list.push(e);
    else out.set(e.from, [e]);
  }
  for (const list of out.values()) list.sort((a, b) => a.rank - b.rank);
  return out;
}

/** Full FEN for every position in the deck, the start position included. */
export function positionFens(edges: Iterable<Edge>): Map<string, string> {
  const out = new Map([[START_KEY, START_FEN]]);
  for (const e of edges) if (!out.has(e.to)) out.set(e.to, e.toFen);
  return out;
}

/** The edge for playing `uci` in `fen`, or null when the move is not legal there. */
export function makeEdge(deck: Pick<Deck, 'id' | 'color'>, fen: string, uci: string, rank: number): Edge | null {
  const chess = new Chess(fen);
  const from = fenKey(chess.fen());
  let san: string;
  try {
    san = playUci(chess, uci).san;
  } catch {
    return null;
  }
  return { deckId: deck.id, from, uci, san, to: fenKey(chess.fen()), toFen: chess.fen(), mine: turnOf(from) === deck.color, rank };
}

/** Adds `uci` in `fen` as the next-ranked move there. Returns the same array when it is already in the deck or illegal. */
export function addEdge(edges: Edge[], deck: Pick<Deck, 'id' | 'color'>, fen: string, uci: string): Edge[] {
  const from = fenKey(new Chess(fen).fen());
  const siblings = edges.filter((e) => e.from === from);
  if (siblings.some((e) => e.uci === uci)) return edges;
  const edge = makeEdge(deck, fen, uci, siblings.length);
  return edge ? [...edges, edge] : edges;
}

/** Adds every move of `line` (UCI from the start position) that the deck does not have yet. */
export function addPath(edges: Edge[], deck: Pick<Deck, 'id' | 'color'>, line: string[]): Edge[] {
  const chess = new Chess(START_FEN);
  let out = edges;
  for (const uci of line) {
    out = addEdge(out, deck, chess.fen(), uci);
    playUci(chess, uci);
  }
  return out;
}

/** Makes `uci` the main move at `from`; the others keep their order behind it. */
export function makeMain(edges: Edge[], from: string, uci: string): Edge[] {
  const order = edges.filter((e) => e.from === from).sort((a, b) => a.rank - b.rank);
  const chosen = order.find((e) => e.uci === uci);
  if (!chosen || chosen.rank === 0) return edges;
  const ranks = new Map([chosen, ...order.filter((e) => e !== chosen)].map((e, i) => [e, i]));
  return edges.map((e) => (ranks.has(e) && ranks.get(e) !== e.rank ? { ...e, rank: ranks.get(e)! } : e));
}

/** Removes a move and everything that can no longer be reached from the start position. */
export function removeEdge(edges: Edge[], from: string, uci: string): Edge[] {
  return compactRanks(prune(edges.filter((e) => !(e.from === from && e.uci === uci))));
}

/** Keeps only the moves reachable from the start position. */
export function prune(edges: Edge[]): Edge[] {
  const kids = childrenOf(edges);
  const seen = new Set<string>();
  const stack = [START_KEY];
  while (stack.length) {
    const key = stack.pop()!;
    if (seen.has(key)) continue;
    seen.add(key);
    for (const e of kids.get(key) ?? []) stack.push(e.to);
  }
  return edges.filter((e) => seen.has(e.from));
}

/** Renumbers ranks 0, 1, 2 … per position, keeping their order. */
export function compactRanks(edges: Edge[]): Edge[] {
  const ranks = new Map<Edge, number>();
  for (const list of childrenOf(edges).values()) list.forEach((e, i) => ranks.set(e, i));
  return edges.map((e) => (ranks.get(e) === e.rank ? e : { ...e, rank: ranks.get(e)! }));
}

/** The main line: rank-0 moves from the start position, until a leaf or a repeated position. */
export function mainLine<T extends Pick<Edge, 'from' | 'to' | 'rank'>>(edges: Iterable<T>): T[] {
  const kids = childrenOf(edges);
  const out: T[] = [];
  const seen = new Set([START_KEY]);
  let e = kids.get(START_KEY)?.[0];
  while (e && !seen.has(e.to)) {
    out.push(e);
    seen.add(e.to);
    e = kids.get(e.to)?.[0];
  }
  if (e) out.push(e);
  return out;
}

/**
 * Your moves across all decks, for looking up a position: main moves first (in deck order), then alternatives.
 * `size` is the number of positions where you have a move, per colour.
 */
export function ownMoveIndex(decks: Deck[], edges: Iterable<Edge>) {
  const colorOf = new Map(decks.map((d) => [d.id, d.color]));
  const order = new Map(decks.map((d, i) => [d.id, i]));
  const byPos = new Map<string, Edge[]>();
  for (const e of edges) {
    if (!e.mine || !colorOf.has(e.deckId)) continue;
    const k = `${colorOf.get(e.deckId)}|${e.from}`;
    const list = byPos.get(k);
    if (list) list.push(e);
    else byPos.set(k, [e]);
  }
  const moves = new Map<string, string[]>();
  for (const [k, list] of byPos) {
    list.sort((a, b) => a.rank - b.rank || order.get(a.deckId)! - order.get(b.deckId)!);
    moves.set(k, [...new Set(list.map((e) => e.uci))]);
  }
  const size: Record<Color, number> = { w: 0, b: 0 };
  for (const k of moves.keys()) size[k[0] as Color]++;
  return {
    ownMoves: (color: Color, key: string): string[] => moves.get(`${color}|${key}`) ?? [],
    size: (color: Color) => size[color],
  };
}
export type OwnMoveIndex = ReturnType<typeof ownMoveIndex>;
