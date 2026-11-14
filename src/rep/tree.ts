// The repertoire as a move tree, built from every recorded path (line + your move).
import { Chess } from 'chess.js';
import { playUci, START_FEN } from '../lib/chess';
import type { Color } from '../lib/types';
import type { RepEntry } from './repertoire';

export interface TreeNode {
  uci: string;
  san: string;
  ply: number;
  /** Line from the start up to and including this move. */
  line: string[];
  /** Set on your own moves: the card this move belongs to, and whether it is your main move there. */
  entry?: RepEntry;
  main?: boolean;
  children: TreeNode[];
}

export function buildTree(entries: Iterable<RepEntry>, color: Color): TreeNode[] {
  const root: TreeNode = { uci: '', san: '', ply: 0, line: [], children: [] };
  const mine = [...entries].filter((e) => e.color === color).sort((a, b) => a.line.length - b.line.length);
  const insert = (path: string[], entry: RepEntry, uci: string) => {
    let node = root;
    const chess = new Chess(START_FEN);
    path.forEach((u, i) => {
      let child = node.children.find((c) => c.uci === u);
      const san = playUci(chess, u).san;
      if (!child) {
        child = { uci: u, san, ply: i + 1, line: path.slice(0, i + 1), children: [] };
        node.children.push(child);
      }
      if (i === path.length - 1 && u === uci) {
        child.entry = entry;
        child.main = entry.moves[0] === uci;
      }
      node = child;
    });
  };
  for (const e of mine) for (const m of e.moves) insert([...e.line, m], e, m);
  // Your main move first, then alternatives; their replies with the most preparation first.
  const size = (n: TreeNode): number => 1 + n.children.reduce((s, c) => s + size(c), 0);
  const sort = (n: TreeNode) => {
    n.children.sort((a, b) => Number(!!b.main) - Number(!!a.main) || (a.entry || b.entry ? 0 : size(b) - size(a)));
    n.children.forEach(sort);
  };
  sort(root);
  return root.children;
}

export const moveNumber = (ply: number) => `${Math.ceil(ply / 2)}${ply % 2 ? '.' : '…'}`;

export function countNodes(nodes: TreeNode[]): number {
  return nodes.reduce((s, n) => s + 1 + countNodes(n.children), 0);
}
