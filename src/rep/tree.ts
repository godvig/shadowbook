// A deck as a move tree. Each position is shown once: a line that transposes into a position already shown ends
// there, marked as a transposition.
import { childrenOf, START_KEY } from './model/deck';
import { cardId } from './model/cards';
import type { Card, Deck, Edge, Glyph } from './model/types';

export interface TreeNode {
  /** The position before this move. */
  from: string;
  uci: string;
  san: string;
  ply: number;
  /** Line from the start up to and including this move. */
  line: string[];
  /** Your move (the deck's side). */
  mine: boolean;
  /** Your main move at that position. */
  main: boolean;
  glyph?: Glyph;
  /** On your main move: its card, for the new / due / learned dot. */
  card?: Card;
  /** The position after this move is shown elsewhere in the tree. */
  transposes: boolean;
  children: TreeNode[];
}

export function buildTree(deck: Pick<Deck, 'color'>, edges: Iterable<Edge>, cards: Map<string, Card>): TreeNode[] {
  const kids = childrenOf(edges);
  const expanded = new Set<string>([START_KEY]);
  const grow = (from: string, line: string[], ply: number): TreeNode[] =>
    (kids.get(from) ?? []).map((e) => {
      const path = [...line, e.uci];
      const main = e.mine && e.rank === 0;
      const transposes = expanded.has(e.to);
      expanded.add(e.to);
      return {
        from,
        uci: e.uci,
        san: e.san,
        ply: ply + 1,
        line: path,
        mine: e.mine,
        main,
        glyph: e.glyph,
        card: main ? cards.get(cardId(deck.color, from, e.uci)) : undefined,
        transposes: transposes && kids.has(e.to),
        children: transposes ? [] : grow(e.to, path, ply + 1),
      };
    });
  return grow(START_KEY, [], 0);
}

export const moveNumber = (ply: number) => `${Math.ceil(ply / 2)}${ply % 2 ? '.' : '…'}`;

export function countNodes(nodes: TreeNode[]): number {
  return nodes.reduce((s, n) => s + 1 + countNodes(n.children), 0);
}
